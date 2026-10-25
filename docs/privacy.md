# Privacy principles

**Default local. Default narrow. User review is mandatory before sharing.**

GhostBug uses a fresh Chromium browser context (not your daily browser profile). It never intentionally saves cookies, authorization headers, request bodies or localStorage. It captures only responses that match your session's origin and an API path prefix (default `/api/`), plus origins you list with `--api-origin`. It removes URL query strings and hashes from saved URLs.

Input field values are always replaced by `[REDACTED]` in v0.1. JSON keys matching heuristics (e.g. `email`, `token`, `password`, `name`) are redacted, as are many token/email-like string patterns. Boolean and `null` values are kept even under such keys, so replayed UI logic is unchanged. Digit sequences are treated as card numbers only when they pass the Luhn checksum. API responses or actions dropped for privacy or size reasons are counted in the recording's `notes`. Other data in nested structures might still identify a person, entity, secret or organization. The filters do **not** handle all international formats, arbitrary secrets, base64 data, photos or unique identifiers. CSS selectors may include PII from DOM IDs or attributes, and API URL paths can contain identifiers. This is not an anonymization product.

Request query strings and bodies are not saved. To serve the right response to repeated calls, each fixture stores a `match` fingerprint: a truncated SHA-256 of the query and body **after** the redaction above, so redacted values (passwords, emails, tokens, card numbers) never influence it. It reveals no more than saving the redacted request would, but it is not encryption: someone holding `session.json` could confirm a *guessed* value that the redaction missed, such as a short PIN under an unrecognised field name. Delete the `match` fields before sharing if that matters; replay then falls back to recorded order.

Review the exact `session.json` contents before pushing them to a public repository, pasting them into a bug report, or sharing the generated test. Use synthetic demo credentials and fake payment information. The CLI does not upload recordings anywhere.

Future versions should add an inspect-and-approve export stage, stricter allowlists for fixture fields, opt-in request body capture and secret scanning. Do not treat any of these as implemented today.
