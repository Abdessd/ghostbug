import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveReplayTarget, fixtureKey } from '../src/safety.ts';
import { safeUrl } from '../src/privacy.ts';
import { parseRecording } from '../src/storage.ts';
import { generateSpec } from '../src/generator.ts';
import type { Recording } from '../src/types.ts';

const sample: Recording = {
  version: 1,
  name: 'sample',
  startUrl: 'https://example.org/checkout?auth=secret',
  recordedAt: '2026-01-01T00:00:00.000Z',
  actions: [{ type: 'click', selector: '#pay' }],
  network: [{ method: 'POST', path: '/api/pay', status: 500, contentType: 'application/json', body: '{"error":"no"}' }],
  expect: { text: 'Something useful' }
};

test('replay refuses remote origins by default and even in explicit overrides', () => {
  assert.throws(() => resolveReplayTarget(sample.startUrl), /localhost-only/);
  assert.throws(() => resolveReplayTarget(sample.startUrl, 'http://example.org'), /localhost-only/);
  assert.throws(() => resolveReplayTarget(sample.startUrl, 'https://evil.org@localhost:3333'), /credentials/);
  assert.throws(() => resolveReplayTarget(sample.startUrl, 'file:///etc/passwd'), /localhost-only/);
});

test('replay override uses exact localhost origin and path without secret query', () => {
  const target = resolveReplayTarget(sample.startUrl, 'http://127.0.0.1:3333/custom?stolen=yes');
  assert.equal(target.href, 'http://127.0.0.1:3333/checkout');
  assert.equal(resolveReplayTarget(sample.startUrl, 'http://[::1]:3000').hostname, '[::1]');
  assert.equal(fixtureKey('post', '/api/pay'), 'POST /api/pay');
});

test('record URLs reject credentials and unsafe protocols', () => {
  assert.throws(() => safeUrl('file:///etc/passwd'), /HTTP\/HTTPS/);
  assert.throws(() => safeUrl('https://someone:password@example.org/'), /credentials/);
  assert.equal(safeUrl('https://example.org/path?secret=yes#hash'), 'https://example.org/path');
});

test('generated test includes a local-only safety guard and blocks non-local subresources', () => {
  const source = generateSpec(sample);
  assert.match(source, /GhostBug refuses to replay against a non-local URL/);
  assert.match(source, /url\.origin !== target\.origin/);
  assert.match(source, /route\.abort\('blockedbyclient'\)/);
  assert.doesNotMatch(source, /auth=secret/);
});

test('session loader rejects recordings with non-HTTP origins', () => {
  assert.throws(() => parseRecording({ ...sample, startUrl: 'file:///etc/passwd' }), /HTTP\/HTTPS/);
});


test('recordings reject oversized or malformed fixture data', () => {
  assert.throws(() => parseRecording({ ...sample, network: [{ ...sample.network[0], body: 'x'.repeat(70 * 1024) }] }), /malformed/);
  assert.throws(() => parseRecording({ ...sample, network: [{ ...sample.network[0], path: '/api/pay?token=sensitive' }] }), /malformed/);
  assert.throws(() => parseRecording({ ...sample, network: [{ ...sample.network[0], status: 200.3 }] }), /malformed/);
  assert.throws(() => parseRecording({ ...sample, actions: [{ type: 'fill', selector: '#a', value: 'x'.repeat(10001) }] }), /malformed/);
  assert.throws(() => parseRecording({ ...sample, notes: [42] }), /Invalid notes/);
});
