import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportCaptureInvestigationBundle, exportCaptureInvestigationJson, exportCaptureInvestigationMarkdown, projectCaptureInvestigation } from './captureInvestigationPresentation';
import type { CaptureInvestigation } from '../services/tauri/captureInvestigation';

const sample: CaptureInvestigation = { conversations: [{ id: 'fixture', source: 'a', destination: 'b', source_port: null, destination_port: 443, protocol: 'TCP', packets: 2, bytes: 12, first_time: null, last_time: 1, packet_numbers: [1, 2] }], timeline: [{ packet_number: 1, time: null, kind: 'DNS', summary: '<script>\n# heading [link](javascript:bad) `code`', severity: 'LOW' }], anomalies: [{ id: 'x', kind: 'DNS', severity: 'LOW', confidence: 'observed', summary: 'summary', evidence_packets: [1], reason: 'reason' }], generated_from_packets: 2, limitations: ['limited'] };
test('projects metadata search, filters, sort and bounded pages without mutating source', () => {
  const value = { ...sample, timeline: Array.from({ length: 120 }, (_, i) => ({ ...sample.timeline[0], packet_number: i, time: i })) };
  const first = projectCaptureInvestigation(value, { severity: 'low' });
  assert.equal(first.timeline.length, 50); assert.equal(first.timeline[0].time, 119); assert.equal(first.truncated, true);
  assert.equal(projectCaptureInvestigation(value, { page: 1 }).timeline[0].time, 69);
  assert.equal(projectCaptureInvestigation(value, { timelineSort: 'oldest' }).timeline[0].time, 0);
  assert.equal(projectCaptureInvestigation(value, { search: 'absent' }).timeline.length, 0);
  assert.equal(projectCaptureInvestigation(sample, { search: 'tcp' }).conversations.length, 1);
  assert.equal(value.timeline[0].time, 0);
});
test('Markdown neutralizes HTML, links, formatting and newline injection; JSON keeps unknown nulls', () => {
  const md = exportCaptureInvestigationMarkdown(sample);
  assert.match(md, /&lt;script&gt;/); assert.doesNotMatch(md, /\n# heading|<script>|\[link\]\(javascript/);
  assert.ok(md.includes('\\`code\\`')); assert.match(md, /unknown/);
  const json = JSON.parse(exportCaptureInvestigationJson(sample)); assert.equal(json.timeline[0].time, null); assert.equal(json.conversations[0].source_port, null);
  assert.equal(json.anomalies[0].confidence, 'observed');
});
test('bundle explicitly describes filtered bounded metadata and no proof', () => {
  const bundle = JSON.parse(exportCaptureInvestigationBundle(sample, { search: 'absent' }));
  assert.equal(bundle.metadata_only, true); assert.equal(bundle.source_bytes_included, false); assert.match(bundle.note, /No PCAP.*hash/); assert.equal(bundle.investigation.timeline.length, 0);
});
test('invalid bounds fall back and preview never exceeds 50', () => { assert.equal(projectCaptureInvestigation(sample, {}, 0).conversations.length, 1); assert.equal(projectCaptureInvestigation({ ...sample, timeline: Array(100).fill(sample.timeline[0]) }, {}, 500).timeline.length, 50); });
