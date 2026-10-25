<div align="center">

# 👻 GhostBug

**Record a bug. Reproduce it locally. Turn it into a regression test.**

A local-first TypeScript CLI for turning a Chromium browser session into an editable Playwright test.

[Quickstart](#quickstart) · [Demo](#a-real-red-to-green-demo) · [Privacy](#privacy) · [Limitations](#current-limitations) · [Contributing](CONTRIBUTING.md)

</div>

> **Status: v0.1.2 developer preview.** The recorder is experimental, handles simple Chromium flows, and does NOT guarantee portable reproduction of every bug. The bundled regression case is the recommended starting point.

## Why GhostBug?

Most bug reports are screenshots, a few sentences, and "works on my machine". GhostBug records useful browser actions and same-origin JSON API responses, replaces sensitive text fields by default, and generates a Playwright regression test with **your specified expected behavior**.

GhostBug uses Playwright under the hood and does not pretend to replace Playwright's codegen or Trace Viewer. Its opinionated workflow is: **capture → inspect/sanitize → define expected outcome → replay → fix → rerun**.

## Quickstart

Prerequisites: Node.js 22.12+, npm, and a running frontend app accessible from your machine.

```bash
git clone https://github.com/YOUR-USERNAME/ghostbug.git
cd ghostbug
npm install
npx playwright install chromium
npm run build
node dist/cli.js --help
```

> Until a release is published to npm, use `node dist/cli.js` in this repository. `npx ghostbug-cli` is NOT yet available as a published package.

Start your own app on localhost, and in a second terminal:

```bash
node dist/cli.js record http://localhost:3000/checkout --out .ghostbug/checkout
# Reproduce the bug using the opened browser and press Enter in the terminal.

node dist/cli.js generate .ghostbug/checkout \
  --expect-text "Payment failed. Please retry."

node dist/cli.js replay .ghostbug/checkout --base-url http://localhost:3000
```

The generated `ghostbug.spec.ts` is editable and can be moved into an existing project using `@playwright/test`. This project itself includes the Playwright test dependency as a dev dependency.

## A real red-to-green demo

One server, one HTTP 500 response, one intentional UI bug. The **correct** behavior is to show a friendly error. The broken app instead shows `Unexpected error`.

### Terminal A — buggy app

```bash
npm run demo
# http://localhost:3000/checkout
```

### Terminal B — failing regression

```bash
npm run example:generate
npm run example:replay
# Expected: FAIL (the UI currently says "Unexpected error")
```

For the replay script above, `/usr/bin/chromium` is the Linux system browser. On macOS/Windows, use `node dist/cli.js replay examples/checkout/recording` after installing the Playwright Chromium browser, or set `CHROMIUM_PATH` to your local browser executable.

### Fix it, then replay

Stop Terminal A and restart:

```bash
FIX_BUG=1 npm run demo
```

On Windows PowerShell: `$env:FIX_BUG="1"; npm run demo`.

Run replay again:

```bash
npm run example:replay
# Expected: PASS
```

The same mock 500 is replayed both times. The *frontend response to the error* is what's fixed.

The session in `examples/checkout/recording/session.json` is a synthetic fixture you can edit. For a real capture, run:

```bash
node dist/cli.js record http://localhost:3000/checkout --out .ghostbug/real
```

Click **Pay now** in the opened browser, press Enter, then generate with `--expect-text` and replay. If the real recorder captures additional events, inspect the session and remove irrelevant actions before replaying.

## Commands

```text
ghostbug record <url> [--out <dir>] [--duration <ms>] [--headless]
                       [--browser <path>] [--api-prefix <paths>] [--api-origin <origins>]
ghostbug generate <recording-dir> --expect-text <message> [--out <file>]
ghostbug replay <recording-dir> [--base-url <local-url>] [--allow-host <hosts>]
                        [--expect-text <message>] [--headed] [--browser <path>]
```

- `record`: starts Chromium, saves clicks/form changes and a subset of API responses to `session.json`. Use `--duration 10000 --headless` for unattended recording (you must still supply interactions through some other mechanism).
  - `--api-prefix /api/,/graphql` captures same-origin responses under several paths (default `/api/`).
  - `--api-origin http://localhost:8000` also captures every JSON/text response from a separate backend, e.g. a Vite frontend on `:5173` talking to an API on `:8000`. On replay that origin only ever gets recorded responses (with CORS headers); unrecorded calls get HTTP 418 and never reach the network.
  - Responses are saved in request order, each with a `match` fingerprint of its redacted query string and body, so replay serves the right response to parallel or repeated calls to the same endpoint.
- `generate`: produces `ghostbug.spec.ts` and updates the expected message in `session.json`.
- `replay`: uses Playwright directly, mocks captured API responses and checks the expected text. **Only accepts localhost for safety, and blocks other origins except recorded `--api-origin` ones.** `--allow-host staging.local` explicitly allows a non-production hostname (Docker service, staging); requests without a recorded response do reach that server, so never point it at production.
- Run the generated Playwright test with `npx playwright test <path-to-test>` from a project with `@playwright/test` installed, adjusting its Playwright configuration and app startup as needed. It reads `GHOSTBUG_BASE_URL` and `GHOSTBUG_ALLOW_HOST` in place of `--base-url` and `--allow-host`.

## Privacy

- No cloud server, account, external AI service, cookies, request bodies, or browser storage exports.
- Only responses from the **recorded origin** whose path starts with `/api/` are eligible for collection by default, plus any origin you pass with `--api-origin`.
- Request query strings and bodies are never saved. Each response stores only a 16-hex-digit `match` fingerprint, hashed **after** redaction; see [privacy design](docs/privacy.md) for what it can and cannot reveal.
- Only JSON and plain-text responses up to 64 KiB are included.
- Query parameters and fragments are stripped from recorded start URLs and response matchers.
- All form text values are replaced with `[REDACTED]` by default. Replace those placeholders with safe test values manually.
- JSON response field names resembling passwords, emails, tokens, names, addresses, etc. are redacted. Common token and email strings are also masked.

**Important:** Best-effort filters can miss personally identifying details in API values, URLs, error messages and identifiers. Recordings can contain sensitive or proprietary business information. **Review `session.json` and generated specs before sharing or committing them.** The generated spec embeds fixtures verbatim from the saved recording. Do not record on third-party websites without permission.

See [privacy design](docs/privacy.md).

## Current limitations

- Chromium only; no browser extension.
- Simple clicks, form changes, JSON/text API responses (same-origin under `--api-prefix`, or from `--api-origin`). No complete tracing, WebSocket replay, navigation timeline or file uploads.
- The frontend must be running. Backend-dependent state changes and complex asynchronous flows may not reproduce reliably.
- Generated assertions are currently limited to an expected visible text chosen by you. The generated spec also refuses remote URLs; set `GHOSTBUG_BASE_URL` to your local app when the original recording used a remote origin.
- CSS selectors can be brittle in dynamic apps. Requests whose redacted query or body changes between recording and replay (timestamps, nonces, `[REDACTED]` values you replaced) fall back to recorded order; raw-text, multipart and binary bodies are matched by order only.
- No automated anonymization guarantee and no turnkey secret-safe export.
- Playwright browser binaries may need installation separately (`npx playwright install chromium`).

## Validation status

**v0.1.2: 22 verified checks**: 19 unit/server tests and 3 offline Chromium DOM integration tests.
Source type checking, building, emitted JS syntax, and npm packaging were also checked.

**3 full HTTP E2E scenarios are still NOT verified** in the restricted sandbox: recording a live localhost response, real HTTP red-to-green replay, and executing the generated spec through `@playwright/test`. Chromium rejects *all* browser navigation here with `ERR_BLOCKED_BY_ADMINISTRATOR`; npm cannot resolve `registry.npmjs.org` (`EAI_AGAIN`). `npm audit`, clean dependency installation, and an end-to-end release verification therefore remain open.

`npm run test:e2e` records E2E scenarios as **SKIP** when these prerequisites are absent. **SKIP is not PASS.** The CI and release gate run `npm run test:e2e:strict`, which MUST fail if any scenario cannot run.

See **[full validation report](docs/validation.md)** before claiming production readiness.

In a normal developer environment:

```bash
npm install
npx playwright install chromium
npm run validate:local
npm run test:e2e:strict
npm audit --omit=dev --audit-level=high
```

The repo does not yet include an npm lockfile. Generate and commit `package-lock.json` after a successful clean install, then change CI installation to `npm ci`.

## Development

```bash
npm install
npm test
npm run build
npm run typecheck
```

Implementation: `src/recorder.ts`, `src/selector-script.ts`, `src/privacy.ts`, `src/redact.ts`, `src/generator.ts`, `src/replay.ts`. The v1 JSON recording is documented in [architecture](docs/architecture.md).

## Roadmap

See [roadmap](docs/roadmap.md). We prioritize reproducible bug workflows, security review, and minimal setup over an AI chatbot.

For sharing and adoption, see the [open-source launch plan](docs/launch.md).

## License

MIT — see [LICENSE](LICENSE).
