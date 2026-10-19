import { isTauriEnvironment } from './isTauri';
import { createScanBuddyTransport } from '../../lib/scanBuddyTransport';

export type ScanState = 'OPEN' | 'CLOSED' | 'TIMEOUT' | 'UNREACHABLE' | 'ERROR';
export type ScanProfile = 'common' | 'registered' | 'all_tcp' | 'custom';
export interface ScanRequest { targets: string; ports: string; timeout_ms: number; concurrency: number; authorized: boolean; profile?: ScanProfile }
export interface ScanImpactEstimate { probes: number; estimated_duration_ms: number; worst_case_duration_ms?: number; within_budget: boolean; budget_probes: number; budget_seconds: number }
export interface ScanPlan { targets: string[]; ports: number[]; total_probes: number; timeout_ms: number; concurrency: number; warnings: string[]; scope_fingerprint?: string; profile?: ScanProfile; impact_estimate?: ScanImpactEstimate }
export interface ScanResult { target: string; port: number; state: ScanState; reason?: string; service_hint: string; latency_ms: number; observed_at: string }
export interface ScanStorageStatus { persistent: boolean; available: boolean; warnings: string[]; last_saved_job: string | null }
export interface ScanAuthorization { confirmed_at: string; scope_fingerprint: string }
export interface ScanJob { id: string; state: 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'; started_at: string; finished_at: string | null; plan: ScanPlan; completed_probes: number; results: ScanResult[]; error: string | null; authorization?: ScanAuthorization | null }
export interface NetworkScopeInterface { interface_name: string; address: string; prefix: number; scan_cidr: string; gateway: string | null; warnings: string[] }
export interface NetworkScopeDiscovery { interfaces: NetworkScopeInterface[]; warnings: string[] }

export const scanBuddyAvailable = isTauriEnvironment;
// One bounded read lane survives effect restarts and view remounts.
const transport = createScanBuddyTransport({
  available: scanBuddyAvailable,
  invoke: async (name, args) => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<unknown>(name, args);
  },
});
export const { planScan, startScan, cancelScan, scanStatus, scanHistory, scanStorageStatus, discoverNetworkScope, resetScanHistory } = transport;
