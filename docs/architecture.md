# Architecture and design

```text
record <url>
  Chromium browser + injected DOM event observer
          |                             \
       click/change                     same-origin /api/ JSON responses
          |                             /
          +------ local v1 session.json
                         |
                   generate / replay
                         |
               Playwright test + mocks
                         |
              red → fix UI → green
```

## Modules

- `selector-script.ts`: minimal browser-side JavaScript for CSS selectors and user events, injected before page loads.
- `recorder.ts`: launches Chromium, records a small class of user actions plus filtered API responses, writes a versioned session.
- `privacy.ts`: strips query strings, redacts input values and response fields; these are safeguards, not guaranteed sanitization.
- `redact.ts`: the redaction core and request fingerprints. Self-contained on purpose: generated specs that need fingerprints embed its source, so recorder, `replay` and specs always compute the same `match` values.
- `storage.ts`: reads/writes and validates version 1 recordings.
- `generator.ts`: deterministic TypeScript test generator, with mock HTTP response queue and explicit assertion.
- `replay.ts`: local-only execution using Playwright and the same mock behavior.
- `cli.ts`: minimal CLI command parser and user-facing errors.

## Session schema v1 (simplified)

```json
{
  "version": 1,
  "name": "checkout-failure",
  "recordedAt": "2026-10-25T12:00:00Z",
  "startUrl": "http://localhost:3000/checkout",
  "actions": [{ "type": "click", "selector": "#pay-button" }],
  "network": [{
    "method": "POST",
    "path": "/api/pay",
    "match": "3f0c5e1b2a9d4c87",
    "status": 500,
    "contentType": "application/json",
    "body": "{\"error\":\"payment_failed\"}"
  }],
  "expect": { "text": "Payment failed. Please retry." }
}
```

## Threat model and security limitations

The recorded page is **untrusted**, including DOM attributes, selector strings and server responses. Captured strings are emitted through JSON serialization rather than interpolated as code. Recordings remain on disk only. Replay and generated specs refuse non-local origins unless a hostname is explicitly allowed (`--allow-host`, `GHOSTBUG_ALLOW_HOST`). Outgoing browser requests to other origins are blocked during replay, except origins recorded with `--api-origin`: those only ever receive recorded fixtures (with CORS headers; Playwright answers preflights) or HTTP 418, never the network. This may require adapting the workflow for apps that depend on third-party scripts or services.

Fixtures are saved in request order and carry an optional `origin` (only for `--api-origin` responses) and `match`: the first 16 hex digits of a SHA-256 over the redacted query string and body (JSON or form-encoded; other bodies get no fingerprint). Replay takes the first remaining fixture for the same method, origin and path whose `match` equals the live request's fingerprint, else the first remaining one. Headers are not modelled.

There is no durable browser profile or authentication storage export. Cross-origin responses are recorded only from origins passed with `--api-origin`; cookies are never recorded. Text from error messages and URLs can still contain secrets; the user is responsible for review. Once loaded, mock fixture data is consumed sequentially and additional calls to a previously recorded endpoint receive a fixture-exhausted response instead of reaching the live backend.

## Decision: no required AI services

Playwright is enough for deterministic recording/replay. Future optional AI may propose assertions or diagnoses, but never needs to see unredacted fixtures by default.
