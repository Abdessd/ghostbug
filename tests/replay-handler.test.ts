import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { Route } from 'playwright';
import { makeNetworkHandler } from '../src/replay.ts';
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
function fakeRoute(url: string, method = 'POST'): { route: Route; calls: Outcome[] } {
  const calls: Outcome[] = [];
  const route = {
    request: () => ({ url: () => url, method: () => method }),
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
