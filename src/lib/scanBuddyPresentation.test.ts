import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_WARNING, exportScan, projectScanResults, requestKey, scanProgress, validateScanRequest } from './scanBuddyPresentation';
import { cancelScan, planScan, scanBuddyAvailable, scanHistory, scanStatus, startScan, type ScanJob, type ScanRequest, type ScanResult } from '../services/tauri/scanBuddy';

const request: ScanRequest = { targets: '127.0.0.1, ::1', ports: '22,80,443', timeout_ms: 800, concurrency: 4, authorized: true };
const result: ScanResult = { target: '127.0.0.1', port: 80, state: 'OPEN', service_hint: 'http', latency_ms: 5, observed_at: '2026-10-05T00:00:00Z' };
const job: ScanJob = { id: 'test', state: 'COMPLETED', started_at: result.observed_at, finished_at: result.observed_at, plan: { targets: ['127.0.0.1'], ports: [80], total_probes: 1, timeout_ms: 800, concurrency: 4, warnings: [] }, completed_probes: 1, results: [result], error: null };

test('accepts literal IPv4/IPv6, small CIDRs, port ranges and boundaries', () => {
  assert.deepEqual(validateScanRequest(request), []);
  assert.deepEqual(validateScanRequest({ ...request, targets: '10.0.0.0/27', ports: '1-128', timeout_ms: 100, concurrency: 16 }), []);
  assert.deepEqual(validateScanRequest({ ...request, targets: '2001:db8::1 ::ffff:192.0.2.1', ports: '65535', timeout_ms: 2000, concurrency: 1 }), []);
});
test('rejects DNS, malformed addresses, zones, large CIDRs, ports, numeric limits and missing consent', () => {
  for (const targets of ['', 'example.com', '127.1', '256.1.1.1', '01.2.3.4', 'fe80::1%eth0', 'http://127.0.0.1', '10.0.0.0/26', '::1/128', '10.0.0.1/33', '10.0.0.1/30/2']) assert.ok(validateScanRequest({ ...request, targets }).length, targets);
  for (const ports of ['', '0', '65536', '80-22', '80,', 'http', '1-257']) assert.ok(validateScanRequest({ ...request, ports }).length, ports);
  for (const timeout_ms of [99, 2001, NaN, 100.5]) assert.ok(validateScanRequest({ ...request, timeout_ms }).length);
  for (const concurrency of [0, 17, NaN, 1.5]) assert.ok(validateScanRequest({ ...request, concurrency }).length);
  assert.ok(validateScanRequest({ ...request, authorized: false }).some(error => error.includes('authorization')));
});
test('enforces bounded target and probe counts and de-duplicates literal tokens/ports', () => {
  assert.deepEqual(validateScanRequest({ ...request, targets: '127.0.0.1 127.0.0.1', ports: '1-256,1-256' }), []);
  assert.deepEqual(validateScanRequest({ ...request, targets: '10.0.0.0/27 10.0.0.2 10.0.0.8/29', ports: '1-128' }), []);
  assert.deepEqual(validateScanRequest({ ...request, targets: '::1 0:0:0:0:0:0:0:1', ports: '1-256' }), []);
  assert.ok(validateScanRequest({ ...request, targets: Array.from({ length: 33 }, (_, index) => `10.0.0.${index}`).join(',') }).some(error => error.includes('32 targets')));
  assert.ok(validateScanRequest({ ...request, targets: '10.0.0.0/27,10.0.0.32,10.0.0.33', ports: '1-129' }).some(error => error.includes('4,096')));
  assert.deepEqual(validateScanRequest({ ...request, targets: '10.0.0.0/27,10.0.0.32,10.0.0.33', ports: '1-128' }), []);
  assert.ok(validateScanRequest({ ...request, targets: '1'.repeat(8193) }).some(error => error.includes('too long')));
});
test('every request edit invalidates the preview fingerprint', () => {
  for (const patch of [{ targets: '::1' }, { ports: '443' }, { authorized: false }, { concurrency: 8 }, { timeout_ms: 900 }]) assert.notEqual(requestKey(request), requestKey({ ...request, ...patch }));
});
test('projects state and case-insensitive search with non-mutating numeric sorting', () => {
  const rows: ScanResult[] = [result, { ...result, target: '10.0.0.2', port: 443, state: 'CLOSED', latency_ms: 1 }, { ...result, target: '10.0.0.10', port: 22, service_hint: 'ssh', latency_ms: 8 }];
  assert.deepEqual(projectScanResults(rows, 'OPEN', 'SSH', 'port').map(row => row.port), [22]);
  assert.deepEqual(projectScanResults(rows, 'ALL', '', 'latency', true).map(row => row.latency_ms), [8, 5, 1]);
  assert.deepEqual(projectScanResults(rows, 'ALL', '10.0.0', 'endpoint').map(row => row.target), ['10.0.0.2', '10.0.0.10']);
  assert.equal(rows[0], result);
});
test('clamps progress including empty plans', () => {
  assert.equal(scanProgress(job), 100);
  assert.equal(scanProgress({ ...job, completed_probes: 20 }), 100);
  assert.equal(scanProgress({ ...job, completed_probes: -1 }), 0);
  assert.equal(scanProgress({ ...job, plan: { ...job.plan, total_probes: 0 } }), 0);
});
test('exports preserve full observations and disclose endpoint/service/latency limits', () => {
  const parsed = JSON.parse(exportScan(job, 'json'));
  assert.equal(parsed.warning, EXPORT_WARNING);
  assert.deepEqual(parsed.scan, job);
  for (const format of ['csv', 'md'] as const) {
    const output = exportScan(job, format);
    assert.ok(output.includes('127.0.0.1'));
    assert.ok(output.includes('not verified'));
    assert.ok(output.includes('not ping'));
  }
});
test('CSV escapes quotes/newlines and neutralizes spreadsheet formula injection', () => {
  const hostile = { ...job, results: [{ ...result, service_hint: ' =HYPERLINK("x")\nnext' }] };
  const output = exportScan(hostile, 'csv');
  assert.ok(output.includes('"\' =HYPERLINK(""x"")\nnext"'));
  assert.ok(output.includes('\r\n'));
});
test('Markdown escapes table delimiters, newlines, backslashes and HTML', () => {
  const output = exportScan({ ...job, results: [{ ...result, service_hint: '<script>|a\\b\nnext' }] }, 'md');
  assert.ok(output.includes('&lt;script&gt;\\|a\\\\b next'));
  assert.ok(!output.includes('<script>'));
});
test('desktop service rejects SSR/browser requests rather than returning fake success; read lane recovers', async () => {
  assert.equal(scanBuddyAvailable(), false);
  await assert.rejects(planScan(request), /desktop-only/);
  await assert.rejects(scanStatus('job'), /desktop-only/);
  await assert.rejects(scanHistory(), /desktop-only/);
});
test('native IPC uses exact envelopes and serializes status/history reads across callers', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls: { command: string; args: unknown }[] = [];
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const blocked = new Promise<ScanJob>(resolve => { release = () => resolve(job); });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: { invoke: (command: string, args: unknown) => {
    calls.push({ command, args });
    if (command === 'scan_buddy_status') { entered(); return blocked; }
    if (command === 'scan_buddy_history') return Promise.resolve([job]);
    if (command === 'scan_buddy_plan') return Promise.resolve(job.plan);
    return Promise.resolve(job);
  } } } });
  try {
    assert.equal(scanBuddyAvailable(), true);
    const status = scanStatus('test');
    const history = scanHistory();
    await started;
    assert.deepEqual(calls, [{ command: 'scan_buddy_status', args: { jobId: 'test' } }]);
    release();
    assert.deepEqual(await status, job);
    assert.deepEqual(await history, [job]);
    await planScan(request); await startScan(request); await cancelScan('test');
    assert.deepEqual(calls.slice(1), [
      { command: 'scan_buddy_history', args: {} },
      { command: 'scan_buddy_plan', args: { request } },
      { command: 'scan_buddy_start', args: { request } },
      { command: 'scan_buddy_cancel', args: { jobId: 'test' } },
    ]);
  } finally {
    release();
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
