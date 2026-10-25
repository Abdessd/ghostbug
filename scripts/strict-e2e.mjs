#!/usr/bin/env node
// Ensure E2E release checks cannot be silently skipped in CI or on developer machines.
import { spawn } from 'node:child_process';

const child = spawn(process.execPath, [
  '--experimental-strip-types', '--test', 'tests/e2e/replay.test.ts'
], { stdio: 'inherit', env: { ...process.env, GHOSTBUG_REQUIRE_E2E: '1' } });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
