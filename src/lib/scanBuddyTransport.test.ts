import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanBuddyTransport, SCAN_BUDDY_DEADLINE_MS, ScanBuddyTimeoutError } from './scanBuddyTransport';
import type { ScanJob, ScanRequest } from '../services/tauri/scanBuddy';

const request: ScanRequest = { targets: '127.0.0.1', ports: '80', timeout_ms: 800, concurrency: 4, authorized: true };
const job: ScanJob = {
  id: 'test', state: 'COMPLETED', started_at: '2026-10-05T00:00:00Z', finished_at: '2026-10-05T00:00:01Z',
  plan: { targets: ['127.0.0.1'], ports: [80], total_probes: 1, timeout_ms: 800, concurrency: 4, warnings: [] },
  completed_probes: 1, results: [{ target: '127.0.0.1', port: 80, state: 'OPEN', service_hint: 'http', latency_ms: 5, observed_at: '2026-10-05T00:00:01Z' }], error: null,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('production deadline is eight seconds; SSR does not invoke', async () => {
  assert.equal(SCAN_BUDDY_DEADLINE_MS, 8000);
  let calls = 0;
  const transport = createScanBuddyTransport({ available: () => false, invoke: async () => { calls++; return job; } });
  for (const operation of [() => transport.planScan(request), () => transport.startScan(request), () => transport.cancelScan('test'), () => transport.scanStatus('test'), () => transport.scanHistory()]) {
    await assert.rejects(operation(), /desktop-only/);
  }
  assert.equal(calls, 0);
});

test('exact envelopes and one lane for plan/status/history; plans permit authorized false', async () => {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const status = deferred<ScanJob>();
  const entered = deferred<void>();
  const transport = createScanBuddyTransport({ available: () => true, invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'scan_buddy_status') { entered.resolve(); return status.promise; }
    if (command === 'scan_buddy_history') return [job];
    if (command === 'scan_buddy_plan') return job.plan;
    return job;
  } });
  const first = transport.scanStatus('test');
  const second = transport.scanHistory();
  const preview = { ...request, authorized: false };
  const third = transport.planScan(preview);
  await entered.promise;
  assert.deepEqual(calls, [{ command: 'scan_buddy_status', args: { jobId: 'test' } }]);
  status.resolve(job);
  assert.deepEqual(await first, job);
  assert.deepEqual(await second, [job]);
  assert.deepEqual(await third, job.plan);
  assert.deepEqual(await transport.startScan(request), job);
  assert.deepEqual(await transport.cancelScan('test'), job);
  assert.deepEqual(calls, [
    { command: 'scan_buddy_status', args: { jobId: 'test' } },
    { command: 'scan_buddy_history', args: {} },
    { command: 'scan_buddy_plan', args: { request: preview } },
    { command: 'scan_buddy_start', args: { request } },
    { command: 'scan_buddy_cancel', args: { jobId: 'test' } },
  ]);
});

test('never-settling reads release the lane on timeout', async () => {
  for (const name of ['scan_buddy_status', 'scan_buddy_history', 'scan_buddy_plan']) {
    let calls = 0;
    const transport = createScanBuddyTransport({ available: () => true, deadlineMs: 10, invoke: async () => {
      calls++;
      return calls === 1 ? new Promise<never>(() => {}) : [job];
    } });
    const blocked = name === 'scan_buddy_status' ? transport.scanStatus('test') : name === 'scan_buddy_history' ? transport.scanHistory() : transport.planScan(request);
    const recovered = transport.scanHistory();
    await assert.rejects(blocked, error => error instanceof ScanBuddyTimeoutError && error.command === name && !error.uncertainOutcome);
    assert.deepEqual(await recovered, [job]);
    assert.equal(calls, 2);
  }
});

test('late success or failure cannot change a timed-out result or poison newer reads', async () => {
  for (const lateFailure of [false, true]) {
    const late = deferred<unknown>();
    let calls = 0;
    const transport = createScanBuddyTransport({ available: () => true, deadlineMs: 10, invoke: async () => ++calls === 1 ? late.promise : [job] });
    const first = transport.scanStatus('old');
    await assert.rejects(first, ScanBuddyTimeoutError);
    assert.deepEqual(await transport.scanHistory(), [job]);
    if (lateFailure) late.reject(new Error('late native failure'));
    else late.resolve({ ...job, id: 'old' });
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(first, ScanBuddyTimeoutError);
    assert.deepEqual(await transport.scanHistory(), [job]);
    assert.equal(calls, 3);
  }
});

test('write deadlines report uncertain outcome without retrying start or cancel', async () => {
  for (const command of ['scan_buddy_start', 'scan_buddy_cancel']) {
    const calls: string[] = [];
    const late = deferred<unknown>();
    const transport = createScanBuddyTransport({ available: () => true, deadlineMs: 10, invoke: async name => {
      calls.push(name);
      return name === 'scan_buddy_history' ? [job] : late.promise;
    } });
    const pending = command === 'scan_buddy_start' ? transport.startScan(request) : transport.cancelScan('test');
    await assert.rejects(pending, error => error instanceof ScanBuddyTimeoutError && error.uncertainOutcome && /Refresh history before trying again/.test(error.message));
    assert.deepEqual(await transport.scanHistory(), [job]);
    late.resolve(job);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [command, 'scan_buddy_history']);
  }
});

test('native failures include command context and failed reads do not poison the lane', async () => {
  for (const failure of [new Error('backend busy'), 'backend busy', { sensitive: 'DO_NOT_EXPOSE' }]) {
    let calls = 0;
    const transport = createScanBuddyTransport({ available: () => true, invoke: () => {
      if (++calls === 1) throw failure;
      return Promise.resolve([job]);
    } });
    await assert.rejects(transport.scanStatus('test'), error => error instanceof Error && /scan_buddy_status failed/.test(error.message) && !error.message.includes('DO_NOT_EXPOSE'));
    assert.deepEqual(await transport.scanHistory(), [job]);
  }
});

test('malformed plan values reject instead of fabricating or coercing fields', async () => {
  for (const value of [null, {}, { ...job.plan, targets: '127.0.0.1' }, { ...job.plan, ports: [0] }, { ...job.plan, ports: ['80'] }, { ...job.plan, total_probes: 2 }, { ...job.plan, timeout_ms: NaN }, { ...job.plan, concurrency: 0 }, { ...job.plan, warnings: [null] }]) {
    const transport = createScanBuddyTransport({ available: () => true, invoke: async () => value });
    await assert.rejects(transport.planScan(request), /scan_buddy_plan.*incompatible.*Update\/rebuild/);
  }
});

test('malformed jobs/history reject with actionable build guidance, and valid empty history is preserved', async () => {
  const malformed = [null, {}, { ...job, state: 'DONE' }, { ...job, started_at: 'invalid' }, { ...job, finished_at: undefined }, { ...job, completed_probes: -1 }, { ...job, completed_probes: 2 }, { ...job, error: {} }, { ...job, results: [{ ...job.results[0], state: 'UNKNOWN' }] }, { ...job, results: [{ ...job.results[0], latency_ms: Infinity }] }, { ...job, plan: { ...job.plan, ports: [65536] } }];
  for (const value of malformed) {
    const transport = createScanBuddyTransport({ available: () => true, invoke: async name => name === 'scan_buddy_history' ? [value] : value });
    await assert.rejects(transport.startScan(request), /scan_buddy_start.*incompatible.*Update\/rebuild/);
    await assert.rejects(transport.cancelScan('test'), /scan_buddy_cancel.*incompatible/);
    await assert.rejects(transport.scanStatus('test'), /scan_buddy_status.*incompatible/);
    await assert.rejects(transport.scanHistory(), /scan_buddy_history.*incompatible/);
  }
  let calls = 0;
  const transport = createScanBuddyTransport({ available: () => true, invoke: async () => ++calls === 1 ? {} : [] });
  await assert.rejects(transport.scanHistory(), /incompatible/);
  assert.deepEqual(await transport.scanHistory(), []);
});
