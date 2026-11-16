# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue or pull request for them.

Use GitHub private vulnerability reporting: open the Security tab of [infinitnet/cookieless-analytics](https://github.com/infinitnet/cookieless-analytics/security) and choose "Report a vulnerability" ([direct link](https://github.com/infinitnet/cookieless-analytics/security/advisories/new)). This is the only reporting channel; there is no email address for reports. Include the plugin version, the EmDash version, what you observed and the steps to reproduce it. Do not include real visitor data or credentials from a live site.

You will get an acknowledgement, and the advisory stays private until a fixed version is released. Credit is given in the advisory if you want it.

## Supported versions

| Version | Supported |
|---|---|
| 1.x | Yes: the latest 1.x release receives security fixes |

## Security model in short

- **Keys are hashed.** Agent API keys are shown once and stored as a prefix and a SHA-256 hash. Share tokens are 256 bit secrets stored the same way and compared in constant time.
- **`X-Api-Key`, and 404 on failure.** The agent API reads the key only from the `X-Api-Key` header, never from the query string. A missing, wrong, revoked, expired or out of scope key gets the same 404 as a route that does not exist. Scopes are narrow: there is no scope for settings, keys, deletion or raw visitor data.
- **Admin routes use the host's permissions.** Reading needs `plugins:read`, changing anything needs `plugins:manage`, and the host's own CSRF rule applies. The editor panel needs the Editor role.
- **Outbound requests go through `ctx.http`** with an exact `allowedHosts` list (the Search providers' hosts and, for a multi-site master, the exact hosts you configure). The plugin never uses a global `fetch`. Secrets for the Search providers are encrypted with `EMDASH_ENCRYPTION_KEY`, and satellite keys are read from environment variables when needed and are never stored, logged or returned.
- **Client site keys are public by nature.** A key in a snippet only authorises "accept page views for this site from these registered https hosts". It can be paused or regenerated at once, and it cannot read anything.
- **Share tokens and passwords.** A shared page is read only, needs no script and loads nothing. A password is verified with PBKDF2-SHA-256 (10,000 iterations, a random salt plus the link secret), sent with HTTP Basic authentication over TLS, never stored, logged or echoed, and locks the link for 15 minutes after 10 wrong attempts. Pages are marked `noindex`, `no-referrer` and `no-store` when protected. Add a Cloudflare rate limiting rule on the share path as the hard bound.
- **Input limits.** An 8 KB body cap, per session and per visitor rate caps, length caps on every stored string, HTML escaping on every render and SQL identifiers taken from fixed maps.
- **No telemetry.** The plugin makes no request to its author or to any third party. It contacts the Search providers you connect, your mail provider through the host when you schedule an email, and the satellite sites you configure, nothing else.
- **Privacy by design.** Nothing is written to the visitor's device, and the visitor key is a daily rotating salted hash that cannot be linked across days; see [docs/privacy.md](docs/privacy.md).

Operators should keep EmDash up to date, set `EMDASH_ENCRYPTION_KEY` before connecting Search, use the Free plan limits in [docs/limits.md](docs/limits.md) as a guide, and add a rate limiting rule for the event path and the share path.
