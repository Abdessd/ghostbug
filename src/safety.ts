/** Conservative default for a tool that replays potentially mutating user actions. */
export function isLocalhost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname.toLowerCase());
}

export function resolveReplayTarget(startUrl: string, baseUrl?: string): URL {
  const recorded = new URL(startUrl);
  const base = new URL(baseUrl ?? recorded.origin);
  // Do not accept usernames, passwords or implicit changes to the recorded path.
  if (!['http:', 'https:'].includes(base.protocol) || !isLocalhost(base.hostname) || base.username || base.password) {
    throw Error('Safety guard: replay is localhost-only. Use --base-url http://localhost:3000 (no credentials).');
  }
  return new URL(recorded.pathname, base.origin);
}

/** Fixture lookup key (method + path only). Callers must check the request origin separately. */
export function fixtureKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}
