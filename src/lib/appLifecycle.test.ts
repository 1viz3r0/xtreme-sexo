import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifecycle, liveDataNeeds, mergeRecent, startSerialPolling } from './appLifecycle';

test('stream updates replace duplicates, keep recent records and stay bounded', () => {
  let records: { flow_id: string; count: number }[] = [];
  for (let index = 0; index < 5000; index++) {
    records = mergeRecent(records, [{ flow_id: String(index % 150), count: index }]);
    assert.ok(records.length <= 100);
  }
  assert.equal(new Set(records.map((record) => record.flow_id)).size, 100);
  assert.equal(records.at(-1)?.count, 4999);
  const refreshed = mergeRecent(records, [{ flow_id: records[0].flow_id, count: 6000 }]);
  assert.equal(refreshed.at(-1)?.count, 6000);
  assert.equal(refreshed.length, 100);
  assert.deepEqual(mergeRecent(records, records, 0), []);
});

test('late subscription registration is disposed immediately and callbacks are cancelled', async () => {
  const lifecycle = createLifecycle();
  let resolve!: (cleanup: () => void) => void;
  let removed = 0;
  let callbacks = 0;
  const registration = lifecycle.own(new Promise<() => void>((done) => { resolve = done; }));
  const callback = lifecycle.guard(() => { callbacks++; });
  callback(undefined);
  lifecycle.dispose();
  callback(undefined);
  resolve(() => { removed++; });
  await registration;
  assert.equal(callbacks, 1);
  assert.equal(removed, 1);
  lifecycle.dispose();
  assert.equal(removed, 1);
});

test('resolved subscriptions are removed once and rejected registrations are handled', async () => {
  const lifecycle = createLifecycle();
  let removed = 0;
  await lifecycle.own(Promise.resolve(() => { removed++; }));
  await lifecycle.own(Promise.reject(new Error('registration failed')));
  lifecycle.dispose();
  lifecycle.dispose();
  assert.equal(removed, 1);
});

test('slow polling never overlaps, including across teardown and restart', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = { busy: false };
  let resolve!: () => void;
  let runs = 0;
  const stop = startSerialPolling(() => {
    runs++;
    return new Promise<void>((done) => { resolve = done; });
  }, gate, 5000);
  context.mock.timers.tick(20000);
  assert.equal(runs, 1);
  stop();
  const stopNext = startSerialPolling(async () => { runs++; }, gate, 5000);
  context.mock.timers.tick(5000);
  assert.equal(runs, 1);
  resolve();
  await Promise.resolve();
  context.mock.timers.tick(5000);
  await Promise.resolve();
  assert.equal(runs, 2);
  stopNext();
  context.mock.timers.tick(20000);
  assert.equal(runs, 2);
});

test('polling releases its gate after a failure and stops after cancellation', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const gate = { busy: false };
  let runs = 0;
  const stop = startSerialPolling(async () => { runs++; throw new Error('offline'); }, gate, 5000);
  await Promise.resolve();
  assert.equal(gate.busy, false);
  context.mock.timers.tick(5000);
  await Promise.resolve();
  assert.equal(runs, 2);
  stop();
  context.mock.timers.tick(20000);
  assert.equal(runs, 2);
});

test('only graph and evidence pages request App live data', () => {
  for (const tab of ['global_intel', 'conversations', 'system_logs', 'network_engine', 'edu_inspector', 'scenario_labs', 'detection_builder', 'ioc_threat', 'user_profile', 'admin_panel']) {
    assert.deepEqual(liveDataNeeds(tab), { flows: false, detections: false, graph: false });
  }
  assert.deepEqual(liveDataNeeds('storyline'), { flows: true, detections: true, graph: false });
  assert.deepEqual(liveDataNeeds('attack_graph'), { flows: true, detections: false, graph: true });
});
