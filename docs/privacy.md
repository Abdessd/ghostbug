# Privacy principles

**Default local. Default narrow. User review is mandatory before sharing.**

GhostBug uses a fresh Chromium browser context (not your daily browser profile). It never intentionally saves cookies, authorization headers, request bodies or localStorage. It captures only responses that match your session's origin and an API path prefix (default `/api/`). It removes URL query strings and hashes from saved URLs.

Input field values are always replaced by `[REDACTED]` in v0.1. JSON keys matching heuristics (e.g. `email`, `token`, `password`, `name`) are redacted, as are many token/email-like string patterns. Other data in nested structures might still identify a person, entity, secret or organization. The filters do **not** handle all international formats, arbitrary secrets, base64 data, photos or unique identifiers. CSS selectors may include PII from DOM IDs or attributes, and API URL paths can contain identifiers. This is not an anonymization product.

Review the exact `session.json` contents before pushing them to a public repository, pasting them into a bug report, or sharing the generated test. Use synthetic demo credentials and fake payment information. The CLI does not upload recordings anywhere.

Future versions should add an inspect-and-approve export stage, stricter allowlists for fixture fields, opt-in request body capture and secret scanning. Do not treat any of these as implemented today.
