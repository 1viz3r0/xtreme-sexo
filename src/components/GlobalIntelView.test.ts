import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { captureIsRunning } from './GlobalIntelView';

const overviewSource = readFileSync(new URL('./GlobalIntelView.tsx', import.meta.url), 'utf8');

test('overview distinguishes native availability, empty local snapshots, and real refresh errors', () => {
  assert.match(overviewSource, /Browser mode — local telemetry unavailable/);
  assert.match(overviewSource, /Loading current-session snapshot…/);
  assert.match(overviewSource, /No observed flows in this session/);
  assert.match(overviewSource, /No observed endpoints with coordinates in this session/);
  assert.match(overviewSource, /No recorded alerts — capture is not running or unavailable/);
  assert.match(overviewSource, /last successful snapshot is stale/);
  assert.match(overviewSource, /Snapshot stale/);
  assert.doesNotMatch(overviewSource, /No observed flows in this session[^\n]*API failure/i);
});

test('overview treats both active capture status contracts as running', () => {
  assert.equal(captureIsRunning('RUNNING'), true);
  assert.equal(captureIsRunning('LIVE'), true);
  assert.equal(captureIsRunning('STOPPED'), false);
  assert.equal(captureIsRunning('UNAVAILABLE'), false);
});
