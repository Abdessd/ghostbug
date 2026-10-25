import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { scrubString, scrubValue, scrubInput, safeUrl, scrubResponseBody } from '../src/privacy.ts';

test('scrubs emails, bearer auth and GitHub-style tokens', () => {
  assert.equal(scrubString('contact foo@example.com now'), 'contact [REDACTED] now');
  assert.equal(scrubString('Bearer abc.def.ghi'), '[REDACTED]');
  assert.equal(scrubString('ghp_12345678901234567890'), '[REDACTED]');
});
test('redacts nested sensitive JSON keys', () => {
  assert.deepEqual(scrubValue({ error: 'payment_failed', user: { email: 'a@example.com', api_key: 'secret' } }),
    { error: 'payment_failed', user: { email: '[REDACTED]', api_key: '[REDACTED]' } });
});
test('does not save raw input values or URL query/fragment', () => {
  assert.equal(scrubInput('my address'), '[REDACTED]');
  assert.equal(safeUrl('https://example.com/path?token=secret#auth'), 'https://example.com/path');
});
test('sanitizes API JSON responses', () => {
  assert.equal(scrubResponseBody('{"error":"failed","token":"abc"}', 'application/json'),
    '{"error":"failed","token":"[REDACTED]"}');
});
