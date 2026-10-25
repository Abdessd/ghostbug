import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateSpec } from '../src/generator.ts';
import { parseRecording } from '../src/storage.ts';
import { fingerprintRequest } from '../src/privacy.ts';
import type { Recording } from '../src/types.ts';
const recording: Recording = {
  version: 1, name: 'Demo', recordedAt: new Date(0).toISOString(), startUrl: 'http://localhost:3000/checkout?secret=oops',
  actions: [{ type: 'click', selector: '#pay-button' }],
  network: [{ method: 'POST', path: '/api/pay', status: 500, contentType: 'application/json', body: '{"error":"payment_failed"}' }]
};
test('generated code includes useful expectation and mocked response', () => {
  const spec = generateSpec(recording, 'Payment failed. Please retry.');
  assert.match(spec, /await page\.route/);
  assert.match(spec, /Payment failed\. Please retry\./);
  assert.match(spec, /expect\(page\.getByText/);
  assert.doesNotMatch(spec, /oops/);
});
test('throws if expected correct behavior is not provided', () => {
  assert.throws(() => generateSpec(recording), /Missing expected outcome/);
});
test('does not interpolate malicious values as code', () => {
  const spec = generateSpec({ ...recording, actions: [{ type: 'click', selector: "#a');process.exit(1);//" }] }, 'okay');
  assert.match(spec, /process\.exit\(1\)/);
  assert.doesNotMatch(spec, /'#a'\);process\.exit/);
});
test('rejects broken session files', () => {
  assert.throws(() => parseRecording({ version: 1, actions: [] }), /malformed/);
});
test('embeds the fingerprint code only when one endpoint has different recorded requests', () => {
  assert.doesNotMatch(generateSpec(recording, 'ok'), /createHash|fingerprintRequest/);
  const item = (id: number) => ({ method: 'GET', path: '/api/item', status: 200, contentType: 'application/json', body: '{}', match: fingerprintRequest('?id=' + id, null) });
  const spec = generateSpec({ ...recording, network: [item(1), item(2)] }, 'ok');
  assert.match(spec, /import \{ createHash \} from 'node:crypto';/);
  assert.match(spec, /function fingerprintRequest\(search: string, body: string \| null, contentType = ''\)/);
  assert.doesNotMatch(spec, /^export /m);
});
