import { chromium, type Page, type Route } from 'playwright';
import type { Recording, NetworkFixture, ReplayOptions } from './types.ts';
import { REDACTED } from './privacy.ts';
import { fixtureKey, resolveReplayTarget } from './safety.ts';

/** Install deterministic same-origin HTTP fixtures and reject cross-origin requests. */
export function makeNetworkHandler(recording: Recording, target: URL): (route: Route) => Promise<void> {
  const queued = new Map<string, NetworkFixture[]>();
  for (const fixture of recording.network) {
    const key = fixtureKey(fixture.method, fixture.path);
    const matches = queued.get(key);
    if (matches) matches.push(fixture);
    else queued.set(key, [fixture]);
  }
  return async (route: Route): Promise<void> => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== target.origin) return route.abort('blockedbyclient');
    const key = fixtureKey(request.method(), url.pathname);
    const matches = queued.get(key);
    if (matches) {
      const fixture = matches.shift();
      if (!fixture) return route.fulfill({ status: 418, body: 'GhostBug: fixture exhausted' });
      return route.fulfill({ status: fixture.status, contentType: fixture.contentType, body: fixture.body });
    }
    return route.continue();
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
  const target = resolveReplayTarget(recording.startUrl, options.baseUrl);
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
