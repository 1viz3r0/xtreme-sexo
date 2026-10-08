import type { ScanJob, ScanPlan, ScanRequest, ScanResult, ScanStorageStatus } from '../services/tauri/scanBuddy';

export const SCAN_BUDDY_DEADLINE_MS = 8_000;
type Command = 'scan_buddy_plan' | 'scan_buddy_start' | 'scan_buddy_cancel' | 'scan_buddy_status' | 'scan_buddy_history' | 'scan_buddy_storage_status';
type Invoke = (command: Command, args: Record<string, unknown>) => Promise<unknown>;

export class ScanBuddyTimeoutError extends Error {
  readonly command: Command;
  readonly uncertainOutcome: boolean;
  constructor(command: Command) {
    const uncertainOutcome = command === 'scan_buddy_start' || command === 'scan_buddy_cancel';
    super(`Scan Buddy ${command} timed out. ${uncertainOutcome
      ? 'The native operation may still have completed; its outcome is unknown. Refresh history before trying again. Do not automatically retry.'
      : 'The native app did not respond. Refresh history; if this persists, restart the desktop app and verify its build is up to date.'}`);
    this.name = 'ScanBuddyTimeoutError';
    this.command = command;
    this.uncertainOutcome = uncertainOutcome;
  }
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.length > 0;
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const timestamp = (value: unknown): value is string => nonempty(value) && Number.isFinite(Date.parse(value));

function isPlan(value: unknown): value is ScanPlan {
  return record(value) && Array.isArray(value.targets) && value.targets.length > 0 && value.targets.every(nonempty)
    && Array.isArray(value.ports) && value.ports.length > 0 && value.ports.every(port => integer(port, 1, 65535))
    && integer(value.total_probes, 1) && value.total_probes === value.targets.length * value.ports.length
    && integer(value.timeout_ms, 1) && integer(value.concurrency, 1)
    && Array.isArray(value.warnings) && value.warnings.every(text);
}
function isResult(value: unknown): value is ScanResult {
  return record(value) && nonempty(value.target) && integer(value.port, 1, 65535)
    && ['OPEN', 'CLOSED', 'TIMEOUT', 'UNREACHABLE', 'ERROR'].includes(value.state as string)
    && (value.reason === undefined || text(value.reason))
    && text(value.service_hint) && integer(value.latency_ms) && timestamp(value.observed_at);
}
function isJob(value: unknown): value is ScanJob {
  return record(value) && nonempty(value.id) && ['RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED'].includes(value.state as string)
    && timestamp(value.started_at) && (value.finished_at === null || timestamp(value.finished_at))
    && isPlan(value.plan) && integer(value.completed_probes, 0, value.plan.total_probes)
    && Array.isArray(value.results) && value.results.every(isResult)
    && (value.error === null || text(value.error));
}

/** Each instance owns a read lane. Keep the production instance at module scope so it survives view remounts. */
export function createScanBuddyTransport(options: { invoke: Invoke; available: () => boolean; deadlineMs?: number }) {
  const deadlineMs = options.deadlineMs ?? SCAN_BUDDY_DEADLINE_MS;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) throw new Error('Scan Buddy deadline must be positive and finite.');
  let readLane: Promise<void> = Promise.resolve();

  async function command<T>(name: Command, args: Record<string, unknown>, valid: (value: unknown) => value is T): Promise<T> {
    if (!options.available()) throw new Error('Scan Buddy is desktop-only. Open the native app; browser mode cannot scan.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // IPC itself cannot be cancelled. Racing only abandons its result, never repeats the command.
      const value = await Promise.race([
        Promise.resolve().then(() => options.invoke(name, args)).catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Native invocation failed.';
          throw new Error(`Scan Buddy ${name} failed: ${detail}`);
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ScanBuddyTimeoutError(name)), deadlineMs); }),
      ]);
      if (!valid(value)) throw new Error(`Scan Buddy ${name} returned an incompatible native response. Update/rebuild the desktop app so the frontend and native backend match, then refresh history before trying again.`);
      return value;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  function read<T>(operation: () => Promise<T>): Promise<T> {
    const next = readLane.then(operation, operation);
    readLane = next.then(() => undefined, () => undefined);
    return next;
  }
  return {
    planScan: (request: ScanRequest) => read(() => command('scan_buddy_plan', { request }, isPlan)),
    startScan: (request: ScanRequest) => command('scan_buddy_start', { request }, isJob),
    cancelScan: (jobId: string) => command('scan_buddy_cancel', { jobId }, isJob),
    scanStatus: (jobId: string) => read(() => command('scan_buddy_status', { jobId }, isJob)),
    scanHistory: () => read(() => command('scan_buddy_history', {}, (value): value is ScanJob[] => Array.isArray(value) && value.every(isJob))),
    scanStorageStatus: () => read(() => command('scan_buddy_storage_status', {}, (value): value is ScanStorageStatus => record(value)
      && typeof value.persistent === 'boolean' && typeof value.available === 'boolean'
      && Array.isArray(value.warnings) && value.warnings.every(text)
      && (value.last_saved_job === null || text(value.last_saved_job)))),
  };
}
