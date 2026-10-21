import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync(new URL('./ReadinessPanel.tsx', import.meta.url), 'utf8');
const overview = readFileSync(new URL('./OverviewSummary.tsx', import.meta.url), 'utf8');
const watchtower = readFileSync(new URL('./Watchtower.tsx', import.meta.url), 'utf8');
const scanBuddy = readFileSync(new URL('./ScanBuddy.tsx', import.meta.url), 'utf8');

test('Watchtower and Scan Buddy keep the shared bounded readiness diagnostic', () => {
  for (const source of [watchtower, scanBuddy]) {
    assert.match(source, /ReadinessPanel/);
  }
  assert.doesNotMatch(overview, /ReadinessPanel/);
  assert.match(panel, /getBackendReadiness/);
  assert.match(panel, /Native backend unavailable/);
  assert.match(panel, /Rebuild or reinstall the desktop app/);
  assert.match(panel, /Backend \{backendReady/);
  assert.match(panel, /Missing:/);
});
