import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const overviewSource = readFileSync(new URL('./OverviewSummary.tsx', import.meta.url), 'utf8');

test('overview summary uses neutral UI styling without purple or violet classes', () => {
  assert.doesNotMatch(overviewSource, /purple|violet/i);
  assert.match(overviewSource, /border-\[#525252\]/);
  assert.match(overviewSource, /text-slate-200/);
});

test('overview labels local snapshot availability without claiming empty data is an API failure', () => {
  assert.match(overviewSource, /Local evidence, current session, and cached observations/);
  assert.match(overviewSource, /Sources are not health claims; unavailable data stays unavailable/);
  assert.doesNotMatch(overviewSource, /API failure|request failed|endpoint error/i);
});
