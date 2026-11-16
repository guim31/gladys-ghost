// -----------------------------------------------------------------------------
// Ghost client: the Admin API of Ghost 5 and 6 (self-hosted or Ghost(Pro)),
// read-only. Checked against a real Ghost 6.77 (SQLite) in Docker.
//
//   GET /ghost/api/admin/site/                        title, url, version, site uuid
//   GET /members/?limit=20&order=created_at desc      the total, and the newest members
//   GET /members/?limit=1&filter=status:free          free members (pagination total)
//   GET /members/?limit=1&filter=created_at:>'…'      new members, 24 hours and 7 days
//   GET /posts/?limit=10&filter=status:published&order=published_at desc
//                                                     the total, and the newest posts
//   GET /posts/?limit=1&filter=status:draft|scheduled drafts and scheduled posts
//   GET /newsletters/?filter=status:active&include=count.members
//
// Counts come from `meta.pagination.total`: one member or post per request,
// whatever the size of the blog.
//
// Authentication: a custom integration's Admin API key, `<id>:<secret>`. Each
// request carries a JWT (HS256, signed with the hex-decoded secret, `kid` the
// key id, audience `/admin/`, five minutes), made here with node:crypto.
//
// Redirects are followed by hand, three at most, the path of the API kept,
// only to https:// on the same host or a Ghost(Pro) admin domain: only the
// short-lived JWT travels, never the secret.
// -----------------------------------------------------------------------------

import { createHmac } from 'node:crypto';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // Admin API key refused
  RATE_LIMIT: 'rate_limit', // HTTP 429
  NOT_GHOST: 'not_ghost', // something answers, not the Ghost Admin API
  REDIRECT: 'redirect', // too many redirects, or to an unusable address
  HTTP: 'http', // any other HTTP error
});

export class GhostError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'GhostError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const API_PATH = '/ghost/api/admin';
// The version of the API asked for: Ghost 5 and 6 both answer it.
export const ACCEPT_VERSION = 'v5.0';
export const MAX_BODY_BYTES = 8 * 1024 * 1024;
export const RECENT_MEMBERS = 20;
export const RECENT_POSTS = 10;
const MAX_REDIRECTS = 3;
const TOKEN_LIFETIME_S = 300;

/** An Admin API key: `<24 hex id>:<64 hex secret>`. */
export const ADMIN_KEY = /^([0-9a-f]{24}):([0-9a-f]{64})$/i;

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Ghost
 * (test/helpers/fakeGhost.js).
 * @returns {Promise<{ status: number, body: string, location?: string }>}
 */
export async function httpRequest(url, { headers = {}, timeoutMs = 15_000 } = {}) {
  const response = await fetch(url, {
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error('Response too large');
  }
  return {
    status: response.status,
    body: await response.text(),
    location: response.headers.get('location') ?? undefined,
  };
}

/** The JWT of an Admin API key, valid five minutes from `nowMs`. */
export function adminToken(key, nowMs) {
  const match = ADMIN_KEY.exec(key);
  if (!match) {
    throw new GhostError(ERROR_KINDS.AUTH, 'Malformed Admin API key');
  }
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(nowMs / 1000);
  const head = encode({ alg: 'HS256', typ: 'JWT', kid: match[1] });
  const body = encode({ iat, exp: iat + TOKEN_LIFETIME_S, aud: '/admin/' });
  const signature = createHmac('sha256', Buffer.from(match[2], 'hex'))
    .update(`${head}.${body}`)
    .digest('base64url');
  return `${head}.${body}.${signature}`;
}

/** A date for an NQL filter: `'YYYY-MM-DD HH:mm:ss'`, UTC (how Ghost stores it). */
export const nqlDate = (ms) => `'${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')}'`;

const text = (value, max = 255) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const time = (value) => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : null;
};

/** The `errors[0].code` of a Ghost error answer (or its type), '' otherwise. */
function ghostErrorCode(body) {
  try {
    const error = JSON.parse(body)?.errors?.[0];
    return String(error?.code || error?.type || '');
  } catch {
    return '';
  }
}

function total(data) {
  const value = data?.meta?.pagination?.total;
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function normalizeMember(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') {
    return null;
  }
  const createdAt = time(raw.created_at);
  if (createdAt === null) {
    return null;
  }
  return {
    id: raw.id,
    name: text(raw.name),
    email: text(raw.email),
    // free, paid or comped (complimentary paid plan)
    status: ['free', 'paid', 'comped'].includes(raw.status) ? raw.status : 'free',
    createdAt,
  };
}

export function normalizePost(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') {
    return null;
  }
  const publishedAt = time(raw.published_at);
  if (publishedAt === null) {
    return null;
  }
  return {
    id: raw.id,
    title: text(raw.title) || text(raw.slug) || raw.id,
    url: text(raw.url, 2048),
    publishedAt,
  };
}

export function normalizeNewsletter(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  const count = raw.count?.members;
  return {
    id: raw.id,
    name: text(raw.name) || raw.id,
    subscribers: Number.isInteger(count) && count >= 0 ? count : 0,
  };
}

export class GhostClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of the blog (`http(s)://host[/path]`)
   * @param {string} options.key Admin API key, `<id>:<secret>`
   * @param {typeof httpRequest} [options.request] test seam
   * @param {() => number} [options.now] clock of the JWT
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, key, request, now, timeoutMs = 15_000 }) {
    this.base = `${url}${API_PATH}`;
    this.key = key;
    this.request = request ?? httpRequest;
    this.now = now ?? (() => Date.now());
    this.timeoutMs = timeoutMs;
  }

  async send(url) {
    try {
      return await this.request(url, {
        headers: {
          accept: 'application/json',
          'accept-version': ACCEPT_VERSION,
          authorization: `Ghost ${adminToken(this.key, this.now())}`,
        },
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      if (err instanceof GhostError) {
        throw err;
      }
      // A timeout is a DOMException whose numeric `code` says nothing.
      const code = err.cause?.code ?? (typeof err.code === 'string' ? err.code : undefined);
      if (TLS_CODES.has(code)) {
        throw new GhostError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new GhostError(ERROR_KINDS.UNREACHABLE, code ?? err.name ?? err.message);
    }
  }

  /**
   * GET an endpoint of the Admin API (`/members/?…`), JSON.
   * A redirect that keeps the path of the API moves the base for good.
   */
  async get(path) {
    let url = `${this.base}${path}`;
    for (let hop = 0; ; hop += 1) {
      const response = await this.send(url);
      const { status } = response;
      if (status >= 300 && status < 400) {
        const next = this.redirect(url, path, response.location, hop);
        url = next;
        continue;
      }
      if ((status === 401 || status === 403) && ghostErrorCode(response.body)) {
        // Ghost says why (INVALID_JWT, an expired token…); a proxy or a
        // firewall in front of it answers without its error format.
        throw new GhostError(
          ERROR_KINDS.AUTH,
          `Admin API key refused (HTTP ${status}, ${ghostErrorCode(response.body)})`,
          { status },
        );
      }
      if (status === 429) {
        throw new GhostError(ERROR_KINDS.RATE_LIMIT, 'Too many requests (HTTP 429)', { status });
      }
      if (status === 404) {
        throw new GhostError(ERROR_KINDS.NOT_GHOST, 'No Ghost Admin API here (HTTP 404)', {
          status,
        });
      }
      if (status < 200 || status >= 300) {
        throw new GhostError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
      }
      let data;
      try {
        data = JSON.parse(response.body);
      } catch {
        data = null;
      }
      if (!data || typeof data !== 'object') {
        throw new GhostError(ERROR_KINDS.NOT_GHOST, 'The answer is not JSON');
      }
      return data;
    }
  }

  redirect(from, path, location, hop) {
    let target;
    try {
      target = new URL(location ?? '', from);
    } catch {
      target = null;
    }
    const href = target?.href.split('?')[0] ?? '';
    const suffix = `${API_PATH}${path.split('?')[0]}`;
    const source = new URL(from);
    // The JWT opens the whole Admin API for five minutes: it follows an
    // upgrade to https:// on the same host, or the admin domain of Ghost(Pro),
    // never a downgrade nor another host.
    const allowed =
      target &&
      target.protocol === 'https:' &&
      (target.hostname === source.hostname || target.hostname.endsWith('.ghost.io'));
    if (
      hop >= MAX_REDIRECTS ||
      !allowed ||
      target.username ||
      target.password ||
      !href.endsWith(suffix)
    ) {
      throw new GhostError(ERROR_KINDS.REDIRECT, 'Redirected away from the Admin API');
    }
    // Same API elsewhere (https://, another host): keep it for the next requests.
    this.base = href.slice(0, href.length - suffix.length) + API_PATH;
    return `${this.base}${path}`;
  }

  /** The blog: title, url, version, uuid. */
  async site() {
    const site = (await this.get('/site/')).site;
    if (!site || typeof site !== 'object' || typeof site.version !== 'string') {
      throw new GhostError(ERROR_KINDS.NOT_GHOST, 'The site answer holds no version');
    }
    return {
      title: text(site.title) || 'Ghost',
      url: text(site.url, 2048),
      version: text(site.version, 40),
      uuid: text(site.site_uuid, 64),
    };
  }

  async count(resource, filter) {
    const data = await this.get(
      `/${resource}/?limit=1&fields=id&filter=${encodeURIComponent(filter)}`,
    );
    const value = total(data);
    if (value === null) {
      throw new GhostError(ERROR_KINDS.NOT_GHOST, `No pagination in the ${resource} answer`);
    }
    return value;
  }

  /** The member counts, and the newest members (newest first). */
  async members(nowMs) {
    const data = await this.get(
      `/members/?limit=${RECENT_MEMBERS}&order=${encodeURIComponent('created_at desc')}`,
    );
    const all = total(data);
    if (all === null || !Array.isArray(data.members)) {
      throw new GhostError(ERROR_KINDS.NOT_GHOST, 'No members in the answer');
    }
    const free = await this.count('members', 'status:free');
    const day = await this.count('members', `created_at:>${nqlDate(nowMs - 86_400_000)}`);
    const week = await this.count('members', `created_at:>${nqlDate(nowMs - 7 * 86_400_000)}`);
    return {
      total: all,
      free,
      // paid and complimentary plans
      paid: Math.max(0, all - free),
      new24h: day,
      new7d: week,
      recent: data.members.map(normalizeMember).filter(Boolean),
    };
  }

  /** The post counts, and the newest published posts (newest first). */
  async posts() {
    const data = await this.get(
      `/posts/?limit=${RECENT_POSTS}&fields=id,title,slug,url,published_at` +
        `&filter=status:published&order=${encodeURIComponent('published_at desc')}`,
    );
    const published = total(data);
    if (published === null || !Array.isArray(data.posts)) {
      throw new GhostError(ERROR_KINDS.NOT_GHOST, 'No posts in the answer');
    }
    return {
      published,
      drafts: await this.count('posts', 'status:draft'),
      scheduled: await this.count('posts', 'status:scheduled'),
      recent: data.posts.map(normalizePost).filter(Boolean),
    };
  }

  /** The active newsletters and their subscribers. */
  async newsletters() {
    const data = await this.get(
      '/newsletters/?limit=50&filter=status:active&include=count.members',
    );
    if (!Array.isArray(data.newsletters)) {
      throw new GhostError(ERROR_KINDS.NOT_GHOST, 'No newsletters in the answer');
    }
    return data.newsletters.map(normalizeNewsletter).filter(Boolean);
  }

  /** Everything the integration shows, in one go. */
  async snapshot() {
    const nowMs = this.now();
    const site = await this.site();
    const members = await this.members(nowMs);
    const posts = await this.posts();
    const newsletters = await this.newsletters();
    return { site, members, posts, newsletters };
  }
}
