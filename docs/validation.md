# GhostBug — Validation report (`main`, 2026-10-25)

**Release verdict: developer preview.** Every automated check, including the strict HTTP E2E gate, passes on Linux. GitHub Actions (Node 22), a clean `npm ci`, installing the packed tarball, and macOS/Windows have not been verified yet. A skipped test never counts as a passed test.

The previous v0.1.2 report, written in a sandbox that blocked browser navigation and the npm registry, is in the git history of this file.

## Execution environment

- Linux, Node.js 24.11.0, npm 11.6.1, TypeScript 5.9.3.
- Dependencies installed from this manifest; `package-lock.json` pins Playwright and `@playwright/test` 1.64.1.
- Google Chrome through `CHROMIUM_PATH=/usr/bin/google-chrome` (Playwright's bundled Chromium was not installed).

## Checks performed

| Check | Result | Evidence / notes |
|---|---|---|
| TypeScript typecheck | **PASS** | `npm run typecheck` |
| Unit and HTTP demo tests | **PASS 28/28** | Generator, storage, safety (incl. `--allow-host`), privacy (incl. Luhn, key segments, request fingerprints), local HTTP demo, fixture ordering, fingerprint matching, API-origin fixtures |
| Chromium DOM integration | **PASS 4/4** | Listener capture, broken/fixed checkout UI, replay action engine, unique selectors for lists that repeat a `data-testid` |
| TypeScript build | **PASS** | `npm run build`, which also copies `src/redact.ts` to `dist/redact.source.ts` |
| Emitted JavaScript syntax | **PASS** | `node --check` for each `dist/*.js` |
| Strict E2E release gate | **PASS 6/6** | `npm run test:e2e:strict`: live localhost recording, red-to-green replay, generated spec through `@playwright/test`, `--api-origin` and multi-prefix recording in request order, API-origin fixtures served by fingerprint while the API is down, generated spec on an allowed non-local host |
| Generated spec under `tsc --strict` | **PASS** | A spec embedding the fingerprint code type-checks with `--strict --noUncheckedIndexedAccess` |
| npm package content dry run | **PASS** | `npm pack --dry-run`: 37 files, includes `dist/redact.source.ts`, no `node_modules` |
| `npm audit --omit=dev --audit-level=high` | **PASS** | 0 vulnerabilities |
| Real third-party app | **PASS** | RealWorld "Conduit" Vue 3 frontend on a local Vite server, public demo API recorded with `--api-origin`: CLI recording, replay 3/3, generated spec passing with the API host unresolvable, a simulated HTTP 500 reproducing a real error-handling bug red then green after fixing the app. It also exposed the repeated-`data-testid` selector bug, since fixed |
| GitHub-hosted CI (Node 22) | **NOT RUN** | No pushed repository yet |
| Clean `npm ci`, packed tarball install | **NOT TESTED** | CI still runs `npm install` |
| macOS / Windows | **NOT TESTED** | Linux only |

## Steps required to complete validation

1. Push the repository and confirm GitHub Actions passes on Node 22; then switch CI to `npm ci` and verify a clean checkout.
2. Make the generated-spec E2E test also **fail** against the deliberately buggy checkout (it currently checks the fixed case and the host guard).
3. Install the packed tarball in a clean temp project and run its CLI using published dependency versions.
4. Review and scan any exported recording for secrets; best-effort redaction is not guaranteed to eliminate confidential data.
5. Verify at least one macOS/Windows setup before claiming cross-platform compatibility.
