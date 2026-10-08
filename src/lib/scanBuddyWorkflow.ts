import type { ScanJob, ScanPlan, ScanRequest } from '../services/tauri/scanBuddy';
import { SCAN_PRESETS, validateScanRequest } from './scanBuddyPresentation';

export type PendingAction = 'preview' | 'start' | 'cancel' | 'refresh' | null;
export const previewFingerprint = (request: ScanRequest) => JSON.stringify([request.targets, request.ports, request.timeout_ms, request.concurrency]);
export const scopeErrors = (request: ScanRequest) => validateScanRequest({ ...request, authorized: true });
export interface WorkflowState {
  request: ScanRequest;
  preview: { key: string; plan: ScanPlan } | null;
  job: ScanJob | null;
  history: ScanJob[];
  pending: PendingAction;
  error: string | null;
  pollWarning: string | null;
  uncertainStart: boolean;
}
export interface WorkflowService {
  planScan(request: ScanRequest): Promise<ScanPlan>;
  startScan(request: ScanRequest): Promise<ScanJob>;
  cancelScan(id: string): Promise<ScanJob>;
  scanHistory(): Promise<ScanJob[]>;
  scanStatus(id: string): Promise<ScanJob>;
}
export function startDisabledReason(state: WorkflowState, available: boolean): string | null {
  if (!available) return 'Open the desktop app to preview and start.';
  if (state.pending) return `Wait for ${state.pending} to finish.`;
  if (state.uncertainStart) return 'Start outcome is uncertain. Refresh history before taking another action; do not retry automatically.';
  if (state.history.some(job => job.state === 'RUNNING') || state.job?.state === 'RUNNING') return 'A job is running. Select it to cancel, or refresh history.';
  const errors = scopeErrors(state.request);
  if (errors.length) return `Scope required: ${errors[0]}`;
  if (!state.preview || state.preview.key !== previewFingerprint(state.request)) return 'Preview the current scope before starting.';
  if (!state.request.authorized) return 'Confirm permission using the checkbox before Start.';
  return null;
}

// One controller owns action gates and read lifetimes. Read-only polling does not
// lose ownership when the user previews, edits, cancels, or selects history.
export function createScanBuddyWorkflow(service: WorkflowService, available: boolean, pollMs = 1500) {
  let state: WorkflowState = { request: { targets: '', ports: SCAN_PRESETS.common, timeout_ms: 800, concurrency: 4, authorized: false }, preview: null, job: null, history: [], pending: null, error: null, pollWarning: null, uncertainStart: false };
  const listeners = new Set<() => void>();
  let attached = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let polling = false;
  const versions = new Map<string, number>();
  const emit = (patch: Partial<WorkflowState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const remember = (job: ScanJob) => emit({ history: [job, ...state.history.filter(item => item.id !== job.id)].slice(0, 8), job: state.job?.id === job.id ? job : state.job });
  const schedule = () => {
    if (timer) clearTimeout(timer);
    if (attached && available && state.history.some(job => job.state === 'RUNNING')) timer = setTimeout(() => void poll(), pollMs);
  };
  const poll = async () => {
    if (!attached || polling) { schedule(); return; }
    polling = true;
    const life = generation;
    try {
      for (const job of state.history.filter(item => item.state === 'RUNNING')) {
        const version = versions.get(job.id) ?? 0;
        try {
          const next = await service.scanStatus(job.id);
          if (attached && life === generation && version === (versions.get(job.id) ?? 0)) { remember(next); emit({ pollWarning: null }); }
        } catch (reason) {
          if (attached && life === generation) emit({ pollWarning: `Status could not be refreshed: ${String(reason)}. The native job may still be running. Refresh history.` });
        }
      }
    } finally { polling = false; if (life === generation) schedule(); }
  };
  const action = async (kind: Exclude<PendingAction, null>, operation: (current: () => boolean) => Promise<void>) => {
    if (!attached || !available || state.pending) return;
    const life = generation;
    const current = () => attached && life === generation;
    emit({ pending: kind, error: null });
    try { await operation(current); }
    catch (reason) {
      if (current()) {
        const timeout = /timed out|timeout/i.test(String(reason));
        emit({ error: kind === 'start' && timeout ? `Start outcome uncertain: ${String(reason)}. The scan may have started. Refresh history; do not retry automatically.` : `${kind === 'preview' ? 'Preview failed (no probes sent)' : `${kind[0].toUpperCase()}${kind.slice(1)} failed`}: ${String(reason)}`, uncertainStart: state.uncertainStart || (kind === 'start' && timeout) });
      }
    } finally { if (current()) { emit({ pending: null }); schedule(); } }
  };
  const refresh = () => action('refresh', async current => {
    const items = await service.scanHistory();
    if (!current()) return;
    items.forEach(item => versions.set(item.id, (versions.get(item.id) ?? 0) + 1));
    emit({ history: items, job: items.find(item => item.id === state.job?.id) ?? items.find(item => item.state === 'RUNNING') ?? items[0] ?? null, uncertainStart: false, pollWarning: null });
  });
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    attach: () => { attached = true; ++generation; void refresh(); return () => { attached = false; ++generation; if (timer) clearTimeout(timer); emit({ pending: null }); }; },
    edit: (patch: Partial<ScanRequest>) => {
      if (state.pending) return;
      const request = { ...state.request, ...patch };
      const changed = previewFingerprint(request) !== previewFingerprint(state.request);
      emit({ request: changed ? { ...request, authorized: false } : request, preview: changed ? null : state.preview, error: null });
    },
    select: (job: ScanJob) => { if (!state.pending) emit({ job: state.history.find(item => item.id === job.id) ?? job, pollWarning: null }); },
    refresh,
    preview: () => {
      if (scopeErrors(state.request).length) return;
      return action('preview', async current => {
        const request = { ...state.request };
        const key = previewFingerprint(request);
        emit({ preview: null });
        const plan = await service.planScan(request);
        if (current() && key === previewFingerprint(state.request)) emit({ preview: { key, plan } });
      });
    },
    start: () => {
      if (startDisabledReason(state, available)) return;
      return action('start', async current => {
        const job = await service.startScan({ ...state.request });
        if (current()) { remember(job); emit({ job, preview: null, request: { ...state.request, authorized: false } }); }
      });
    },
    cancel: () => {
      const job = state.job;
      if (!job || job.state !== 'RUNNING') return;
      return action('cancel', async current => {
        versions.set(job.id, (versions.get(job.id) ?? 0) + 1);
        const next = await service.cancelScan(job.id);
        if (current()) { versions.set(job.id, (versions.get(job.id) ?? 0) + 1); remember(next); }
      });
    },
  };
}
