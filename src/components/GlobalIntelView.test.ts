import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { captureIsRunning } from './GlobalIntelView';

const overviewSource = readFileSync(new URL('./GlobalIntelView.tsx', import.meta.url), 'utf8');

test('overview distinguishes native availability, empty local snapshots, and real refresh errors', () => {
  assert.match(overviewSource, /BROWSER MODE · LOCAL TELEMETRY UNAVAILABLE/);
  assert.match(overviewSource, /LOADING NATIVE SNAPSHOT/);
  assert.match(overviewSource, /No geolocated contacts in this session/);
  assert.match(overviewSource, /Native endpoint telemetry unavailable/);
  assert.match(overviewSource, /No recorded alerts — capture is not running or unavailable/);
  assert.match(overviewSource, /Last endpoint snapshot is stale/);
  assert.match(overviewSource, /Snapshot stale/);
  assert.match(overviewSource, /GOD'S EYE \/ LIVE EARTH/);
  assert.match(overviewSource, /CAPTURE CONTROL/);
  assert.doesNotMatch(overviewSource, /CURRENT-SESSION FLOWS/);
});

test('overview treats both active capture status contracts as running', () => {
  assert.equal(captureIsRunning('RUNNING'), true);
  assert.equal(captureIsRunning('LIVE'), true);
  assert.equal(captureIsRunning('STOPPED'), false);
  assert.equal(captureIsRunning('UNAVAILABLE'), false);
});
