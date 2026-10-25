import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { chromium } from 'playwright';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { installCaptureListeners } from '../../src/selector-script.ts';
import { scrubInput } from '../../src/privacy.ts';

const browserPath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
async function demoHtml(fixed: boolean): Promise<string> {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  socket.close();
  await once(socket, 'close');
  const child = spawn(process.execPath, [resolve('examples/checkout/server.mjs')], {
    env: { ...process.env, PORT: String(port), FIX_BUG: fixed ? '1' : '0' }, stdio: 'ignore'
  });
  try {
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw Error('Demo server exited');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/checkout`);
        if (response.ok) return await response.text();
      } catch { /* not started yet */ }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error('Demo did not start');
  } finally {
    child.kill('SIGTERM');
  }
}

test('Chromium DOM capture listens to click and change without leaking saved input values', async () => {
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
  try {
    const page = await browser.newPage();
    const events: Array<Record<string, unknown>> = [];
    await page.exposeBinding('__ghostbug_emit', (_source, event) => events.push(event));
    await page.setContent('<html><body><button data-testid="pay-button">Pay now</button><input id="email"/><input id="agree" type="checkbox"/></body></html>');
    await page.evaluate(installCaptureListeners);
    await page.getByRole('button', { name: 'Pay now' }).click();
    await page.locator('#email').fill('person@example.org');
    await page.locator('#email').blur();
    await page.locator('#agree').check();
    await page.waitForTimeout(50);
    assert(events.some(e => e.type === 'click' && e.selector === '[data-testid="pay-button"]'));
    const fill = events.find(e => e.type === 'fill');
    assert(fill);
    assert.equal(fill.selector, '#email');
    assert.equal(scrubInput(fill.value), '[REDACTED]');
    assert(events.some(e => e.type === 'check' && e.checked === true));
  } finally { await browser.close(); }
});

test('Chromium displays broken → fixed message in the actual demo UI (mock API response)', async () => {
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
  try {
    for (const [fixed, expected] of [[false, 'Unexpected error'], [true, 'Payment failed. Please retry.']] as const) {
      const page = await browser.newPage();
      const html = await demoHtml(fixed);
      // Browser navigation is restricted here; setContent exercises the actual demo DOM and inline JS.
      await page.setContent(html);
      await page.evaluate(() => { window.fetch = async () => new Response('{"error":"payment_failed"}', { status: 500, headers: { 'Content-Type': 'application/json' } }); });
      await page.getByRole('button', { name: 'Pay now' }).click();
      await page.getByRole('alert').getByText(expected).waitFor({ state: 'visible', timeout: 3000 });
      assert.equal(await page.getByRole('alert').innerText(), expected);
      await page.close();
    }
  } finally { await browser.close(); }
});

import { replayActions } from '../../src/replay.ts';
import type { Recording } from '../../src/types.ts';

test('actual replay action engine detects the checkout bug and passes after correction (offline DOM)', async () => {
  const recording: Recording = {
    version: 1, name: 'offline red-green', recordedAt: '2026-01-01T00:00:00Z',
    startUrl: 'http://localhost:3000/checkout',
    actions: [{ type: 'click', selector: '[data-testid="pay-button"]' }],
    network: [{ method: 'POST', path: '/api/pay', status: 500, contentType: 'application/json', body: '{"error":"payment_failed"}' }],
    expect: { text: 'Payment failed. Please retry.' }
  };
  const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
  try {
    for (const fixed of [false, true]) {
      const page = await browser.newPage();
      const html = await demoHtml(fixed);
      await page.setContent(html);
      // Navigation is unavailable here. The real UI and real replay actions execute in Chromium;
      // only the API response is synthetic, so this is NOT an HTTP end-to-end test.
      await page.evaluate(() => {
        window.fetch = async () => new Response('{"error":"payment_failed"}', { status: 500 });
      });
      if (fixed) await replayActions(page, recording, recording.expect!.text);
      else await assert.rejects(replayActions(page, recording, recording.expect!.text), /Expected visible text/);
      await page.close();
    }
  } finally { await browser.close(); }
});
