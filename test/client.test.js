// -----------------------------------------------------------------------------
// The Ghost client: the JWT of the Admin API key, the configuration parsing,
// the answers of a real Ghost 6.77 (test/fixtures/ghost), errors and redirects.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { missingCredentials, normalizeConfig, parseServerUrl } from '../src/config.js';
import {
  ERROR_KINDS,
  GhostClient,
  GhostError,
  adminToken,
  nqlDate,
  normalizeMember,
  normalizeNewsletter,
  normalizePost,
} from '../src/ghost/client.js';
import { ADMIN_KEY, BASE, KEY_ID, KEY_SECRET } from './helpers/fakeGhost.js';

const fixture = JSON.parse(
  await readFile(new URL('./fixtures/ghost/ghost-6.77.json', import.meta.url), 'utf8'),
);

const NOW = Date.UTC(2026, 10, 15, 21, 0, 0);

test('the JWT is HS256, signed with the hex secret, five minutes, audience /admin/', () => {
  const token = adminToken(ADMIN_KEY, NOW);
  const [head, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(head, 'base64url')), {
    alg: 'HS256',
    typ: 'JWT',
    kid: KEY_ID,
  });
  assert.deepEqual(JSON.parse(Buffer.from(body, 'base64url')), {
    iat: NOW / 1000,
    exp: NOW / 1000 + 300,
    aud: '/admin/',
  });
  const expected = createHmac('sha256', Buffer.from(KEY_SECRET, 'hex'))
    .update(`${head}.${body}`)
    .digest('base64url');
  assert.equal(signature, expected);
  assert.throws(() => adminToken('not-a-key', NOW), GhostError);
});

test('addresses: bare host on https, admin pages dropped, sub-directory kept', () => {
  assert.equal(parseServerUrl('blog.example.org'), 'https://blog.example.org');
  assert.equal(
    parseServerUrl(' https://blog.example.org/ghost/#/dashboard '),
    'https://blog.example.org',
  );
  assert.equal(parseServerUrl('http://192.0.2.10:2368/'), 'http://192.0.2.10:2368');
  assert.equal(parseServerUrl('https://example.org/blog/ghost/'), 'https://example.org/blog');
  assert.equal(parseServerUrl('https://user:pass@example.org'), null);
  assert.equal(parseServerUrl('ftp://example.org'), null);
  assert.equal(parseServerUrl(''), '');
});

test('the configuration: what is missing, a Content API key told apart', () => {
  assert.equal(missingCredentials(normalizeConfig({})), 'noUrl');
  assert.equal(missingCredentials(normalizeConfig({ url: 'ftp://x' })), 'invalidUrl');
  assert.equal(missingCredentials(normalizeConfig({ url: BASE })), 'noKey');
  assert.equal(
    missingCredentials(normalizeConfig({ url: BASE, admin_api_key: '0123456789abcdef01234567' })),
    'invalidKey',
  );
  const config = normalizeConfig({ url: BASE, admin_api_key: ` ${ADMIN_KEY}\n` });
  assert.equal(missingCredentials(config), null);
  assert.equal(config.key, ADMIN_KEY);
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '60' }).pollIntervalMs, 60_000);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 300_000);
});

test('NQL dates are UTC, quoted, to the second', () => {
  assert.equal(nqlDate(NOW), "'2026-11-15 21:00:00'");
});

test('the answers of a real Ghost 6.77 are understood', () => {
  const members = fixture.members.members.map(normalizeMember);
  assert.equal(members.length, 3);
  assert.deepEqual(Object.keys(members[0]).sort(), ['createdAt', 'email', 'id', 'name', 'status']);
  assert.equal(members[0].status, 'free');
  assert.ok(members.every((m) => m.email.endsWith('@example.com')));
  const posts = fixture.posts.posts.map(normalizePost);
  assert.equal(posts[0].title, 'Hello world');
  assert.equal(posts[0].url, 'https://blog.example.org/hello-world/');
  assert.equal(fixture.posts.meta.pagination.total, 3);
  assert.deepEqual(fixture.newsletters.newsletters.map(normalizeNewsletter), [
    { id: fixture.newsletters.newsletters[0].id, name: 'Test Blog', subscribers: 3 },
  ]);
  assert.equal(normalizePost({ id: 'x', title: 'Draft', published_at: null }), null);
  assert.equal(normalizeMember({ id: 'x' }), null);
});

/** A client whose requests are answered by `answer(url, headers)`. */
const clientWith = (answer) =>
  new GhostClient({ url: BASE, key: ADMIN_KEY, now: () => NOW, request: answer });

test('a snapshot from the real answers: counts from the pagination totals', async () => {
  const requests = [];
  const client = clientWith(async (url, { headers }) => {
    requests.push(url);
    assert.match(headers.authorization, /^Ghost [\w-]+\.[\w-]+\.[\w-]+$/);
    assert.equal(headers['accept-version'], 'v5.0');
    const { pathname, searchParams } = new URL(url);
    const filter = searchParams.get('filter');
    let body;
    if (pathname.endsWith('/site/')) {
      body = fixture.site;
    } else if (pathname.endsWith('/newsletters/')) {
      body = fixture.newsletters;
    } else if (pathname.endsWith('/members/') && !filter) {
      body = fixture.members;
    } else if (pathname.endsWith('/posts/') && filter === 'status:published') {
      body = fixture.posts;
    } else {
      body = fixture.count; // total 1
    }
    return { status: 200, body: JSON.stringify(body) };
  });
  const snapshot = await client.snapshot();
  assert.equal(requests.length, 9, 'nine requests per reading');
  assert.equal(snapshot.site.version, '6.77');
  assert.match(snapshot.site.uuid, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    { ...snapshot.members, recent: snapshot.members.recent.length },
    { total: 3, free: 1, paid: 2, new24h: 1, new7d: 1, recent: 3 },
  );
  assert.equal(snapshot.posts.published, 3);
  assert.equal(snapshot.posts.drafts, 1);
  assert.equal(snapshot.newsletters[0].subscribers, 3);
  assert.ok(
    requests.some((url) =>
      decodeURIComponent(url).includes("filter=created_at:>'2026-11-14 21:00:00'"),
    ),
  );
});

test('errors: key refused, rate limit, not Ghost, unreachable, certificate', async () => {
  const kindOf = async (answer) => {
    try {
      await clientWith(answer).site();
    } catch (err) {
      assert.ok(err instanceof GhostError);
      assert.ok(!err.message.includes(KEY_SECRET));
      return err.kind;
    }
    return null;
  };
  const invalidJwt = JSON.stringify({
    errors: [{ message: 'Invalid token', code: 'INVALID_JWT' }],
  });
  assert.equal(await kindOf(async () => ({ status: 401, body: invalidJwt })), ERROR_KINDS.AUTH);
  // A proxy or a firewall in front of Ghost: not the key.
  assert.equal(await kindOf(async () => ({ status: 403, body: '<html>' })), ERROR_KINDS.HTTP);
  assert.equal(await kindOf(async () => ({ status: 429, body: '' })), ERROR_KINDS.RATE_LIMIT);
  assert.equal(await kindOf(async () => ({ status: 404, body: '' })), ERROR_KINDS.NOT_GHOST);
  assert.equal(await kindOf(async () => ({ status: 200, body: '<html>' })), ERROR_KINDS.NOT_GHOST);
  assert.equal(await kindOf(async () => ({ status: 200, body: '{}' })), ERROR_KINDS.NOT_GHOST);
  assert.equal(await kindOf(async () => ({ status: 502, body: '' })), ERROR_KINDS.HTTP);
  const refused = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ECONNREFUSED' },
  });
  assert.equal(
    await kindOf(async () => {
      throw refused;
    }),
    ERROR_KINDS.UNREACHABLE,
  );
  const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  const err = await clientWith(async () => {
    throw timeout;
  })
    .site()
    .catch((e) => e);
  assert.equal(err.kind, ERROR_KINDS.UNREACHABLE);
  assert.equal(err.message, 'TimeoutError');
  const tls = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' },
  });
  assert.equal(
    await kindOf(async () => {
      throw tls;
    }),
    ERROR_KINDS.TLS,
  );
});

test('a redirect keeping the API path moves the base; any other is refused', async () => {
  const seen = [];
  const client = clientWith(async (url) => {
    seen.push(url);
    if (url.startsWith('http://')) {
      return { status: 301, body: '', location: url.replace('http://', 'https://') };
    }
    return { status: 200, body: JSON.stringify(fixture.site) };
  });
  await client.site();
  await client.site();
  assert.deepEqual(seen, [
    `${BASE}/ghost/api/admin/site/`,
    'https://192.0.2.10:2368/ghost/api/admin/site/',
    'https://192.0.2.10:2368/ghost/api/admin/site/',
  ]);

  const refusedTo = async (location, from = BASE) => {
    const client = new GhostClient({
      url: from,
      key: ADMIN_KEY,
      now: () => NOW,
      request: async () => ({ status: 301, body: '', location }),
    });
    return (await client.site().catch((e) => e)).kind === ERROR_KINDS.REDIRECT;
  };
  assert.ok(await refusedTo('https://login.example.net/'), 'away from the API');
  assert.ok(await refusedTo('https://other.example.net/ghost/api/admin/site/'), 'another host');
  assert.ok(
    await refusedTo('http://blog.example.org/ghost/api/admin/site/', 'https://blog.example.org'),
    'a downgrade to http',
  );

  // The admin domain of Ghost(Pro) is followed.
  const pro = new GhostClient({
    url: 'https://blog.example.org',
    key: ADMIN_KEY,
    now: () => NOW,
    request: async (url) =>
      url.startsWith('https://blog.example.org')
        ? { status: 301, body: '', location: 'https://myblog.ghost.io/ghost/api/admin/site/' }
        : { status: 200, body: JSON.stringify(fixture.site) },
  });
  await pro.site();
  assert.equal(pro.base, 'https://myblog.ghost.io/ghost/api/admin');

  let hops = 0;
  const loop = new GhostClient({
    url: 'https://blog.example.org',
    key: ADMIN_KEY,
    now: () => NOW,
    request: async (url) => {
      hops += 1;
      return { status: 301, body: '', location: url };
    },
  });
  await assert.rejects(loop.site(), { kind: ERROR_KINDS.REDIRECT });
  assert.equal(hops, 4);
});
