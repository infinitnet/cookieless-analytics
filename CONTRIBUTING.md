# Contributing

Thanks for helping with Cookieless Analytics by Infinitnet. This page covers the license of contributions, the setup, the scripts, what a change has to test and the rules it has to follow. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## License of contributions

The project is licensed under Apache-2.0 ([LICENSE](LICENSE), [NOTICE](NOTICE)). Inbound equals outbound: under section 5 of the license, anything you submit for inclusion is licensed under the same Apache-2.0 terms, with no further agreement to sign. Only submit work you have the right to license that way. Do not add copyright headers to files; the holder and the attribution live in LICENSE and NOTICE.

## Setup

You need Node 22.18 or later (the generators use Node's built-in type stripping; CI runs Node 24) and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

On a small machine the TypeScript and test runs can run out of memory. Give Node a smaller heap limit so it fails fast instead of swapping:

```sh
NODE_OPTIONS=--max-old-space-size=512 pnpm test
```

## Scripts

| Script | What it does |
|---|---|
| `pnpm typecheck` | Type checks the core, the tests and the admin bundle, then the panel type check. |
| `pnpm test` | Runs the test suite once (`vitest run`). |
| `pnpm build` | Builds the package into `dist`. |
| `pnpm build:client` | Rebuilds the page script and embeds it in `src/client/generated.ts`. Run it after every change to `src/client`. |
| `pnpm data:agents` | Regenerates the bot exclusion data from its sources. |
| `pnpm openapi` | Regenerates `docs/openapi.json`; `node scripts/build-openapi.mjs --check` fails when it is out of date. |
| `pnpm docs:settings` | Regenerates `docs/settings.md` from the settings schema; `node scripts/build-settings-doc.mjs --check` fails when it is out of date. |
| `pnpm lint:package` | Runs `publint` and `attw` on the packed package. |

Before you open a pull request run `pnpm typecheck`, `pnpm test`, `pnpm build` and the two `--check` commands. CI runs the same steps on every pull request, plus `git diff --exit-code -- dist` (commit the rebuilt `dist` when `src` changed) and the package checks. The full list for a release is in [docs/release.md](docs/release.md).

## Registry companion

`packages/companion` holds Cookieless Analytics Companion, a sandboxed EmDash plugin for the plugin registry. It is a private workspace package with its own version, tests and dependencies, installed by the same `pnpm install` at the root. Its commits use the scope `companion`. Run its checks from the root:

```sh
pnpm --filter @infinitnet/cookieless-analytics-companion run validate
pnpm --filter @infinitnet/cookieless-analytics-companion run typecheck
pnpm --filter @infinitnet/cookieless-analytics-companion run test
pnpm --filter @infinitnet/cookieless-analytics-companion run bundle
```

CI runs the same four in the `CI` job. The repository rules below apply to it as well.

## Tests

- New logic comes with a test: a parser, a branch, a limit, a report column, a route. A fix comes with a test that fails without it.
- New UI text goes into the copy test (`tests/copy.test.ts`): no em or en dashes, neutral words.
- No `.skip`, `.only` or placeholder tests in a pull request.
- Tests run offline against fakes and in-memory SQLite; see the rules below.

## Rules

- **No em dashes or en dashes.** Anywhere: code, comments, docs, test names, commit messages. Use a comma, a colon or parentheses. A test fails on them.
- **Synthetic fixtures only.** Every host in a test, a doc or an example is `example.com`, `example.org`, `example.net` or `localhost`. Numbers are invented. Never paste real traffic, real order data, real credentials or a real site name.
- **Neutral served output.** Anything the plugin serves to a visitor (the script, its paths, the attribute names, the shared pages, the events endpoint) must not contain the words analytics, track, tracker, tracking, pixel, telemetry, collect, stats or beacon (`navigator.sendBeacon` is the one allowed use of the last). The list is `FORBIDDEN_PUBLIC_WORDS` in `src/contract.ts`; the neutral footprint tests check the served output. A configured path or namespace that contains one of these words falls back to the default.
- **Commit style:** `type(scope): summary`, lower case, no full stop, for example `fix(rollup): keep the watermark when a day fails`. Types are `feat`, `fix`, `docs`, `test`, `build`, `refactor` and `chore`.
- **Tests never open a network connection.** Providers, mail, the host and other sites are replaced by fakes. A test that reaches the network is a bug.
- **The public page script stores nothing.** `src/client` sets no cookie and uses no `localStorage`, `sessionStorage`, IndexedDB or URL fragment; `tests/no-storage.test.ts` and `tests/no-history.test.ts` scan it. The admin may keep UI preferences in browser storage, only through `src/admin/prefs.ts`.
- **No history manipulation in the page script.** It never adds a history entry, makes no history call at all and never wraps the history methods. It never changes a link or the address. A test scans the script for any history reference.
- **Keep the surface frozen.** The plugin id, route names, ingest JSON, settings keys, table and column names and the agent API paths are the public contract of 1.x. Add fields; do not rename or remove them.
- **Bots are excluded, not reported.** Do not add a report, setting or tab about them.

## Documentation

`docs/settings.md` and `docs/openapi.json` are generated, so edit the settings schema or the route definitions and regenerate. The other pages in `docs` are written by hand. Keep numbers in sync with the constants in `src` (a limit in a doc names its constant).

## Reporting problems

For a bug or a feature request, open an issue from its template; a bug report asks for the plugin version, the EmDash version, the Cloudflare plan and the capacity profile. Pull requests get a checklist from the template. For a security problem do not open an issue: see [SECURITY.md](SECURITY.md).
