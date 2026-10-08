import { isTauriEnvironment } from './isTauri';
import type { CaptureMetrics } from './capture';
import type { FlowRecord, FlowSummaryStats } from './flows';
import type { DetectionFinding, DetectionSummary } from './detections';
import type { ConnectivityStatus, ThreatIntelStatus, GeoIpEntry, ThreatMatchEntry, DeviceEntry } from './intel';

export interface SourceState {
  state: string;
  detail: string;
}

/** Mirrors commands/global_intel.rs. Reads current engines and the local cache only. */
export interface GlobalIntelSnapshot {
  collected_at: string;
  scope: string;
  capture: CaptureMetrics;
  capture_availability: SourceState;
  flows: FlowRecord[];
  flow_summary: FlowSummaryStats;
  detections: DetectionFinding[];
  detection_summary: DetectionSummary;
  connectivity: ConnectivityStatus;
  threat_intel: ThreatIntelStatus;
  geoip: GeoIpEntry[];
  threat_matches: ThreatMatchEntry[];
  devices: DeviceEntry[];
  storage: SourceState;
  enrichment: SourceState;
}

export async function getGlobalIntelSnapshot(limit = 100): Promise<GlobalIntelSnapshot> {
  if (!isTauriEnvironment()) {
    throw new Error('Global Intel telemetry is unavailable in browser mode. Open the native desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  // Propagate failures: an unavailable source is not a successful empty snapshot.
  return invoke<GlobalIntelSnapshot>('get_global_intel_snapshot', { limit });
}
