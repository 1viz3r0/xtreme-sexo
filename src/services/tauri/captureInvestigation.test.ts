import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTURE_INVESTIGATION_DEADLINE_MS, CaptureInvestigationTimeoutError, generateCaptureInvestigation, isCaptureInvestigation } from './captureInvestigation';

const conversation = { id: 'fixture', source: 'a', destination: 'b', source_port: null, destination_port: 443, protocol: 'TCP', packets: 1, bytes: 20, first_time: null, last_time: 1.2, packet_numbers: [1] };
const timeline = { packet_number: 1, time: null, kind: 'OTHER', severity: 'INFO', summary: 'Observed TCP packet' };
const anomaly = { id: 'fixture', kind: 'MISSING_TIMESTAMP', severity: 'LOW', confidence: 'observed', summary: 'Packet has no timestamp', reason: 'No timestamp', evidence_packets: [1] };
const sample = { conversations: [conversation], timeline: [timeline], anomalies: [anomaly], generated_from_packets: 1, limitations: ['Metadata only'] };
test('contract accepts current native nullable numeric times/ports and observed confidence', () => { assert.equal(isCaptureInvestigation(sample), true); assert.equal(isCaptureInvestigation({ conversations: [], timeline: [], anomalies: [], generated_from_packets: 0, limitations: [] }), true); });
test('contract rejects old synthetic types, malformed numbers, missing fields and oversized lists', () => {
  for (const bad of [
    { ...sample, conversations: [{ ...conversation, first_time: '0' }] },
    { ...sample, conversations: [{ ...conversation, source_port: 65536 }] },
    { ...sample, conversations: [{ ...conversation, bytes: -1 }] },
    { ...sample, conversations: [{ ...conversation, packets: 1.2 }] },
    { ...sample, timeline: [{ ...timeline, time: Infinity }] },
    { ...sample, anomalies: [{ ...anomaly, confidence: .9 }] },
    { ...sample, conversations: Array(101).fill(conversation) },
    { ...sample, timeline: Array(501).fill(timeline) },
    { ...sample, anomalies: Array(101).fill(anomaly) },
    { ...sample, conversations: [{ ...conversation, packet_numbers: Array(501).fill(1) }] },
    { ...sample, anomalies: [{ ...anomaly, evidence_packets: Array(501).fill(1) }] },
    { ...sample, limitations: undefined },
    { ...sample, payload: 'must not export raw bytes' },
    { ...sample, conversations: [{ ...conversation, payload: 'extra' }] },
  ]) assert.equal(isCaptureInvestigation(bad), false);
});
test('adapter is browser-only guarded and deadline starts before lazy import finishes', async t => {
  await assert.rejects(generateCaptureInvestigation('fixture'), /desktop-only/);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: { invoke: () => new Promise(() => {}) } } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await assert.rejects(generateCaptureInvestigation(' '), /session is required/);
    const request = generateCaptureInvestigation('fixture');
    const rejected = assert.rejects(request, CaptureInvestigationTimeoutError);
    t.mock.timers.tick(CAPTURE_INVESTIGATION_DEADLINE_MS);
    await rejected;
  } finally { t.mock.timers.reset(); if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
});
