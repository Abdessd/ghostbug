import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Route } from 'playwright';
import { makeNetworkHandler } from '../src/replay.ts';
import { fingerprintRequest } from '../src/privacy.ts';
import type { Recording } from '../src/types.ts';

const session: Recording = {
  version: 1, name: 'fixture ordering', recordedAt: '2026-01-01T00:00:00Z',
  startUrl: 'http://localhost:3000/checkout', actions: [], expect: { text: 'ok' },
  network: [
    { method: 'POST', path: '/api/pay', status: 500, contentType: 'application/json', body: '{"attempt":1}' },
    { method: 'POST', path: '/api/pay', status: 200, contentType: 'application/json', body: '{"attempt":2}' }
  ]
};

type Outcome = { action: string; options?: unknown };
function fakeRoute(url: string, method = 'POST', body: string | null = null): { route: Route; calls: Outcome[] } {
  const calls: Outcome[] = [];
  const route = {
    request: () => ({ url: () => url, method: () => method, postData: () => body, headers: () => ({ 'content-type': 'application/json' }) }),
    abort: async (options: unknown) => { calls.push({ action: 'abort', options }); },
    fulfill: async (options: unknown) => { calls.push({ action: 'fulfill', options }); },
    continue: async () => { calls.push({ action: 'continue' }); }
  } as unknown as Route;
  return { route, calls };
}

test('recorded HTTP responses are replayed in order, with exhaustion reported', async () => {
  const handle = makeNetworkHandler(session, new URL('http://localhost:3000/checkout'));
  const outputs: Outcome[] = [];
  for (let i = 0; i < 3; i++) {
    const { route, calls } = fakeRoute('http://localhost:3000/api/pay');
    await handle(route);
    outputs.push(...calls);
  }
  assert.deepEqual(outputs.map(x => x.action), ['fulfill', 'fulfill', 'fulfill']);
  assert.deepEqual(outputs.map(x => (x.options as { status?: number }).status), [500, 200, 418]);
  assert.match(JSON.stringify(outputs[0].options), /attempt.*1/);
  assert.match(JSON.stringify(outputs[1].options), /attempt.*2/);
});

test('replay blocks cross-origin requests and permits non-fixtured same-origin requests', async () => {
  const handle = makeNetworkHandler(session, new URL('http://localhost:3000/checkout'));
  const other = fakeRoute('https://evil.example/api/pay');
  await handle(other.route);
  assert.deepEqual(other.calls, [{ action: 'abort', options: 'blockedbyclient' }]);
  const local = fakeRoute('http://localhost:3000/styles.css', 'GET');
  await handle(local.route);
  assert.deepEqual(local.calls, [{ action: 'continue' }]);
});

test('recorded API origins get fixtures with CORS headers and never reach the network', async () => {
  const handle = makeNetworkHandler({ ...session, network: [
    { method: 'GET', path: '/users', origin: 'http://localhost:8000', status: 200, contentType: 'application/json', body: '[]' }
  ] }, new URL('http://localhost:3000/checkout'));
  const recorded = fakeRoute('http://localhost:8000/users', 'GET');
  await handle(recorded.route);
  assert.deepEqual(recorded.calls, [{ action: 'fulfill', options: {
    status: 200, contentType: 'application/json', body: '[]',
    headers: { 'access-control-allow-origin': 'http://localhost:3000', 'access-control-allow-credentials': 'true' }
  } }]);
  const unrecorded = fakeRoute('http://localhost:8000/admin', 'GET');
  await handle(unrecorded.route);
  assert.deepEqual(unrecorded.calls.map(call => [call.action, (call.options as { status?: number }).status]), [['fulfill', 418]]);
  const sameOriginPath = fakeRoute('http://localhost:3000/users', 'GET');
  await handle(sameOriginPath.route);
  assert.deepEqual(sameOriginPath.calls, [{ action: 'continue' }]);
});

test('requests take the fixture with the same fingerprint, then fall back to recorded order', async () => {
  const search = (q: string) => ({ method: 'GET', path: '/api/search', status: 200, contentType: 'application/json',
    body: JSON.stringify({ q }), match: fingerprintRequest('?q=' + q, null) });
  const handle = makeNetworkHandler({ ...session, network: [search('chat'), search('chien'), search('oiseau')] }, new URL('http://localhost:3000/'));
  const bodies: string[] = [];
  for (const q of ['chien', 'chat', 'poisson']) {
    const { route, calls } = fakeRoute('http://localhost:3000/api/search?q=' + q, 'GET');
    await handle(route);
    bodies.push((calls[0].options as { body: string }).body);
  }
  assert.deepEqual(bodies, ['{"q":"chien"}', '{"q":"chat"}', '{"q":"oiseau"}']);
});
