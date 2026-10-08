import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CaptureWorkflow } from './captureWorkflow';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function activeWorkflow() {
  const workflow = new CaptureWorkflow();
  workflow.mount(); workflow.setSession('first');
  return workflow;
}

test('action gate is synchronous, not dependent on a busy render', () => {
  const workflow = activeWorkflow();
  const release = workflow.acquireAction();
  assert.ok(release);
  assert.equal(workflow.acquireAction(), null);
  release();
  const next = workflow.acquireAction();
  assert.ok(next);
  release(); // A late/double release cannot free the newer action.
  assert.equal(workflow.acquireAction(), null);
  next();
  assert.ok(workflow.acquireAction());
});

test('session replacement invalidates every result, even when session IDs repeat', () => {
  const workflow = activeWorkflow();
  const tokens = [workflow.token(), workflow.token('view'), workflow.token('detail')];
  workflow.setSession('second');
  workflow.setSession('first');
  assert.ok(tokens.every((token) => !workflow.current(token)));
  assert.ok(tokens.every((token) => workflow.currentLifetime(token))); // Adoption still releases the mounted action's busy UI.
  assert.equal(workflow.sessionId, 'first');
});

test('search/page changes suppress pending packet, follow and statistics results', async () => {
  const workflow = activeWorkflow();
  const reply = deferred();
  const detail = workflow.token('detail');
  const page = workflow.token('view');
  const save = workflow.token('session');
  let applied = false;
  const request = reply.promise.then(() => { if (workflow.current(detail)) applied = true; });
  workflow.invalidateView();
  reply.resolve(); await request;
  assert.equal(applied, false);
  assert.equal(workflow.current(page), false);
  assert.equal(workflow.current(save), true); // Saving the recording is query-independent.
});

test('new detail selection wins without cancelling the page or session', () => {
  const workflow = activeWorkflow();
  const page = workflow.token('view');
  const earlier = workflow.token('detail');
  workflow.invalidateDetail();
  const latest = workflow.token('detail');
  assert.equal(workflow.current(earlier), false);
  assert.equal(workflow.current(latest), true);
  assert.equal(workflow.current(page), true);
});

test('unmount returns the owned session for close and rejects late adoption/results', () => {
  const workflow = activeWorkflow();
  const token = workflow.token();
  assert.equal(workflow.unmount(), 'first');
  assert.equal(workflow.sessionId, undefined);
  assert.equal(workflow.current(token), false);
  assert.equal(workflow.currentLifetime(token), false);
  assert.equal(workflow.acquireAction(), null);
  assert.equal(workflow.unmount(), undefined);
});

test('remount cannot revive old requests or let their cleanup release a new action', () => {
  const workflow = activeWorkflow();
  const old = workflow.token();
  const release = workflow.acquireAction()!;
  workflow.unmount(); workflow.mount(); workflow.setSession('first');
  assert.equal(workflow.current(old), false);
  const next = workflow.acquireAction()!;
  release();
  assert.equal(workflow.acquireAction(), null);
  next();
});

test('query-effect restarts share one serial poll gate and skip obsolete queued queries', async () => {
  const workflow = activeWorkflow();
  const reply = deferred();
  const events: string[] = [];
  const old = workflow.token('view');
  const first = workflow.serialPoll(() => workflow.current(old), async () => {
    events.push('old status started');
    await reply.promise;
    if (workflow.current(old)) events.push('old search applied');
    events.push('old status ended');
  });
  await Promise.resolve();
  workflow.invalidateView();
  const middle = workflow.token('view');
  const skipped = workflow.serialPoll(() => workflow.current(middle), async () => { events.push('obsolete query'); });
  workflow.invalidateView();
  const latest = workflow.token('view');
  const next = workflow.serialPoll(() => workflow.current(latest), async () => { events.push('latest query'); });
  await Promise.resolve();
  assert.deepEqual(events, ['old status started']);
  reply.resolve();
  await Promise.all([first, skipped, next]);
  assert.deepEqual(events, ['old status started', 'old status ended', 'latest query']);
});

test('serial poll gate recovers from rejection and suppresses work after unmount', async () => {
  const workflow = activeWorkflow();
  const reply = deferred();
  const token = workflow.token('view');
  const first = workflow.serialPoll(() => workflow.current(token), () => reply.promise);
  const rejection = assert.rejects(first, /IPC failed/);
  let calls = 0;
  const second = workflow.serialPoll(() => workflow.current(token), async () => { calls++; });
  reply.reject(new Error('IPC failed'));
  await rejection; await second;
  assert.equal(calls, 1);
  workflow.unmount();
  await workflow.serialPoll(() => workflow.current(token), async () => { calls++; });
  assert.equal(calls, 1);
});
