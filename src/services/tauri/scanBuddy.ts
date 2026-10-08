import { isTauriEnvironment } from './isTauri';
import { createScanBuddyTransport } from '../../lib/scanBuddyTransport';

export type ScanState = 'OPEN' | 'CLOSED' | 'TIMEOUT' | 'UNREACHABLE' | 'ERROR';
export interface ScanRequest { targets: string; ports: string; timeout_ms: number; concurrency: number; authorized: boolean }
export interface ScanPlan { targets: string[]; ports: number[]; total_probes: number; timeout_ms: number; concurrency: number; warnings: string[] }
export interface ScanResult { target: string; port: number; state: ScanState; reason?: string; service_hint: string; latency_ms: number; observed_at: string }
export interface ScanStorageStatus { persistent: boolean; available: boolean; warnings: string[]; last_saved_job: string | null }
export interface ScanJob { id: string; state: 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'; started_at: string; finished_at: string | null; plan: ScanPlan; completed_probes: number; results: ScanResult[]; error: string | null }

export const scanBuddyAvailable = isTauriEnvironment;
// One bounded read lane survives effect restarts and view remounts.
const transport = createScanBuddyTransport({
  available: scanBuddyAvailable,
  invoke: async (name, args) => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<unknown>(name, args);
  },
});
export const { planScan, startScan, cancelScan, scanStatus, scanHistory, scanStorageStatus } = transport;
