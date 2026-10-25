# GhostBug v0.1.2 — Validation report (2026-10-25)

**Release verdict: NOT YET PRODUCTION-READY.** The offline parts pass, but the full browser HTTP flow, clean install, and vulnerability audit have not been validated. `test:e2e:strict` intentionally fails in this execution environment. A skipped test never counts as a passed test.

## Execution environment

- Node.js 22.16.0, npm 10.9.2, TypeScript 5.8.3 (globally available).
- System Chromium at `/usr/bin/chromium`.
- The installed `playwright` comes from the sandbox's Python Playwright driver. Exact npm dependencies are **not installed from this package manifest**; `@playwright/test` is absent.
- Chromium rejects `page.goto()` even for a local test server and entirely intercepted requests: `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
- npm registry DNS fails: `EAI_AGAIN registry.npmjs.org`. npm has no cached `@playwright/test` metadata (`ENOTCACHED`).

## Checks performed

| Check | Result | Evidence / notes |
|---|---|---|
| Unit and HTTP demo tests | **PASS 19/19** | Generator, storage, safety, privacy, local HTTP demo, fixture response ordering/exhaustion and same-origin handling |
| Real Chromium offline DOM integration | **PASS 3/3** | Listener capture, broken/fixed checkout UI, **actual replay action engine** fails on broken DOM then passes with fixed DOM; API mocked in browser |
| TypeScript typecheck | **PASS** | `npm run typecheck` |
| TypeScript build | **PASS** | `npm run build` |
| Emitted JavaScript syntax | **PASS** | `node --check` for each `dist/*.js` |
| CLI smoke test | **PASS** | `node dist/cli.js --help` |
| npm package content dry run | **PASS** | `npm pack --dry-run`, v0.1.2, package contains CLI/dist and no node_modules |
| Local validation command | **PASS** | `npm run validate:local`, exit 0 |
| Full browser HTTP playback, red to green | **NOT RUN / BLOCKED** | `page.goto()` receives `ERR_BLOCKED_BY_ADMINISTRATOR` |
| Real browser recording of HTTP response | **NOT RUN / BLOCKED** | Same browser navigation restriction |
| Generated Playwright test executed with official test runner | **NOT RUN / BLOCKED** | `@playwright/test` absent and browser HTTP navigation restricted |
| Strict E2E release gate | **FAIL (expected here)** | `npm run test:e2e:strict` exits 1; 0/3 executed successfully |
| `npm audit --omit=dev --audit-level=high` | **BLOCKED** | `ENOLOCK` — no package-lock.json; registry access also unavailable |
| Clean dependency installation / npm lockfile | **BLOCKED** | `EAI_AGAIN`, offline attempt returns `ENOTCACHED` |
| macOS / Windows / real third-party apps | **NOT TESTED** | This environment is Linux-only |
| GitHub-hosted CI | **NOT RUN** | Repository not available as a connected GitHub checkout |

**Total executable passing automated checks: 22 (19 unit/server + 3 Chromium offline DOM).** The other 3 full HTTP browser E2E tests are *unverified*, not passed.

## Changes in v0.1.2

- Extracted `replayActions()` so the actual Chromium action-and-assertion replay path can be tested with a DOM fixture despite network navigation restrictions.
- Extracted `makeNetworkHandler()` for direct tests of response order, exhausted fixtures, and cross-origin blocking.
- Replaced quadratic array cloning (`[...previous, fixture]`) with in-place queue construction in both runtime replay and generated Playwright specs.
- Added preflight detection: `npm run test:e2e` now explicitly displays **SKIP** for unavailable HTTP/browser prerequisites. It must not be counted as a green E2E run.
- Added `npm run test:e2e:strict` which never skips tests: it **fails** if browser navigation or official Playwright test execution fails. GitHub Actions and `validate:release` use this strict command.

## Steps required to complete validation

In a machine/network that permits npm registry access and Chromium HTTP navigation:

```bash
npm install
npx playwright install chromium
npm run validate:local
npm run test:e2e:strict
npm audit --omit=dev --audit-level=high
```

Then:

1. Commit the generated `package-lock.json`, switch CI to `npm ci`, and verify a clean `npm ci` checkout.
2. Confirm that the generated Playwright spec **fails** against the deliberately buggy checkout and **passes** after correction (the current E2E generated-spec test only checks the fixed case; expand it to test both).
3. Install the packed tarball in a clean temp project and run its CLI using published dependency versions.
4. Review and scan any exported recording for secrets; best-effort redaction is not guaranteed to eliminate confidential data.
5. Execute GitHub Actions on an actual repository, and verify at least one macOS/Windows setup if claiming cross-platform compatibility.

Passing only `npm run validate:local` is not sufficient to publish a stable release.
