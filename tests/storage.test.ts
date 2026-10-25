import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecording, writeRecording } from '../src/storage.ts';
import type { Recording } from '../src/types.ts';

test('roundtrips a versioned recording on disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ghostbug-test-'));
  const data: Recording = { version: 1, name: 'sample', recordedAt: new Date(0).toISOString(), startUrl: 'http://localhost:3000/', actions: [], network: [] };
  try {
    await writeRecording(dir, data);
    assert.deepEqual(await readRecording(dir), data);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
