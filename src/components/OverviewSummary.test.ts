import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getOverviewActionQueue, getOverviewNextStep } from '../lib/overview';
import { formatObservedThroughput, formatSnapshotAge, getOverviewDataState } from './OverviewSummary.tsx';

const overviewSource = readFileSync(new URL('./OverviewSummary.tsx', import.meta.url), 'utf8');

test('overview is a black and charcoal GOD\'S EYE cockpit without gradients or purple classes', () => {
  assert.doesNotMatch(overviewSource, /purple|violet|gradient/i);
  assert.match(overviewSource, /GOD'S EYE VIEW/);
  assert.match(overviewSource, /NET0ZE \/ GOD'S EYE/);
  assert.match(overviewSource, /bg-\[#0b0b0b\]/);
  assert.match(overviewSource, /border-\[#292929\]/);
  assert.doesNotMatch(overviewSource, /rounded-full/);
});

test('overview states the God\'s Eye evidence boundary and preserves unavailable data', () => {
  assert.match(overviewSource, /globe-first view of this node's observed network evidence/);
  assert.match(overviewSource, /No complete-network claim/);
  assert.match(overviewSource, /Observed capture/);
  assert.match(overviewSource, /NATIVE DATA UNAVAILABLE/);
  assert.match(overviewSource, /AWAITING NATIVE SNAPSHOT/);
  assert.doesNotMatch(overviewSource, /API failure|request failed|endpoint error|GODMODE|Prioritized action queue/i);
});

test('overview chooses a truthful first action from loaded evidence', () => {
  assert.deepEqual(getOverviewNextStep(null, 'Native desktop required'), {
    label: 'Open the native desktop app',
    tab: null,
  });
  assert.deepEqual(getOverviewNextStep(null), {
    label: 'Load a native snapshot',
    tab: 'watchtower',
  });
  assert.deepEqual(getOverviewNextStep({
    detection_summary: { critical_count: 0, high_count: 2 },
  } as never), {
    label: 'Review high-priority evidence',
    tab: 'conversations',
  });
});

test('overview keeps the existing bounded action policy available to other workspaces', () => {
  const queue = getOverviewActionQueue({
    detection_summary: { critical_count: 1, high_count: 2, active_count: 3 },
    capture_availability: { state: 'AVAILABLE', detail: 'native capture' },
    flow_summary: { active_flows_count: 4 },
  } as never);
  assert.deepEqual(queue.map(({ priority, tab }) => [priority, tab]), [
    ['P1', 'conversations'],
    ['P2', 'conversations'],
    ['P3', 'system_logs'],
  ]);
  assert.match(queue[0].detail, /critical\/high/);
  assert.doesNotMatch(overviewSource, /Prioritized action queue/);
});

test('overview distinguishes unavailable, stale, loaded, and awaiting data states', () => {
  assert.equal(getOverviewDataState(null, 'Native desktop required'), 'unavailable');
  assert.equal(getOverviewDataState({} as never, 'Snapshot stale'), 'stale');
  assert.equal(getOverviewDataState({} as never), 'loaded');
  assert.equal(getOverviewDataState(null), 'awaiting');
});

test('overview presents bounded snapshot age and handles invalid timestamps', () => {
  const now = Date.parse('2026-10-21T12:00:00.000Z');
  assert.equal(formatSnapshotAge('2026-10-21T11:59:45.000Z', now), '15s ago');
  assert.equal(formatSnapshotAge('2026-10-21T11:10:00.000Z', now), '50m ago');
  assert.equal(formatSnapshotAge('2026-10-20T12:00:00.000Z', now), '1d ago');
  assert.equal(formatSnapshotAge('not-a-timestamp', now), 'timestamp unavailable');
  assert.equal(formatSnapshotAge('2026-10-21T12:00:01.000Z', now), 'timestamp in future');
  assert.match(overviewSource, /LAST SNAPSHOT \/ STALE/);
});

test('overview labels capture throughput as observed data and never as capacity', () => {
  assert.equal(formatObservedThroughput(2048, 12, true), '2.0 KB/s · 12 pkt/s');
  assert.equal(formatObservedThroughput(2048, 12, false), 'Unavailable');
  assert.equal(formatObservedThroughput(Number.NaN, 12, true), 'Unavailable');
  assert.match(overviewSource, /Observed capture/);
  assert.match(overviewSource, /No complete-network claim/);
  assert.doesNotMatch(overviewSource, /Internet speed|bandwidth capacity|speed test result/i);
});

test('overview includes responsive telemetry regions and keyboard-visible controls', () => {
  assert.match(overviewSource, /sm:grid-cols-2 xl:grid-cols-5/);
  assert.match(overviewSource, /focus-visible:ring-2/);
  assert.match(overviewSource, /aria-labelledby="gods-eye-title"/);
  assert.match(overviewSource, /aria-label="God's Eye navigation"/);
  assert.match(overviewSource, /aria-label="God's Eye telemetry"/);
});
