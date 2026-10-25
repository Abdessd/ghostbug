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
test('redacts card numbers only when they pass the Luhn check', () => {
  assert.equal(scrubString('card 4111 1111 1111 1111 exp'), 'card [REDACTED] exp');
  assert.equal(scrubString('4111111111111111'), '[REDACTED]');
  assert.equal(scrubString('2026-10-25 4111 1111 1111 1111'), '[REDACTED]');
  assert.equal(scrubString('created 1730000000000'), 'created 1730000000000');
  assert.equal(scrubString('/api/orders/1730000000000'), '/api/orders/1730000000000');
});
test('matches short sensitive words only as whole key segments', () => {
  const kept = { author: 'Ada', __typename: 'User', filename: 'a.txt', discarded: 2, cardinality: 3 };
  assert.deepEqual(scrubValue(kept), kept);
  assert.deepEqual(scrubValue({ firstName: 'Ada', user_name: 'ada', surname: 'L', authToken: 'x', card: 'x', userSSN: 'x', HTTPAuth: 'x' }),
    { firstName: '[REDACTED]', user_name: '[REDACTED]', surname: '[REDACTED]', authToken: '[REDACTED]', card: '[REDACTED]', userSSN: '[REDACTED]', HTTPAuth: '[REDACTED]' });
});
test('keeps booleans and null under sensitive keys so replay logic is unchanged', () => {
  assert.deepEqual(scrubValue({ emailVerified: false, phone: null, session: { active: true, token: 'x' } }),
    { emailVerified: false, phone: null, session: '[REDACTED]' });
});
