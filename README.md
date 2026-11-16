# Ghost for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the figures of your [Ghost](https://ghost.org/) blog — self-hosted
or on Ghost(Pro) — into Gladys.

- **Devices**: the blog (online, Ghost version), its members (total, free,
  paid, new in 24 hours and 7 days), its posts (published, drafts, scheduled,
  the latest one and its date) and the subscribers of each active newsletter.
- **Scene triggers**: new member (optionally for a plan: free, paid,
  complimentary), post published (right away or at its scheduled time).
- **Scene action**: read the figures of the blog, with a ready-made sentence
  for a message.
- **Dashboard widget**: members, paid, new this week, posts and the latest
  post at a glance.
- Texts in English, French, German and Spanish.

Tested against a real self-hosted Ghost 6.77 (Docker, SQLite): custom
integration, free members, published, draft and scheduled posts, a wrong key,
a stopped server. Developed without a Ghost(Pro) account nor Stripe (paid
members not tested): feedback welcome on
[the issues](https://github.com/guim31/gladys-ghost/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- A Ghost 5 or 6 blog reachable from Gladys, and the **Admin API key** of a
  custom integration (Ghost **Settings → Integrations → Add custom
  integration**).

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-ghost`. Then open its configuration, fill in
the address of the blog and the Admin API key, and add the devices from the
Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

At the chosen interval (5 minutes by default), the container reads the Admin
API of Ghost with nine GET requests, whatever the size of the blog: `/site/`,
`/members/` (the newest 20, the totals of free members and of members created
in the last 24 hours and 7 days, from `meta.pagination.total`), `/posts/` (the
newest 10 published, the totals of drafts and scheduled posts) and
`/newsletters/` with their member counts. Each request carries a JWT (HS256,
five minutes) signed with the key using `node:crypto`: no dependency besides
the Gladys SDK. The states of the devices added to Gladys are published when
they change; the newest member and post already seen are kept in `/data`, so a
restart announces nothing twice and misses nothing.

## Limits

- Read-only, one blog per configuration.
- "Paid members" counts paid and complimentary plans together.
- A back-dated post does not fire "Post published"; at most 20 new members and
  10 new posts are announced per reading.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the Ghost
Admin API.

## Credits

- [Ghost](https://github.com/TryGhost/Ghost) by the Ghost Foundation and
  contributors (MIT): the API answers in `test/fixtures/ghost` come from its
  official Docker image (anonymized), and the logo of the cover from its brand
  assets.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-umami](https://github.com/guim31/gladys-umami).

Not affiliated with the Ghost Foundation.

## License

Apache-2.0, see [LICENSE](LICENSE).
