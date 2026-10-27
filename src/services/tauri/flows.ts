import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

export interface FlowRecord {
  flow_id: string;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  protocol: string;
  ip_version: number;
  client_bytes: number;
  server_bytes: number;
  total_bytes: number;
  packet_count: number;
  tcp_state: string;
  ja4: string;
  threat_score: number;
  severity: string;
  ts_start: number;
  ts_end: number;
  duration_ms: number;
  rtt_ms: number;
  dns_qname: string | null;
}

export interface FlowSummaryStats {
  active_flows_count: number;
  total_flows_processed: number;
  tcp_flows_count: number;
  udp_flows_count: number;
  other_flows_count: number;
  total_volume_bytes: number;
  persistence_failures: number;
  retry_queue_count: number;
  avg_rtt_ms: number;
}

/**
 * Gets active aggregated flow records
 */
export async function getActiveFlows(limit = 100): Promise<FlowRecord[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<FlowRecord[]>('get_active_flows', { limit });
    } catch (err) {
      console.warn('Failed to get active flows:', err);
    }
  }
  return [];
}

/**
 * Gets live flow summary statistics
 */
export async function getFlowSummary(): Promise<FlowSummaryStats> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<FlowSummaryStats>('get_flow_summary');
    } catch (err) {
      console.warn('Failed to get flow summary:', err);
    }
  }
  return {
    active_flows_count: 0,
    total_flows_processed: 0,
    tcp_flows_count: 0,
    udp_flows_count: 0,
    other_flows_count: 0,
    total_volume_bytes: 0,
    persistence_failures: 0,
    retry_queue_count: 0,
    avg_rtt_ms: 0,
  };
}

/**
 * Explicitly flushes active flow queue to DuckDB storage
 */
export async function flushFlowsToDuckDB(): Promise<number> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<number>('flush_flows_to_duckdb');
    } catch (err) {
      console.warn('Failed to flush flows to DuckDB:', err);
    }
  }
  return 0;
}

/**
 * Subscribes to real-time batched flow records emitted by the native capture loop
 */
export async function subscribeToFlowStream(
  callback: (flow: FlowRecord) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<FlowRecord[]>('capture-flows', (e) => {
        for (const flow of e.payload) callback(flow);
      });
    } catch (err) {
      console.warn('Failed to listen to capture-flows:', err);
    }
  }
  return () => {};
}

/**
 * Subscribes to flow.summary events
 */
export async function subscribeToFlowSummary(
  callback: (stats: FlowSummaryStats) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<FlowSummaryStats>('flow-summary', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to flow.summary:', err);
    }
  }
  return () => {};
}
