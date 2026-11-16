// -----------------------------------------------------------------------------
// An in-memory Ghost Admin API, behind the `request` seam of the client: the
// endpoints, filters and pagination totals the integration reads, shaped like
// the answers of a real Ghost 6.77 (test/fixtures/ghost). It checks the JWT
// of every request against the Admin API key.
// -----------------------------------------------------------------------------

import { createHmac } from 'node:crypto';

export const BASE = 'http://192.0.2.10:2368';
export const KEY_ID = '6a0000000000000000000001';
export const KEY_SECRET = 'ab'.repeat(32);
export const ADMIN_KEY = `${KEY_ID}:${KEY_SECRET}`;
export const SITE_UUID = '11111111-2222-4333-8444-555555555555';

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');

export class FakeGhost {
  constructor({ now = () => Date.now(), base = BASE } = {}) {
    this.now = now;
    this.base = base;
    this.down = false;
    this.status = null; // forced HTTP status
    this.requests = [];
    this.site = { title: 'My Blog', version: '6.77', site_uuid: SITE_UUID };
    this.members = [];
    this.posts = [];
    this.newsletters = [
      { id: '6a00000000000000000000a1', name: 'Weekly', status: 'active', count: 0 },
    ];
    this.next = 1;
    this.request = this.request.bind(this);
  }

  id() {
    return `6a0000000000000000${String(this.next++).padStart(6, '0')}`;
  }

  addMember({ name = 'Ada', email, status = 'free', at = this.now() } = {}) {
    const member = {
      id: this.id(),
      name,
      email: email ?? `${name.toLowerCase()}@example.com`,
      status,
      created_at: iso(at),
    };
    this.members.push(member);
    this.newsletters[0].count += 1;
    return member;
  }

  addPost({ title = 'Hello', status = 'published', at = this.now() } = {}) {
    const slug = title.toLowerCase().replace(/\W+/g, '-');
    const post = {
      id: this.id(),
      title,
      slug,
      url: `https://blog.example.org/${slug}/`,
      status,
      published_at: status === 'draft' ? null : iso(at),
    };
    this.posts.push(post);
    return post;
  }

  checkToken(header) {
    const token = /^Ghost (.+)$/.exec(header ?? '')?.[1];
    const [head, body, signature] = token?.split('.') ?? [];
    if (!signature) {
      return false;
    }
    const expected = createHmac('sha256', Buffer.from(KEY_SECRET, 'hex'))
      .update(`${head}.${body}`)
      .digest('base64url');
    const { kid } = JSON.parse(Buffer.from(head, 'base64url'));
    const { aud, exp, iat } = JSON.parse(Buffer.from(body, 'base64url'));
    return signature === expected && kid === KEY_ID && aud === '/admin/' && exp - iat <= 300;
  }

  async request(url, { headers = {} } = {}) {
    this.requests.push(url);
    if (this.down) {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }
    if (this.status) {
      const body = JSON.stringify({ errors: [{ message: 'Forced', code: `HTTP_${this.status}` }] });
      return { status: this.status, body };
    }
    const { origin, pathname, searchParams } = new URL(url);
    const prefix = `${this.base}/ghost/api/admin/`;
    if (!`${origin}${pathname}`.startsWith(prefix)) {
      return { status: 404, body: '<html>Not found</html>' };
    }
    if (!this.checkToken(headers.authorization)) {
      return {
        status: 401,
        body: JSON.stringify({ errors: [{ message: 'Invalid token', code: 'INVALID_JWT' }] }),
      };
    }
    const resource = pathname.slice('/ghost/api/admin/'.length).split('/')[0];
    const json = (body) => ({ status: 200, body: JSON.stringify(body) });
    if (resource === 'site') {
      return json({ site: { ...this.site, url: 'https://blog.example.org/' } });
    }
    const filter = searchParams.get('filter') ?? '';
    const limit = Number(searchParams.get('limit') ?? 15);
    const page = (items, key) => {
      const order = searchParams.get('order') ?? '';
      const field = order.split(' ')[0];
      const sorted = field
        ? [...items].sort((a, b) => (b[field] ?? '').localeCompare(a[field] ?? ''))
        : items;
      return json({
        [key]: sorted.slice(0, limit),
        meta: { pagination: { page: 1, limit, pages: 1, total: items.length } },
      });
    };
    if (resource === 'members') {
      let items = this.members;
      const status = /^status:(\w+)$/.exec(filter)?.[1];
      const after = /^created_at:>'(.+)'$/.exec(filter)?.[1];
      if (status) {
        items = items.filter((m) => m.status === status);
      } else if (after) {
        const since = Date.parse(`${after.replace(' ', 'T')}Z`);
        items = items.filter((m) => Date.parse(m.created_at) > since);
      }
      return page(items, 'members');
    }
    if (resource === 'posts') {
      const status = /^status:(\w+)$/.exec(filter)?.[1];
      return page(
        this.posts.filter((p) => p.status === status),
        'posts',
      );
    }
    if (resource === 'newsletters') {
      return json({
        newsletters: this.newsletters
          .filter((n) => n.status === 'active')
          .map((n) => ({ id: n.id, name: n.name, status: n.status, count: { members: n.count } })),
        meta: { pagination: { page: 1, limit: 50, pages: 1, total: 1 } },
      });
    }
    return { status: 404, body: '{}' };
  }
}
