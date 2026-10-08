import test from 'node:test'
import assert from 'node:assert/strict'
import { createLabRuntimeAdapter, validateLabRuntimeStatus, type LabRuntimeStatus } from './labRuntime'

const stopped: LabRuntimeStatus = { running: false, labId: null, phase: 'stopped', targetUrl: null, message: 'Stopped', runtime: 'docker', completed: false }
const running: LabRuntimeStatus = { ...stopped, running: true, labId: 'web-exposure', phase: 'running', targetUrl: 'http://127.0.0.1:42000/', message: 'Ready' }
test('adapter sends the new command contract without tracks or extra start arguments', async () => {
  const calls: unknown[] = []
  const adapter = createLabRuntimeAdapter(async <T>(command: string, args?: Record<string, unknown>) => { calls.push([command, args]); return running as T })
  await adapter.status(); await adapter.start('web-exposure'); await adapter.open(); await adapter.reset(); await adapter.submitFlag('discovered-value'); await adapter.stop()
  assert.deepEqual(calls, [['lab_runtime_status', undefined], ['lab_runtime_start', { labId: 'web-exposure' }], ['lab_runtime_open', undefined], ['lab_runtime_reset', undefined], ['lab_runtime_action', { action: { action: 'submit_flag', flag: 'discovered-value' } }], ['lab_runtime_stop', undefined]])
  await assert.rejects(adapter.start('network-enumeration'), /planned/)
})
test('validator accepts setup-required and refuses unconfirmed or non-local running targets', () => {
  assert.deepEqual(validateLabRuntimeStatus({ ...stopped, phase: 'setup-required', message: 'Docker >=28 required' }).phase, 'setup-required')
  for (const payload of [{ ...running, targetUrl: null }, { ...running, targetUrl: 'https://example.com/' }, { ...running, phase: 'stopped' }, { running: true }]) assert.throws(() => validateLabRuntimeStatus(payload), /Invalid lab runtime/)
})
