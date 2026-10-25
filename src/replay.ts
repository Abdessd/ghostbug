import { chromium, type Page, type Route } from 'playwright';
import type { Recording, NetworkFixture, ReplayOptions } from './types.ts';
import { REDACTED, fingerprintRequest } from './privacy.ts';
import { fixtureKey, resolveReplayTarget } from './safety.ts';

/**
 * Install deterministic HTTP fixtures. Same-origin requests without a fixture reach the local app,
 * requests to a recorded API origin only ever get fixtures, and every other origin is blocked.
 */
export function makeNetworkHandler(recording: Recording, target: URL): (route: Route) => Promise<void> {
  const queued = new Map<string, NetworkFixture[]>();
  for (const fixture of recording.network) {
    const key = fixtureKey(fixture.method, fixture.path, fixture.origin);
    const matches = queued.get(key);
    if (matches) matches.push(fixture);
    else queued.set(key, [fixture]);
  }
  const apiOrigins = new Set(recording.network.flatMap(fixture => fixture.origin ? [fixture.origin] : []));
  return async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    const sameOrigin = url.origin === target.origin;
    if (!sameOrigin && !apiOrigins.has(url.origin)) return route.abort('blockedbyclient');
    const cors = sameOrigin ? {} : { headers: { 'access-control-allow-origin': target.origin, 'access-control-allow-credentials': 'true' } };
    const matches = queued.get(fixtureKey(request.method(), url.pathname, sameOrigin ? '' : url.origin));
    if (!matches) return sameOrigin ? route.continue() : route.fulfill({ status: 418, ...cors, body: 'GhostBug: no recorded response' });
    // Prefer the fixture recorded for the same redacted query and body; otherwise keep recorded order.
    const fingerprint = matches.some(fixture => fixture.match) ? fingerprintRequest(url.search, request.postData(), request.headers()['content-type']) : undefined;
    const [fixture] = matches.splice(Math.max(0, matches.findIndex(f => fingerprint !== undefined && f.match === fingerprint)), 1);
    if (!fixture) return route.fulfill({ status: 418, ...cors, body: 'GhostBug: fixture exhausted' });
    return route.fulfill({ status: fixture.status, contentType: fixture.contentType, ...cors, body: fixture.body });
  };
}

/** Browser-independent navigation is kept outside this function so replay can be tested offline. */
export async function replayActions(page: Page, recording: Recording, expected: string): Promise<void> {
  if (!expected.trim()) throw Error('Specify --expect-text "Expected UI message" before replay');
  for (const [index, action] of recording.actions.entries()) {
    const element = page.locator(action.selector);
    try {
      if (action.type === 'click') await element.click({ timeout: 5000 });
      if (action.type === 'check') {
        if (action.checked) await element.check({ timeout: 5000 });
        else await element.uncheck({ timeout: 5000 });
      }
      if (action.type === 'fill') {
        if (action.value === REDACTED) throw Error('Redacted input: replace with safe fixture data in session.json');
        await element.fill(action.value, { timeout: 5000 });
      }
    } catch (error) {
      throw Error(`Action ${index + 1} (${action.type} on ${action.selector}) failed: ${String(error)}`);
    }
  }
  try {
    await page.getByText(expected, { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    const actual = (await page.locator('body').innerText().catch(() => '(body unavailable)')).slice(0, 500);
    throw Error(`Expected visible text: ${JSON.stringify(expected)}\nActual page text: ${JSON.stringify(actual)}`);
  }
}

export async function replaySession(recording: Recording, options: ReplayOptions = {}): Promise<void> {
  const target = resolveReplayTarget(recording.startUrl, options.baseUrl, options.allowHosts);
  const expected = options.expectText ?? recording.expect?.text;
  if (!expected?.trim()) throw Error('Specify --expect-text "Expected UI message" before replay');
  const browser = await chromium.launch({
    headless: !options.headed,
    ...(options.browserPath ? { executablePath: options.browserPath } : {})
  });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.route('**/*', makeNetworkHandler(recording, target));
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
    await replayActions(page, recording, expected);
  } finally {
    await browser.close();
  }
}
