/** Conservative default for a tool that replays potentially mutating user actions. */
export function isLocalhost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());
}

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

export function resolveReplayTarget(startUrl: string, baseUrl?: string, allowHosts: string[] = []): URL {
  for (const host of allowHosts) {
    if (!/^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)*|\[?[0-9a-f:.]+\]?)$/i.test(host)) {
      throw Error(`--allow-host expects a hostname such as staging.local, without scheme, port or wildcard (got ${host})`);
    }
  }
  const recorded = new URL(startUrl);
  const base = new URL(baseUrl ?? recorded.origin);
  // --allow-host is an explicit opt-in for non-production hosts such as staging or Docker service names.
  const allowed = isLocalhost(base.hostname) || allowHosts.some(host => bareHost(host) === bareHost(base.hostname));
  // Do not accept usernames, passwords or implicit changes to the recorded path.
  if (!['http:', 'https:'].includes(base.protocol) || !allowed || base.username || base.password) {
    throw Error('Safety guard: replay is localhost-only. Use --base-url http://localhost:3000 (no credentials), or --allow-host <host> for a non-production host.');
  }
  return new URL(recorded.pathname, base.origin);
}

/** Fixture lookup key. Callers must still check the request origin; `origin` is set only for --api-origin fixtures. */
export function fixtureKey(method: string, path: string, origin = ''): string {
  return `${method.toUpperCase()} ${origin}${path}`;
}
