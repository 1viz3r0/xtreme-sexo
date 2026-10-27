import test from 'node:test'
import assert from 'node:assert/strict'
import { createLabRuntimeAdapter, validateLabRuntimeStatus, type LabRuntimeStatus } from './labRuntime'

const stopped: LabRuntimeStatus = { running: false, labId: null, phase: 'stopped', targetUrl: null, consoleAddr: null, message: 'Stopped', runtime: 'docker', completed: false }
const running: LabRuntimeStatus = { ...stopped, running: true, labId: 'web-exposure', phase: 'running', targetUrl: 'http://127.0.0.1:42000/', message: 'Ready' }
test('adapter sends the new command contract without tracks or extra start arguments', async () => {
  const calls: unknown[] = []
  const adapter = createLabRuntimeAdapter(async <T>(command: string, args?: Record<string, unknown>) => { calls.push([command, args]); return running as T })
  await adapter.status(); await adapter.start('web-exposure'); await adapter.open(); await adapter.reset(); await adapter.submitFlag('discovered-value'); await adapter.stop()
  assert.deepEqual(calls, [['lab_runtime_status', undefined], ['lab_runtime_start', { labId: 'web-exposure' }], ['lab_runtime_open', undefined], ['lab_runtime_reset', undefined], ['lab_runtime_action', { action: { action: 'submit_flag', flag: 'discovered-value' } }], ['lab_runtime_stop', undefined]])
   for (const labId of ['network-enumeration', 'linux-permissions', 'header-trail', 'protocol-archive', 'first-contact', 'service-signals']) await adapter.start(labId)
})
test('validator accepts setup-required and refuses unconfirmed or non-local running targets', () => {
  assert.deepEqual(validateLabRuntimeStatus({ ...stopped, phase: 'setup-required', message: 'Docker >=28 required' }).phase, 'setup-required')
  for (const payload of [{ ...running, targetUrl: null }, { ...running, targetUrl: 'https://example.com/' }, { ...running, phase: 'stopped' }, { running: true }]) assert.throws(() => validateLabRuntimeStatus(payload), /Invalid lab runtime/)
})

test('validator accepts a confirmed running status for every provisioned CTF', () => {
  for (const labId of ['web-exposure', 'network-enumeration', 'linux-permissions', 'header-trail', 'protocol-archive', 'first-contact', 'service-signals']) {
    assert.equal(validateLabRuntimeStatus({ ...running, labId, consoleAddr: ['network-enumeration', 'header-trail', 'protocol-archive'].includes(labId) ? '127.0.0.1:42001' : null }).labId, labId)
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
test('background status serializes Stop instead of discarding the user action', async () => {
  const read = deferred<LabRuntimeStatus>()
  const calls: string[] = []
  const adapter = createLabRuntimeAdapter(async <T>(command: string) => {
    calls.push(command)
    return (command === 'lab_runtime_status' ? await read.promise : stopped) as T
  })
  const poll = adapter.status()
  await Promise.resolve()
  const stop = adapter.stop()
  assert.deepEqual(calls, ['lab_runtime_status'])
  read.resolve(running)
  await poll
  assert.equal((await stop).phase, 'stopped')
  assert.deepEqual(calls, ['lab_runtime_status', 'lab_runtime_stop'])
})
test('Stop interrupts an active provision and cancels provision queued behind a read', async () => {
  const startReply = deferred<LabRuntimeStatus>()
  const calls: string[] = []
  const adapter = createLabRuntimeAdapter(async <T>(command: string) => {
    calls.push(command)
    return (command === 'lab_runtime_start' ? await startReply.promise : stopped) as T
  })
  const start = adapter.start('web-exposure')
  await Promise.resolve()
  assert.equal((await adapter.stop()).phase, 'stopped')
  assert.deepEqual(calls, ['lab_runtime_start', 'lab_runtime_stop'])
  startReply.resolve(stopped)
  await start

  const read = deferred<LabRuntimeStatus>()
  const queuedCalls: string[] = []
  const queued = createLabRuntimeAdapter(async <T>(command: string) => {
    queuedCalls.push(command)
    return (command === 'lab_runtime_status' ? await read.promise : stopped) as T
  })
  const poll = queued.status()
  const queuedStart = queued.start('first-contact')
  const cancelled = assert.rejects(queuedStart, /cancelled before dispatch/)
  const stop = queued.stop()
  read.resolve(stopped)
  await Promise.all([poll, cancelled, stop])
  assert.deepEqual(queuedCalls, ['lab_runtime_status', 'lab_runtime_stop'])
})
test('queue recovers after IPC failure and status remains available during provisioning', async () => {
  let fail = true
  const adapter = createLabRuntimeAdapter(async <T>() => { if (fail) { fail = false; throw new Error('daemon unavailable') } return stopped as T })
  await assert.rejects(adapter.stop(), /daemon unavailable/)
  assert.equal((await adapter.status()).phase, 'stopped')
  const reply = deferred<LabRuntimeStatus>()
  const provisioning = createLabRuntimeAdapter(async <T>(command: string) => (command === 'lab_runtime_start' ? await reply.promise : { ...stopped, phase: 'starting', labId: 'first-contact' }) as T)
  const start = provisioning.start('first-contact')
  await Promise.resolve()
  assert.equal((await provisioning.status()).phase, 'starting')
  reply.resolve(stopped); await start
})
test('console endpoint validation permits only the running room’s bounded loopback endpoint', () => {
  const console = { ...running, labId: 'header-trail', consoleAddr: '127.0.0.1:42001' }
  assert.equal(validateLabRuntimeStatus(console).consoleAddr, '127.0.0.1:42001')
  for (const payload of [
    { ...console, consoleAddr: '0.0.0.0:9000' }, { ...console, consoleAddr: '127.0.0.1:65536' },
    { ...console, consoleAddr: '127.0.0.1:0' }, { ...console, labId: 'web-exposure' },
    { ...stopped, consoleAddr: console.consoleAddr }, { ...running, targetUrl: 'http://127.0.0.1:42000/execute' },
    { ...running, labId: null }, { ...console, consoleAddr: null },
  ]) assert.throws(() => validateLabRuntimeStatus(payload), /Invalid lab runtime/)
  for (const phase of ['starting', 'stopping']) assert.equal(validateLabRuntimeStatus({ ...stopped, phase }).phase, phase)
})
