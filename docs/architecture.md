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
    "status": 500,
    "contentType": "application/json",
    "body": "{\"error\":\"payment_failed\"}"
  }],
  "expect": { "text": "Payment failed. Please retry." }
}
```

## Threat model and security limitations

The recorded page is **untrusted**, including DOM attributes, selector strings and server responses. Captured strings are emitted through JSON serialization rather than interpolated as code. Recordings remain on disk only. Replay and generated specs refuse non-local origins. Outgoing browser requests to other origins are blocked during replay. This may require adapting the workflow for apps that depend on third-party scripts or services. Current network matching does not model request body or headers and therefore cannot distinguish requests with the same method and path; order of recorded fixtures matters.

There is no durable browser profile or authentication storage export. Cross-origin responses and cookies are not recorded by design. Text from error messages and URLs can still contain secrets; the user is responsible for review. Once loaded, mock fixture data is consumed sequentially and additional calls to a previously recorded endpoint receive a fixture-exhausted response instead of reaching the live backend.

## Decision: no required AI services

Playwright is enough for deterministic recording/replay. Future optional AI may propose assertions or diagnoses, but never needs to see unredacted fixtures by default.
