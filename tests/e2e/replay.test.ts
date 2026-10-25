import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { createServer as createHttpServer, type Server } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { replaySession } from '../../src/replay.ts';
import { recordSession } from '../../src/recorder.ts';
import { readRecording } from '../../src/storage.ts';
import { generateSpec } from '../../src/generator.ts';
import type { Recording } from '../../src/types.ts';

const browserPath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const original: Recording = {
  version: 1, name: 'replay checkout error', recordedAt: '2026-01-01T00:00:00Z',
  startUrl: 'http://localhost:3000/checkout',
  actions: [{ type: 'click', selector: '[data-testid="pay-button"]' }],
  network: [{ method: 'POST', path: '/api/pay', status: 500, contentType: 'application/json', body: '{"error":"payment_failed"}' }],
  expect: { text: 'Payment failed. Please retry.' }
};

async function withServer(server: Server, run: (url: string) => Promise<void>): Promise<void> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.close(); await once(server, 'close'); }
}

function checkoutServer(fixed: boolean): Server {
  return createHttpServer((req, res) => {
    if (req.url === '/api/pay') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{"error":"payment_failed"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<button data-testid="pay-button">Pay now</button><div role="alert"></div>
<script>document.querySelector('button').onclick=async()=>{
const r=await fetch('/api/pay',{method:'POST'});
document.querySelector('[role=alert]').textContent=r.ok?'OK':${JSON.stringify(fixed ? 'Payment failed. Please retry.' : 'Unexpected error')};
};</script>`);
  });
}

// In restricted sandboxes, report an explicit SKIP rather than a misleading browser failure.
// CI uses GHOSTBUG_REQUIRE_E2E=1 so these checks remain mandatory release gates.
const requireFullE2E = process.env.GHOSTBUG_REQUIRE_E2E === '1';
const missingTestRunner = (() => {
  try { createRequire(import.meta.url).resolve('@playwright/test'); return false; }
  catch { return true; }
})();
async function browserNavigationProblem(): Promise<string | undefined> {
  const server = createHttpServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1>probe</h1>'); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  assert(addr && typeof addr !== 'string');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${addr.port}/`, { waitUntil: 'domcontentloaded', timeout: 4000 });
    return undefined;
  } catch (error) {
    return `Chromium cannot navigate to local HTTP: ${String(error).split('\n')[0]}`;
  } finally {
    await browser?.close();
    server.close();
    await once(server, 'close');
  }
}
const navigationIssue = await browserNavigationProblem();
const skipBrowser = !requireFullE2E && navigationIssue || false;
const skipGeneratedTest = !requireFullE2E && (navigationIssue || (missingTestRunner ? '@playwright/test not installed (npm registry unavailable)' : undefined)) || false;

test('full Chromium replay fails before fix and succeeds after fix', { skip: skipBrowser }, async () => {
  await withServer(checkoutServer(false), async baseUrl => {
    await assert.rejects(replaySession(original, { baseUrl, browserPath }), /Expected visible text/);
  });
  await withServer(checkoutServer(true), async baseUrl => {
    await replaySession(original, { baseUrl, browserPath });
  });
});

test('real Chromium recording saves click and matching response fixture', { skip: skipBrowser }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ghostbug-e2e-capture-'));
  try {
    const server = createHttpServer((req, res) => {
      if (req.url === '/api/pay') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"error":"payment_failed","email":"secret@example.org"}');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<button data-testid="pay-button">Pay now</button><script>
        document.querySelector('button').addEventListener('click', () => fetch('/api/pay', {method:'POST'}));
        setTimeout(() => document.querySelector('button').click(), 150);
      </script>`);
    });
    await withServer(server, async baseUrl => {
      await recordSession({ url: `${baseUrl}/checkout`, output: dir, duration: 1500, headless: true, browserPath });
    });
    const recording = await readRecording(dir);
    assert(recording.actions.some(a => a.type === 'click' && a.selector === '[data-testid="pay-button"]'));
    assert(recording.network.some(f => f.path === '/api/pay' && f.method === 'POST' && f.status === 500));
    assert(recording.network.every(f => !f.body.includes('secret@example.org')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('CLI-generated Playwright spec runs against corrected checkout on local HTTP server', { skip: skipGeneratedTest }, async () => {
  const dir = await mkdtemp(join(resolve('.'), '.ghostbug-e2e-'));
  try {
    const spec = join(dir, 'checkout.spec.ts');
    await writeFile(spec, generateSpec(original));
    // An explicit testDir stops Playwright from applying .gitignore, which lists .ghostbug-e2e-*/.
    const config = join(dir, 'playwright.config.mjs');
    await writeFile(config, `export default ${JSON.stringify({
      testDir: '.', outputDir: 'test-results',
      ...(browserPath ? { use: { launchOptions: { executablePath: browserPath } } } : {})
    })};\n`);
    await withServer(checkoutServer(true), async baseUrl => {
      const output = await new Promise<{ code: number | null; output: string }>((done, fail) => {
        const child = spawn(process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', '--config', config, spec, '--workers=1', '--reporter=line'], {
          cwd: resolve('.'),
          env: { ...process.env, GHOSTBUG_BASE_URL: baseUrl },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30000
        });
        let output = '';
        child.stdout.on('data', b => { output += b.toString(); });
        child.stderr.on('data', b => { output += b.toString(); });
        child.on('error', fail);
        child.on('close', code => done({ code, output }));
      });
      assert.equal(output.code, 0, `Generated test failed:\n${output.output.slice(-4000)}`);
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
