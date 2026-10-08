import { isTauriEnvironment } from './isTauri'

export interface LabRuntimeStatus {
  running: boolean
  labId: string | null
  phase: 'stopped' | 'running' | 'setup-required' | 'error'
  targetUrl: string | null
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
  if (typeof v.running !== 'boolean' || !(v.labId === null || v.labId === 'web-exposure') || !['stopped', 'running', 'setup-required', 'error'].includes(String(v.phase)) || !(v.targetUrl === null || typeof v.targetUrl === 'string') || typeof v.message !== 'string' || v.runtime !== 'docker' || typeof v.completed !== 'boolean') return invalid()
  if (v.running !== (v.phase === 'running') || (v.running && (!v.targetUrl || v.labId !== 'web-exposure')) || (!v.running && v.targetUrl !== null)) return invalid()
  if (v.targetUrl) {
    try { const url = new URL(v.targetUrl as string); if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) return invalid() } catch { return invalid() }
  }
  return { running: v.running, labId: v.labId, phase: v.phase, targetUrl: v.targetUrl, message: v.message, runtime: v.runtime, completed: v.completed } as LabRuntimeStatus
}
export const createLabRuntimeAdapter = (invoke: Invoke = nativeInvoke): LabRuntimeAdapter => {
  let pending = false
  const call = async (command: string, args?: Record<string, unknown>) => {
    if (invoke === nativeInvoke && !isTauriEnvironment()) return { running: false, labId: null, phase: 'setup-required', targetUrl: null, message: 'Open the installed NET0ZE desktop app and start Docker Engine 28 or newer.', runtime: 'docker', completed: false } as LabRuntimeStatus
    if (pending) throw new Error('A lab request is still pending. Wait for its result.')
    pending = true
    try { return validateLabRuntimeStatus(await invoke(command, args)) } finally { pending = false }
  }
  return {
    status: () => call('lab_runtime_status'),
    start: labId => { if (labId !== 'web-exposure') return Promise.reject(new Error('This lab is planned and cannot be provisioned.')); return call('lab_runtime_start', { labId }) },
    stop: () => call('lab_runtime_stop'), reset: () => call('lab_runtime_reset'), open: () => call('lab_runtime_open'),
    submitFlag: flag => call('lab_runtime_action', { action: { action: 'submit_flag', flag } }),
  }
}
const nativeInvoke: Invoke = async (command, args) => {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke(command, args)
}
export const labRuntimeAdapter = createLabRuntimeAdapter()
