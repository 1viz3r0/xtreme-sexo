import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bannerToneOf,
  updatePresentation,
  type UpdateGateStatus
} from './updateGate';

const base = (overrides: Partial<UpdateGateStatus> = {}): UpdateGateStatus => ({
  app_version: '2.0.2',
  channel: 'stable',
  latest_version: null,
  severity: null,
  mandatory: false,
  advisory_only: true,
  gate_active: false,
  gate_kind: null,
  gate_required_version: null,
  gate_reason: null,
  notes_url: null,
  last_check_at: null,
  last_check_ok: null,
  last_authenticated_at: null,
  min_supported_version: null,
  last_error: null,
  endpoint: 'https://raw.githubusercontent.com/1viz3r0/xtreme-sexo/master/update.json',
  signature_key_id: '939876411A7C0F1B',
  check_in_progress: false,
  install_in_progress: false,
  ...overrides,
});

test('updatePresentation is idle without a backend', () => {
  assert.deepEqual(updatePresentation(null, false), { kind: 'idle' });
});

test('gate state renders as a block with the required version', () => {
  const status = base({
    gate_active: true,
    gate_kind: 'security_floor',
    gate_required_version: '2.0.2',
    gate_reason: 'below the minimum supported version (2.0.2)',
  });
  const frame = updatePresentation(status, false);
  assert.equal(frame.kind, 'gate');
  assert.equal(frame.tone, 'high');
  if (frame.kind === 'gate') {
    assert.equal(frame.required, '2.0.2');
    assert.match(frame.message, /minimum supported version/);
  }
});

test('a fresh boot check shows a checking frame until the timeout', () => {
  const status = base({ check_in_progress: true });
  assert.deepEqual(updatePresentation(status, false), { kind: 'checking' });
  // After 15 s the UI stops waiting; without any prior data it stays quiet.
  assert.equal(updatePresentation(status, true).kind, 'idle');
});

test('a failed boot check degrades to the stale frame, nothing blocks', () => {
  const status = base({
    check_in_progress: true,
    last_error: 'update check network failure',
  });
  assert.equal(updatePresentation(status, true).kind, 'stale');
  assert.equal(status.gate_active, false);
});

test('an unsigned manifest is informational regardless of claimed severity', () => {
  const status = base({
    advisory_only: true,
    latest_version: '2.0.3',
    severity: 'critical',
    mandatory: true,
    gate_reason: 'Update notices for 2.0.3 are informational only.',
  });
  const frame = updatePresentation(status, false);
  assert.equal(frame.kind, 'banner');
  if (frame.kind === 'banner') {
    // Enforcement colours must not be borrowed by unsigned content.
    assert.equal(frame.tone, 'informational');
  }
});

test('verified severities map onto the banner ladder', () => {
  const toneCases = [
    { severity: 'high', tone: 'high' },
    { severity: 'moderate', tone: 'moderate' },
    { severity: 'low', tone: 'low' },
    { severity: 'informational', tone: 'informational' },
    { severity: 'quirky', tone: 'moderate' },
    { severity: null, tone: 'moderate' },
    { severity: 'critical', tone: 'high' },
  ];
  for (const { severity, tone } of toneCases) {
    const status = base({
      advisory_only: false,
      latest_version: '2.0.3',
      severity,
      gate_reason: `A recommended update (2.0.3) is available.`,
    });
    const frame = updatePresentation(status, false);
    assert.equal(frame.kind, 'banner', `severity ${severity}`);
    if (frame.kind === 'banner') {
      assert.equal(frame.tone, tone, `severity ${severity}`);
    }
  }
});

test('no reason means no banner even with a known latest version', () => {
  const status = base({ advisory_only: false, latest_version: '2.0.2', severity: 'moderate' });
  assert.deepEqual(updatePresentation(status, false), { kind: 'idle' });
});

test('bannerToneOf collapses unknown strings into moderate', () => {
  assert.equal(bannerToneOf(''), 'moderate');
  assert.equal(bannerToneOf('weird'), 'moderate');
  assert.equal(bannerToneOf('high'), 'high');
});
