import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureFilterForIp,
  filterPacketsForIp,
  isPcapDestination,
  nextDueLabel,
  osBadge,
  packetStats,
  portSummary,
  scanStateLabel,
  searchNotes,
  sourceBadge,
} from './ipIntelPresentation';

const row = (number: number, source: string, destination: string, protocol: string, length: string) => ({
  number,
  time: `0.000${number}`,
  source,
  destination,
  protocol,
  length,
  info: `${protocol} payload`,
});

test('captureFilterForIp builds a host-scoped BPF filter', () => {
  assert.equal(captureFilterForIp('192.168.1.10'), 'host 192.168.1.10');
  assert.equal(captureFilterForIp(' 192.168.1.10 '), 'host 192.168.1.10');
  // Malicious or malformed input yields an empty (refused) filter.
  assert.equal(captureFilterForIp('8.8.8.8; rm -rf /'), '');
});

test('filterPacketsForIp applies src/dst/both modes exactly', () => {
  const rows = [
    row(1, '192.168.1.10', '192.168.1.1', 'TCP', '60'),
    row(2, '192.168.1.1', '192.168.1.10', 'UDP', '300'),
    row(3, '10.0.0.5', '10.0.0.6', 'TCP', '52'),
  ];
  assert.deepEqual(filterPacketsForIp(rows, '192.168.1.10', 'both').map(r => r.number), [1, 2]);
  assert.deepEqual(filterPacketsForIp(rows, '192.168.1.10', 'src').map(r => r.number), [1]);
  assert.deepEqual(filterPacketsForIp(rows, '192.168.1.10', 'dst').map(r => r.number), [2]);
  // Unrelated traffic is dropped in every mode.
  assert.deepEqual(filterPacketsForIp(rows, '10.0.0.5', 'dst').map(r => r.number), []);
});

test('packetStats aggregates count, bytes, protocols and peers', () => {
  const stats = packetStats([
    row(1, '192.168.1.10', '192.168.1.1', 'TCP', '60'),
    row(2, '192.168.1.1', '192.168.1.10', 'TCP', '300'),
    row(3, '192.168.1.10', '192.168.1.1', 'DNS', '90'),
  ]);
  assert.equal(stats.count, 3);
  assert.equal(stats.bytes, 450);
  assert.equal(stats.protocols[0]?.protocol, 'TCP');
  assert.equal(stats.protocols[0]?.count, 2);
});

test('portSummary renders bounded port lists and tolerates junk', () => {
  assert.equal(portSummary(null), 'None observed');
  assert.equal(portSummary('[]'), 'None observed');
  assert.equal(portSummary('[22,80,443]'), '22, 80, 443');
  assert.equal(portSummary('not-json'), 'Recorded');
  const many = JSON.stringify(Array.from({ length: 15 }, (_, i) => i + 1));
  assert.equal(portSummary(many), '1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 +3');
});

test('scanStateLabel and osBadge keep detected/inferred/unknown honest', () => {
  assert.deepEqual(scanStateLabel('completed'), { label: 'Completed', tone: 'ok' });
  assert.deepEqual(scanStateLabel('skipped-busy').tone, 'warn');
  assert.deepEqual(scanStateLabel(null).label, 'Not scanned yet');

  const medium = osBadge('inferred · medium confidence', 'Windows (SMB/RDP present)');
  assert.equal(medium.kind, 'medium');
  assert.match(medium.text, /Inferred · medium/);

  const low = osBadge('inferred · low confidence', 'Linux/Unix (SSH present)');
  assert.equal(low.kind, 'low');

  const unknown = osBadge('unknown · no fingerprint evidence', null);
  assert.equal(unknown.kind, 'unknown');
  assert.match(unknown.text, /Unknown/);
});

test('nextDueLabel falls back to nothing scheduled for junk timestamps', () => {
  assert.equal(nextDueLabel(null), 'Nothing scheduled');
  assert.match(nextDueLabel(new Date(Date.now() + 60_000).toISOString()), /Next due/);
});

test('searchNotes matches body and ip, newest first', () => {
  const notes = [
    { id: 1, ip: '192.168.1.10' as string | null, body: 'Odd ARP behavior', created_at: 1, updated_at: 5 },
    { id: 2, ip: null, body: 'General session plan', created_at: 2, updated_at: 9 },
    { id: 3, ip: '10.0.0.5', body: 'printer room', created_at: 3, updated_at: 7 },
  ];
  assert.deepEqual(searchNotes(notes, '').map(n => n.id), [2, 3, 1]);
  assert.deepEqual(searchNotes(notes, 'arp').map(n => n.id), [1]);
  assert.deepEqual(searchNotes(notes, '192.168.1.10').map(n => n.id), [1]);
  assert.deepEqual(searchNotes(notes, 'PRINTER').map(n => n.id), [3]);
  assert.deepEqual(searchNotes(notes, 'nothing-matches'), []);
});

test('isPcapDestination requires an explicit pcap extension', () => {
  assert.ok(isPcapDestination('/tmp/capture.pcap'));
  assert.ok(isPcapDestination('/tmp/capture.pcapng'));
  assert.equal(isPcapDestination('/tmp/capture.txt'), false);
  assert.equal(isPcapDestination(''), false);
});

test('sourceBadge distinguishes manual, passive and traffic provenance', () => {
  assert.deepEqual(sourceBadge('manual', 'manual'), { label: 'Manual', tone: 'manual' });
  assert.deepEqual(sourceBadge('traffic', 'observed'), { label: 'Traffic', tone: 'traffic' });
  assert.deepEqual(sourceBadge('kernel-neighbors', 'observed'), { label: 'Passive', tone: 'passive' });
});
