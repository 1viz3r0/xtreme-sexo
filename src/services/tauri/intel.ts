import { isTauriEnvironment } from './isTauri';

export interface ConnectivityStatus {
  state: string; // ONLINE | DEGRADED | OFFLINE | CONNECTING | STALE
  source: string;
  last_checked: string;
  last_success: string | null;
  latency_ms: number | null;
  detail: string;
}

export interface GeoIpEntry {
  ip: string;
  country: string;
  country_code: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  asn: string | null;
  org: string | null;
  source: string;
  resolved_at: number;
}

export interface ThreatMatchEntry {
  ip: string;
  indicator_type: string;
  feed: string;
  severity: string;
  feed_first_seen: string | null;
  feed_last_seen: string | null;
  matched_at: number;
}

export interface ThreatIntelStatus {
  feed_state: string;
  last_fetched: string | null;
  ioc_count: number;
  match_count: number;
  sources: string[];
}

export interface DeviceEntry {
  ip: string;
  mac: string;
  hostname: string | null;
  vendor: string | null;
  interface: string | null;
  first_seen: number;
  last_seen: number;
  active: boolean;
  is_self: boolean;
}

export interface PortScanEntry {
  ip: string;
  port: number;
  protocol: string;
  state: string;
  service: string;
  first_seen: number;
  last_seen: number;
}

export interface DnsQueryEntry {
  timestamp: string;
  client_ip: string;
  server_ip: string;
  qname: string;
  qtype: string;
  rcode: number;
  answers: number;
}

export async function getConnectivityStatus(): Promise<ConnectivityStatus | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ConnectivityStatus>('get_connectivity_status');
    } catch (err) {
      console.warn('Failed to get connectivity status:', err);
    }
  }
  return null;
}

export async function getGeoipForActiveFlows(): Promise<GeoIpEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<GeoIpEntry[]>('get_geoip_for_active_flows');
    } catch (err) {
      console.warn('Failed to get geoip for active flows:', err);
    }
  }
  return [];
}

export async function getGeoipLookup(ip: string): Promise<GeoIpEntry | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<GeoIpEntry | null>('get_geoip_lookup', { ip });
    } catch (err) {
      console.warn('Failed to get geoip lookup:', err);
    }
  }
  return null;
}

export async function getPublicIp(): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<string | null>('get_public_ip');
    } catch (err) {
      console.warn('Failed to get public IP:', err);
    }
  }
  return null;
}

export async function getThreatIntelStatus(): Promise<ThreatIntelStatus | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ThreatIntelStatus>('get_threat_intel_status');
    } catch (err) {
      console.warn('Failed to get threat intel status:', err);
    }
  }
  return null;
}

export async function evaluateFlowsForThreats(): Promise<ThreatMatchEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ThreatMatchEntry[]>('evaluate_flows_for_threats');
    } catch (err) {
      console.warn('Failed to evaluate flows for threats:', err);
    }
  }
  return [];
}

export async function getThreatMatches(limit = 100): Promise<ThreatMatchEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ThreatMatchEntry[]>('get_threat_matches', { limit });
    } catch (err) {
      console.warn('Failed to get threat matches:', err);
    }
  }
  return [];
}

export async function getDevices(): Promise<DeviceEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DeviceEntry[]>('get_devices');
    } catch (err) {
      console.warn('Failed to get devices:', err);
    }
  }
  return [];
}

export async function refreshDevices(): Promise<DeviceEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DeviceEntry[]>('refresh_devices');
    } catch (err) {
      console.warn('Failed to refresh devices:', err);
    }
  }
  return [];
}

export async function getPortScanResults(limit = 100): Promise<PortScanEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PortScanEntry[]>('get_port_scan_results', { limit });
    } catch (err) {
      console.warn('Failed to get port scan results:', err);
    }
  }
  return [];
}

export async function scanHostPorts(ip: string, extraPorts?: number[]): Promise<PortScanEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<PortScanEntry[]>('scan_host_ports', { ip, extraPorts: extraPorts ?? [] });
    } catch (err) {
      console.warn('Failed to scan host ports:', err);
      throw new Error(String(err));
    }
  }
  return [];
}

export async function getDnsRecords(limit = 100): Promise<DnsQueryEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DnsQueryEntry[]>('get_dns_records', { limit });
    } catch (err) {
      console.warn('Failed to get DNS records:', err);
    }
  }
  return [];
}

export interface AuditLogEntry {
  id: number;
  timestamp: number;
  actor: string;
  action: string;
  resource: string;
  prev_hash: string;
  curr_hash: string;
}

export async function getAuditLog(limit = 100): Promise<AuditLogEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<AuditLogEntry[]>('get_audit_log', { limit });
    } catch (err) {
      console.warn('Failed to get audit log:', err);
    }
  }
  return [];
}

export async function subscribeToConnectivity(
  callback: (status: ConnectivityStatus) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<ConnectivityStatus>('connectivity-status', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to connectivity.status:', err);
    }
  }
  return () => {};
}

export async function subscribeToThreatIntelStatus(
  callback: (status: ThreatIntelStatus) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<ThreatIntelStatus>('threatintel-status', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to threatintel.status:', err);
    }
  }
  return () => {};
}
