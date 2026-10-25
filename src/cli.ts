#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { generateSpec } from './generator.ts';
import { readRecording, writeRecording } from './storage.ts';

const HELP = `
GhostBug v0.1.2 — Record a browser bug. Make it reproducible.

Usage:
  ghostbug record <url> [--out <dir>] [--duration <ms>] [--headless] [--browser <path>]
                  [--api-prefix <paths>] [--api-origin <origins>]
  ghostbug generate <recording-dir> --expect-text <text> [--out <file>]
  ghostbug replay <recording-dir> [--expect-text <text>] [--base-url <url>] [--allow-host <hosts>]
                  [--browser <path>] [--headed]

Examples:
  ghostbug record http://localhost:3000/checkout --out .ghostbug/checkout
  ghostbug generate .ghostbug/checkout --expect-text "Payment failed. Please retry."
  ghostbug replay .ghostbug/checkout --base-url http://localhost:3000

Options:
  --api-prefix <paths>   Capture same-origin API responses under these paths, comma-separated (default /api/)
  --api-origin <origins> Also capture every JSON/text response from these origins (e.g. http://localhost:8000)
  --allow-host <hosts>   Allow replay against these non-production hostnames besides localhost
  --duration <ms>        Stop recording after N milliseconds (for noninteractive scripts)
  --browser <path>       Use an installed Chromium executable (e.g. /usr/bin/chromium)
  --headless             Record without a visible browser (requires --duration)
  --headed               Show browser during replay
  --help                 Show this message

Generated specs read GHOSTBUG_BASE_URL and GHOSTBUG_ALLOW_HOST instead of --base-url and --allow-host.

WARNING: All recordings are local. Privacy filters are best-effort; REVIEW before sharing.
`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  if (i + 1 >= args.length || args[i + 1].startsWith('--')) throw Error(`Missing value for ${name}`);
  return args[i + 1];
}
/** All values of a repeatable flag, each of which may also be a comma-separated list. */
function flagList(args: string[], name: string): string[] {
  const values: string[] = [];
  args.forEach((arg, i) => {
    if (arg !== name) return;
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) throw Error(`Missing value for ${name}`);
    values.push(...args[i + 1].split(',').map(value => value.trim()).filter(Boolean));
  });
  return values;
}
function positional(args: string[]): string[] {
  const valued = new Set(['--out', '--duration', '--browser', '--expect-text', '--base-url', '--api-prefix', '--api-origin', '--allow-host']);
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valued.has(args[i])) { i++; continue; }
    if (!args[i].startsWith('--')) result.push(args[i]);
  }
  return result;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || args.includes('--help') || command === '--help') {
    process.stdout.write(HELP);
    return;
  }
  const location = positional(args)[0];
  if (!location) throw Error(`Missing recording directory or URL for command: ${command}`);

  if (command === 'record') {
    const { recordSession } = await import('./recorder.ts');
    const durationRaw = flag(args, '--duration');
    const duration = durationRaw === undefined ? undefined : Number(durationRaw);
    if (duration !== undefined && (!Number.isSafeInteger(duration) || duration < 100)) throw Error('--duration must be an integer >= 100');
    const output = flag(args, '--out') ?? `.ghostbug/recording-${Date.now()}`;
    const file = await recordSession({
      url: location, output, duration,
      headless: args.includes('--headless'),
      browserPath: flag(args, '--browser') ?? process.env.CHROMIUM_PATH,
      apiPrefixes: flagList(args, '--api-prefix'),
      apiOrigins: flagList(args, '--api-origin')
    });
    console.log(`\n✓ Saved ${file}`);
    console.log(`Next: ghostbug generate ${output} --expect-text "The correct behavior"`);
  } else if (command === 'generate') {
    const data = await readRecording(location);
    const expected = flag(args, '--expect-text') ?? data.expect?.text;
    if (!expected) throw Error('Provide --expect-text "The expected message after the fix"');
    data.expect = { text: expected };
    await writeRecording(location, data);
    const output = resolve(flag(args, '--out') ?? resolve(location.endsWith('.json') ? dirname(location) : location, 'ghostbug.spec.ts'));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, generateSpec(data), 'utf8');
    console.log(`✓ Generated ${output}`);
    console.log(`Replay: ghostbug replay ${location}`);
    console.log('Playwright test: npx playwright test <generated-file> (requires @playwright/test in the project)');
  } else if (command === 'replay') {
    const data = await readRecording(location);
    const { replaySession } = await import('./replay.ts');
    const allowHosts = flagList(args, '--allow-host');
    if (allowHosts.length) console.warn('⚠ --allow-host: requests without a recorded response reach that server. Never point replay at production.');
    await replaySession(data, {
      baseUrl: flag(args, '--base-url'),
      allowHosts,
      expectText: flag(args, '--expect-text'),
      headed: args.includes('--headed'),
      browserPath: flag(args, '--browser') ?? process.env.CHROMIUM_PATH
    });
    console.log('✓ PASS — expected behavior observed');
  } else {
    throw Error(`Unknown command: ${command}\n${HELP}`);
  }
}

main().catch(error => {
  console.error('✗ ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
});
