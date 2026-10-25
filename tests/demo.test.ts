import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const demoPath = resolve(dirname(fileURLToPath(import.meta.url)), '../examples/checkout/server.mjs');

async function reservePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No port');
  const port = address.port;
  server.close();
  await once(server, 'close');
  return port;
}
async function runDemo(fixed: boolean, fn: (url: string) => Promise<void>): Promise<void> {
  const port = await reservePort();
  const child = spawn(process.execPath, [demoPath], {
    env: { ...process.env, PORT: String(port), FIX_BUG: fixed ? '1' : '0' }, stdio: 'ignore'
  });
  try {
    let up = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw Error('Demo server quit during startup');
      try {
        const resp = await fetch(`http://127.0.0.1:${port}/checkout`);
        if (resp.ok) { up = true; break; }
      } catch { /* waiting for startup */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!up) throw Error('Demo server did not start');
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill('SIGTERM');
  }
}

test('demo returns HTTP 500 payment failure fixture', async () => {
  await runDemo(false, async url => {
    const response = await fetch(url + '/api/pay', { method: 'POST' });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'payment_failed' });
  });
});
test('demo pages contain broken and corrected UI messages', async () => {
  await runDemo(false, async url => {
    const body = await (await fetch(url + '/checkout')).text();
    assert.match(body, /Unexpected error/);
    assert.doesNotMatch(body, /Payment failed\. Please retry/);
  });
  await runDemo(true, async url => {
    const body = await (await fetch(url + '/checkout')).text();
    assert.match(body, /Payment failed\. Please retry/);
    assert.doesNotMatch(body, /Unexpected error/);
  });
});
