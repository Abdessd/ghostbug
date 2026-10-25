import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Recording, RecordedAction, NetworkFixture } from './types.ts';

export async function writeRecording(location: string, recording: Recording): Promise<string> {
  const filename = location.endsWith('.json') ? resolve(location) : resolve(location, 'session.json');
  await mkdir(dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(recording, null, 2) + '\n', 'utf8');
  return filename;
}

function validAction(a: unknown): a is RecordedAction {
  if (!a || typeof a !== 'object') return false;
  const v = a as Record<string, unknown>;
  if (typeof v.selector !== 'string' || !v.selector || v.selector.length > 500) return false;
  if (v.type === 'click') return true;
  if (v.type === 'fill') return typeof v.value === 'string' && v.value.length <= 10000;
  if (v.type === 'check') return typeof v.checked === 'boolean';
  return false;
}
function validFixture(f: unknown): f is NetworkFixture {
  if (!f || typeof f !== 'object') return false;
  const v = f as Record<string, unknown>;
  return typeof v.method === 'string' && /^[A-Z]+$/.test(v.method) &&
    typeof v.path === 'string' && v.path.length <= 2048 && v.path.startsWith('/') && !v.path.startsWith('//') && !/[?#]/.test(v.path) &&
    typeof v.status === 'number' && Number.isInteger(v.status) && v.status >= 100 && v.status <= 599 &&
    typeof v.body === 'string' && Buffer.byteLength(v.body, 'utf8') <= 64 * 1024 &&
    typeof v.contentType === 'string' && v.contentType.length <= 100;
}
export function parseRecording(input: unknown): Recording {
  if (!input || typeof input !== 'object') throw Error('Invalid recording: expected object');
  const value = input as Record<string, unknown>;
  if (value.version !== 1 || typeof value.name !== 'string' || value.name.length > 250 ||
      typeof value.startUrl !== 'string' || typeof value.recordedAt !== 'string' ||
      !Array.isArray(value.actions) || value.actions.length > 10000 || !value.actions.every(validAction) ||
      !Array.isArray(value.network) || value.network.length > 2000 || !value.network.every(validFixture)) {
    throw Error('Unsupported or malformed session.json (expected GhostBug v1)');
  }
  const url = new URL(value.startUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('Only HTTP/HTTPS origins are supported');
  if (url.username || url.password) throw Error('URLs containing credentials are not allowed');
  if (value.expect !== undefined && (!value.expect || typeof value.expect !== 'object' || typeof (value.expect as { text?: unknown }).text !== 'string')) {
    throw Error('Invalid expect.text');
  }
  if (value.notes !== undefined && (!Array.isArray(value.notes) || !value.notes.every(item => typeof item === 'string'))) {
    throw Error('Invalid notes: expected a list of strings');
  }
  return value as unknown as Recording;
}
export async function readRecording(location: string): Promise<Recording> {
  const filename = resolve(location.endsWith('.json') ? location : join(location, 'session.json'));
  return parseRecording(JSON.parse(await readFile(filename, 'utf8')));
}
