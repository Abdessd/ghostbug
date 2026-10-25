import { chromium, type Browser, type Request, type Response } from 'playwright';
import { REDACTED, fingerprintRequest, safeUrl, scrubInput, scrubResponseBody, scrubString } from './privacy.ts';
import { writeRecording } from './storage.ts';
import { installCaptureListeners } from './selector-script.ts';
import type { Recording, RecordedAction, NetworkFixture } from './types.ts';
import { createInterface } from 'node:readline';

interface RecordOptions {
  url: string;
  output: string;
  duration?: number;
  headless?: boolean;
  browserPath?: string;
  apiPrefixes?: string[];
  apiOrigins?: string[];
}

function apiOrigin(input: string): string {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw Error(`--api-origin expects an origin such as http://localhost:8000 (got ${input})`);
  }
  return url.origin;
}

export async function recordSession(options: RecordOptions): Promise<string> {
  const startUrl = safeUrl(options.url);
  const origin = new URL(startUrl).origin;
  const apiPrefixes = options.apiPrefixes?.length ? options.apiPrefixes : ['/api/'];
  if (!apiPrefixes.every(prefix => prefix.startsWith('/'))) throw Error('--api-prefix must start with /');
  const apiOrigins = (options.apiOrigins ?? []).map(apiOrigin);
  const browser: Browser = await chromium.launch({
    headless: options.headless ?? false,
    ...(options.browserPath ? { executablePath: options.browserPath } : {})
  });
  const actions: RecordedAction[] = [];
  // Saved in request order, which replay sees too; responses to parallel requests arrive in any order.
  const network: { order: number; fixture: NetworkFixture }[] = [];
  const requestOrder = new WeakMap<Request, number>();
  let requestCount = 0;
  const pending = new Set<Promise<void>>();
  let skippedActions = 0;
  let skippedResponses = 0;
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.exposeBinding('__ghostbug_emit', (_source, raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const event = raw as Record<string, unknown>;
      if (typeof event.selector !== 'string' || event.selector.length > 500 || !event.selector) return;
      // Avoid storing a selector when it visibly contains an email, token or card number.
      if (scrubString(event.selector) !== event.selector) { skippedActions++; return; }
      if (event.type === 'click') actions.push({ type: 'click', selector: event.selector });
      if (event.type === 'check' && typeof event.checked === 'boolean') actions.push({ type: 'check', selector: event.selector, checked: event.checked });
      if (event.type === 'fill') actions.push({ type: 'fill', selector: event.selector, value: scrubInput(event.value) });
    });
    await context.addInitScript(installCaptureListeners);
    const page = await context.newPage();
    page.on('request', request => { requestOrder.set(request, requestCount++); });
    page.on('response', (response: Response) => {
      const task = (async () => {
        try {
          const url = new URL(response.url());
          const fromApp = url.origin === origin && apiPrefixes.some(prefix => url.pathname.startsWith(prefix));
          if (!fromApp && !apiOrigins.includes(url.origin)) return;
          if (scrubString(url.pathname) !== url.pathname) { skippedResponses++; return; }
          const type = response.headers()['content-type'] ?? '';
          if (!type.includes('json') && !type.startsWith('text/plain')) return;
          const responseBody = await response.body();
          if (responseBody.byteLength > 64 * 1024) { skippedResponses++; return; }
          const request = response.request();
          const match = fingerprintRequest(url.search, request.postData(), request.headers()['content-type']);
          network.push({
            order: requestOrder.get(request) ?? Number.MAX_SAFE_INTEGER,
            fixture: {
              method: request.method(), path: url.pathname, ...(url.origin === origin ? {} : { origin: url.origin }),
              status: response.status(),
              contentType: type.split(';')[0] ?? 'application/json',
              body: scrubResponseBody(responseBody.toString('utf8'), type),
              ...(match ? { match } : {})
            }
          });
        } catch { /* Failed or aborted response: skip, don't block recording. */ }
      })();
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
    console.log(`\n🔴 Recording ${startUrl}`);
    console.log('Sensitive input values are replaced with [REDACTED].');
    console.log(`Only JSON/text API responses under ${apiPrefixes.join(', ')}${apiOrigins.length ? ' or from ' + apiOrigins.join(', ') : ''} are captured.`);
    await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    if (options.duration !== undefined) {
      await Promise.race([
        new Promise<void>(resolve => setTimeout(resolve, options.duration)),
        page.waitForEvent('close').then(() => undefined)
      ]);
    } else if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        await Promise.race([
          new Promise<void>(resolve => rl.question('Reproduce the bug, then press Enter to save... ', () => resolve())),
          page.waitForEvent('close').then(() => undefined)
        ]);
      } finally { rl.close(); }
    } else {
      throw Error('Non-interactive terminal: pass --duration <milliseconds>');
    }
    await Promise.allSettled(Array.from(pending));
    const skipped: string[] = [];
    if (skippedActions) skipped.push(`${skippedActions} action(s) dropped: the selector looked like it contained an email, token or card number.`);
    if (skippedResponses) skipped.push(`${skippedResponses} API response(s) not saved (sensitive-looking path or body over 64 KiB). On replay those requests reach the local app (or get HTTP 418 from an --api-origin).`);
    for (const line of skipped) console.warn('⚠ ' + line);
    const recording: Recording = {
      version: 1,
      name: 'recording-' + new Date().toISOString().replace(/[:.]/g, '-'),
      recordedAt: new Date().toISOString(),
      startUrl,
      actions,
      network: network.sort((a, b) => a.order - b.order).map(entry => entry.fixture),
      notes: [
        'Review ALL data before sharing. Automated redaction is not comprehensive.',
        `Input values marked ${REDACTED} must be replaced with safe test values before replay.`,
        'Responses may depend on undisclosed app state. Replay requires an accessible frontend.',
        ...skipped
      ]
    };
    return await writeRecording(options.output, recording);
  } finally {
    await browser.close();
  }
}
