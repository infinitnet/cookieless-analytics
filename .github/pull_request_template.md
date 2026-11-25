## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm test` and `pnpm build` pass locally
- [ ] `node scripts/build-openapi.mjs --check` and `node scripts/build-settings-doc.mjs --check` pass; `dist` is rebuilt and committed when `src` changed
- [ ] New logic has a test; new UI text is in the copy test; no `.skip`, `.only` or placeholder tests
- [ ] Synthetic data only: example.com hosts, invented numbers, no real credentials
- [ ] No em or en dashes
- [ ] The public page script (`src/client`) still sets no cookie, uses no browser storage and makes no history call
- [ ] Docs updated where behavior, a setting or a limit changed
- [ ] I license this contribution under Apache-2.0 (inbound equals outbound, see CONTRIBUTING.md)
