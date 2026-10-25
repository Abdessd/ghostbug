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
import { fingerprintRequest } from '../../src/privacy.ts';
import type { NetworkFixture, Recording } from '../../src/types.ts';

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

async function runGeneratedSpec(recording: Recording, env: Record<string, string>, launchArgs: string[] = []): Promise<{ code: number | null; output: string }> {
  const dir = await mkdtemp(join(resolve('.'), '.ghostbug-e2e-'));
  try {
    const spec = join(dir, 'checkout.spec.ts');
    await writeFile(spec, generateSpec(recording));
    // An explicit testDir stops Playwright from applying .gitignore, which lists .ghostbug-e2e-*/.
    const config = join(dir, 'playwright.config.mjs');
    await writeFile(config, `export default ${JSON.stringify({
      testDir: '.', outputDir: 'test-results',
      use: { launchOptions: { args: launchArgs, ...(browserPath ? { executablePath: browserPath } : {}) } }
    })};\n`);
    return await new Promise<{ code: number | null; output: string }>((done, fail) => {
      const child = spawn(process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', '--config', config, spec, '--workers=1', '--reporter=line'], {
        cwd: resolve('.'),
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000
      });
      let output = '';
      child.stdout.on('data', b => { output += b.toString(); });
      child.stderr.on('data', b => { output += b.toString(); });
      child.on('error', fail);
      child.on('close', code => done({ code, output }));
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('CLI-generated Playwright spec runs against corrected checkout on local HTTP server', { skip: skipGeneratedTest }, async () => {
  await withServer(checkoutServer(true), async baseUrl => {
    const result = await runGeneratedSpec(original, { GHOSTBUG_BASE_URL: baseUrl });
    assert.equal(result.code, 0, `Generated test failed:\n${result.output.slice(-4000)}`);
  });
});

async function unusedPort(): Promise<number> {
  const server = createHttpServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  server.close();
  await once(server, 'close');
  return address.port;
}

const NOTE = JSON.stringify({ text: 'hi', email: 'someone@example.org' });

// Page loading data from a separate API origin: two parallel GETs to one endpoint, then a JSON POST
// (which needs a CORS preflight), plus a same-origin /graphql call.
function dashboardServer(apiOrigin: string): Server {
  return createHttpServer((req, res) => {
    if (req.url === '/graphql') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"data":{"me":"demo"}}');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<div id="out">loading</div><script>
const api = ${JSON.stringify(apiOrigin)};
const get = id => fetch(api + '/items?id=' + id).then(r => r.json());
(async () => {
  await fetch('/graphql', { method: 'POST', body: '{"query":"{ me }"}' });
  const [one, two] = await Promise.all([get(1), get(2)]);
  const saved = await fetch(api + '/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(NOTE)} }).then(r => r.json());
  document.getElementById('out').textContent = [one.label, two.label, saved.status].join(' / ');
})();
</script>`);
  });
}

function apiServer(): Server {
  return createHttpServer((req, res) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const reply = (body: unknown) => { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.url === '/items?id=1') setTimeout(() => reply({ label: 'one' }), 400); // answers after id=2
    else if (req.url === '/items?id=2') reply({ label: 'two' });
    else if (req.url === '/notes') reply({ status: 'saved' });
    else { res.writeHead(404, cors); res.end(); }
  });
}

// Fixtures for dashboardServer, deliberately stored in the opposite order of the requests.
function dashboardRecording(appOrigin: string, apiOrigin: string): Recording {
  const item = (id: number, name: string): NetworkFixture => ({ method: 'GET', path: '/items', origin: apiOrigin, status: 200,
    contentType: 'application/json', body: JSON.stringify({ label: name }), match: fingerprintRequest(`?id=${id}`, null) });
  return {
    version: 1, name: 'dashboard reads a separate API origin', recordedAt: '2026-01-01T00:00:00Z',
    startUrl: `${appOrigin}/dashboard`, actions: [],
    network: [item(2, 'two'), item(1, 'one'), {
      method: 'POST', path: '/notes', origin: apiOrigin, status: 201, contentType: 'application/json',
      body: '{"status":"saved"}', match: fingerprintRequest('', NOTE, 'application/json')
    }],
    expect: { text: 'one / two / saved' }
  };
}

test('recording captures --api-origin and extra --api-prefix responses in request order', { skip: skipBrowser }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ghostbug-e2e-api-'));
  try {
    let apiOrigin = '';
    await withServer(apiServer(), async apiUrl => {
      apiOrigin = apiUrl;
      await withServer(dashboardServer(apiUrl), async appUrl => {
        await recordSession({ url: `${appUrl}/dashboard`, output: dir, duration: 2000, headless: true, browserPath,
          apiPrefixes: ['/api/', '/graphql'], apiOrigins: [apiUrl] });
      });
    });
    const recording = await readRecording(dir);
    assert(recording.network.some(f => f.path === '/graphql' && f.origin === undefined));
    const items = recording.network.filter(f => f.path === '/items');
    // id=1 was requested first but answered last: fixtures follow request order.
    assert.deepEqual(items.map(f => JSON.parse(f.body).label), ['one', 'two']);
    assert(items.every(f => f.origin === apiOrigin));
    assert.deepEqual(items.map(f => f.match), [fingerprintRequest('?id=1', null), fingerprintRequest('?id=2', null)]);
    const note = recording.network.find(f => f.path === '/notes');
    assert.equal(note?.match, fingerprintRequest('', NOTE, 'application/json'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('replay serves API-origin fixtures by fingerprint while the API server is down', { skip: skipBrowser }, async () => {
  const apiOrigin = `http://127.0.0.1:${await unusedPort()}`;
  await withServer(dashboardServer(apiOrigin), async appUrl => {
    await replaySession(dashboardRecording(appUrl, apiOrigin), { baseUrl: appUrl, browserPath });
  });
});

test('generated spec serves API-origin fixtures by fingerprint on an allowed non-local host', { skip: skipGeneratedTest }, async () => {
  const apiOrigin = `http://127.0.0.1:${await unusedPort()}`;
  await withServer(dashboardServer(apiOrigin), async appUrl => {
    const recording = dashboardRecording(appUrl, apiOrigin);
    const baseUrl = `http://ghostbug.test:${new URL(appUrl).port}`;
    const hostMap = ['--host-resolver-rules=MAP ghostbug.test 127.0.0.1'];
    const refused = await runGeneratedSpec(recording, { GHOSTBUG_BASE_URL: baseUrl, GHOSTBUG_ALLOW_HOST: '' }, hostMap);
    assert.notEqual(refused.code, 0);
    assert.match(refused.output, /refuses to replay against a non-local URL/);
    const allowed = await runGeneratedSpec(recording, { GHOSTBUG_BASE_URL: baseUrl, GHOSTBUG_ALLOW_HOST: 'ghostbug.test' }, hostMap);
    assert.equal(allowed.code, 0, `Generated test failed:\n${allowed.output.slice(-4000)}`);
  });
});
