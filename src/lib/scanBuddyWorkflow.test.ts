import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanBuddyWorkflow, previewFingerprint, startDisabledReason, type WorkflowService } from './scanBuddyWorkflow';
import type { ScanJob, ScanPlan } from '../services/tauri/scanBuddy';

const plan: ScanPlan = { targets: ['127.0.0.1'], ports: [80], total_probes: 1, timeout_ms: 800, concurrency: 4, warnings: [] };
const job = (state: ScanJob['state']): ScanJob => ({ id: 'fixture', state, plan, results: [], completed_probes: 0, started_at: '2026-10-05T00:00:00Z', finished_at: null, error: null });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
const service = (patch: Partial<WorkflowService> = {}): WorkflowService => ({ planScan: async () => plan, startScan: async () => job('RUNNING'), cancelScan: async () => job('CANCELLED'), scanHistory: async () => [], scanStatus: async () => job('RUNNING'), ...patch });
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('fingerprint includes every scope field, excludes only authorization; explicit start gate', async () => {
  let starts = 0;
  const workflow = createScanBuddyWorkflow(service({ startScan: async request => { assert.equal(request.authorized, true); starts++; return job('COMPLETED'); } }), true);
  const detach = workflow.attach();
  try {
    await tick();
    assert.match(startDisabledReason(workflow.getSnapshot(), true)!, /Scope required/);
    workflow.edit({ targets: '127.0.0.1' });
    assert.match(startDisabledReason(workflow.getSnapshot(), true)!, /Preview the current scope/);
    await workflow.preview();
    assert.match(startDisabledReason(workflow.getSnapshot(), true)!, /checkbox/);
    await workflow.start(); assert.equal(starts, 0);
    const snapshot = workflow.getSnapshot();
    assert.equal(previewFingerprint(snapshot.request), previewFingerprint({ ...snapshot.request, authorized: true }));
    for (const patch of [{ targets: '::1' }, { ports: '443' }, { timeout_ms: 900 }, { concurrency: 5 }]) assert.notEqual(previewFingerprint(snapshot.request), previewFingerprint({ ...snapshot.request, ...patch }));
    workflow.edit({ authorized: true });
    assert.equal(workflow.getSnapshot().preview, snapshot.preview);
    await workflow.start(); assert.equal(starts, 1);
    await workflow.preview(); workflow.edit({ authorized: true }); workflow.edit({ ports: '443' });
    assert.equal(workflow.getSnapshot().preview, null);
    assert.equal(workflow.getSnapshot().request.authorized, false);
  } finally { detach(); }
});

test('pending action blocks duplicates, late preview does not overwrite remount', async () => {
  const late = deferred<ScanPlan>(); let plans = 0;
  const workflow = createScanBuddyWorkflow(service({ planScan: () => { plans++; return late.promise; } }), true);
  let detach = workflow.attach(); await tick(); workflow.edit({ targets: '127.0.0.1' });
  const pending = workflow.preview(); void workflow.preview(); workflow.edit({ ports: '443' });
  assert.equal(plans, 1); assert.notEqual(workflow.getSnapshot().request.ports, '443');
  detach(); detach = workflow.attach(); await tick();
  late.resolve(plan); await pending;
  assert.equal(workflow.getSnapshot().preview, null); assert.equal(workflow.getSnapshot().pending, null);
  detach();
});

test('preview failure differs from uncertain start timeout; refresh reconciles conflict', async () => {
  let failPreview = true; let active = false; let starts = 0;
  const workflow = createScanBuddyWorkflow(service({ planScan: async () => { if (failPreview) throw new Error('Scan Buddy request timed out'); return plan; }, startScan: async () => { starts++; throw new Error('Scan Buddy request timed out'); }, scanHistory: async () => active ? [job('RUNNING')] : [] }), true);
  const detach = workflow.attach();
  try {
    await tick(); workflow.edit({ targets: '127.0.0.1' }); await workflow.preview();
    assert.match(workflow.getSnapshot().error!, /Preview failed \(no probes sent\)/);
    failPreview = false; await workflow.preview(); workflow.edit({ authorized: true }); await workflow.start();
    assert.match(workflow.getSnapshot().error!, /may have started/);
    await workflow.start(); assert.equal(starts, 1);
    active = true; await workflow.refresh(); assert.match(startDisabledReason(workflow.getSnapshot(), true)!, /running/);
  } finally { detach(); }
});

test('poll ownership survives preview/edit/history; late running status cannot undo cancellation', async () => {
  const status = deferred<ScanJob>(); let reads = 0;
  const workflow = createScanBuddyWorkflow(service({ scanHistory: async () => [job('RUNNING'), { ...job('COMPLETED'), id: 'old' }], scanStatus: async () => { reads++; return status.promise; } }), true, 5);
  const detach = workflow.attach();
  try {
    await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(reads, 1);
    workflow.edit({ targets: '127.0.0.1' }); await workflow.preview();
    workflow.select(workflow.getSnapshot().history[1]); workflow.select(workflow.getSnapshot().history[0]);
    await workflow.cancel(); status.resolve(job('RUNNING')); await tick();
    assert.equal(workflow.getSnapshot().job?.state, 'CANCELLED');
    await new Promise(resolve => setTimeout(resolve, 15)); assert.equal(reads, 1);
  } finally { detach(); }
});
