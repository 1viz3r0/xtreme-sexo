import { invoke } from '@tauri-apps/api/core'
import { isTauriEnvironment } from './isTauri'

export interface LabRuntimeStatus {
  running: boolean
  labId: string | null
  phase: 'stopped' | 'starting' | 'stopping' | 'running' | 'setup-required' | 'error'
  targetUrl: string | null
  consoleAddr: string | null
  message: string
  runtime: 'docker'
  completed: boolean
}
export interface LabRuntimeAdapter {
  status(): Promise<LabRuntimeStatus>
  start(labId: string): Promise<LabRuntimeStatus>
  stop(): Promise<LabRuntimeStatus>
  reset(): Promise<LabRuntimeStatus>
  open(): Promise<LabRuntimeStatus>
  submitFlag(flag: string): Promise<LabRuntimeStatus>
}
type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>
export function validateLabRuntimeStatus(value: unknown): LabRuntimeStatus {
  const invalid = (): never => { throw new Error('Invalid lab runtime response. Refresh status before taking another action.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const v = value as Record<string, unknown>
  if (typeof v.running !== 'boolean' || !(v.labId === null || ['web-exposure', 'network-enumeration', 'linux-permissions', 'header-trail', 'protocol-archive', 'first-contact', 'service-signals'].includes(String(v.labId))) || !['stopped', 'starting', 'stopping', 'running', 'setup-required', 'error'].includes(String(v.phase)) || !(v.targetUrl === null || typeof v.targetUrl === 'string') || !(v.consoleAddr === null || typeof v.consoleAddr === 'string') || typeof v.message !== 'string' || v.runtime !== 'docker' || typeof v.completed !== 'boolean') return invalid()
  if (v.running !== (v.phase === 'running') || (v.running && (!v.targetUrl || !v.labId)) || (!v.running && (v.targetUrl !== null || v.consoleAddr !== null))) return invalid()
  if (v.targetUrl) {
    try { const url = new URL(v.targetUrl as string); if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.search || url.hash || url.username || url.password) return invalid() } catch { return invalid() }
  }
  if (v.running && ['network-enumeration', 'header-trail', 'protocol-archive'].includes(String(v.labId)) && v.consoleAddr === null) return invalid()
  if (v.consoleAddr !== null) {
    if (!['network-enumeration', 'header-trail', 'protocol-archive'].includes(String(v.labId)) || !/^127\.0\.0\.1:[1-9]\d{0,4}$/.test(v.consoleAddr as string) || Number((v.consoleAddr as string).split(':')[1]) > 65535) return invalid()
  }
  return { running: v.running, labId: v.labId, phase: v.phase, targetUrl: v.targetUrl, consoleAddr: v.consoleAddr, message: v.message, runtime: v.runtime, completed: v.completed } as LabRuntimeStatus
}
export const createLabRuntimeAdapter = (invoke: Invoke = nativeInvoke): LabRuntimeAdapter => {
  let queue: Promise<unknown> = Promise.resolve()
  const provisioning = new Set<{ started: boolean; cancelled: boolean }>()
  const execute = async (command: string, args?: Record<string, unknown>): Promise<LabRuntimeStatus> => {
    if (invoke === nativeInvoke && !isTauriEnvironment()) return { running: false, labId: null, phase: 'setup-required', targetUrl: null, consoleAddr: null, message: 'Open the installed NET0ZE desktop app and start native Linux Docker Engine 28 or newer.', runtime: 'docker', completed: false }
    return validateLabRuntimeStatus(await invoke(command, args))
  }
  const call = (command: string, args?: Record<string, unknown>) => {
    const active = [...provisioning].some(request => request.started)
    if (command === 'lab_runtime_stop') {
      for (const request of provisioning) request.cancelled = true
      // Native Stop signals cancellation before waiting for startup cleanup.
      if (active) return execute(command, args)
    }
    if (command === 'lab_runtime_status' && active) return execute(command, args)
    const provision = command === 'lab_runtime_start' || command === 'lab_runtime_reset' ? { started: false, cancelled: false } : null
    if (provision) provisioning.add(provision)
    const result = queue.then(async () => {
      if (provision?.cancelled) throw new Error('Lab startup cancelled before dispatch.')
      if (provision) provision.started = true
      return execute(command, args)
    }).finally(() => { if (provision) provisioning.delete(provision) })
    queue = result.catch(() => undefined)
    return result
  }
  return {
    status: () => call('lab_runtime_status'),
   start: labId => { if (!['web-exposure', 'network-enumeration', 'linux-permissions', 'header-trail', 'protocol-archive', 'first-contact', 'service-signals'].includes(labId)) return Promise.reject(new Error('This CTF is planned and cannot be provisioned.')); return call('lab_runtime_start', { labId }) },
    stop: () => call('lab_runtime_stop'), reset: () => call('lab_runtime_reset'), open: () => call('lab_runtime_open'),
    submitFlag: flag => call('lab_runtime_action', { action: { action: 'submit_flag', flag } }),
  }
}
const nativeInvoke: Invoke = async (command, args) => {
  return invoke(command, args)
}
export const labRuntimeAdapter = createLabRuntimeAdapter()
