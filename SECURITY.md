# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **Admin API key** of a Ghost custom integration, stored by Gladys in the
  integration configuration (never written to `/data`, never logged). The
  secret never leaves the container: each request carries a JWT signed with
  it, valid five minutes, sent only to the configured address (or to where it
  redirects, the path of the Ghost Admin API kept, three redirects at most);
- the names and email addresses of new members, passed to Gladys scenes as
  variables of the "New member" trigger, never logged nor stored;
- `/data/ghost-state.json`: the newest member and published post already seen
  (dates and Ghost ids, no secret, no personal data);
- network: HTTP(S) GET requests to Ghost, nothing else; no port is opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to.
