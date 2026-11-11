import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

/**
 * Typed adapters for the Watchtower persistent IP intelligence workspace.
 * All commands are served by the backend `ip_intel` module; scanning reuses
 * the shared Scan Buddy engine and per-IP capture reuses the Capture Buddy
 * engine (no second capture/scanner implementation).
 */

export interface IpIntelRecord {
  ip: string;
  mac: string | null;
  hostname: string | null;
  vendor: string | null;
  os_guess: string | null;
  os_confidence: string | null;
  os_basis: string | null;
  interface: string | null;
  first_seen: number;
  last_seen: number;
  packet_count: number;
  byte_count: number;
  flow_count: number;
  last_activity_at: number | null;
  source: string;
  origin: string;
  label: string | null;
  excluded: boolean;
  scan_enabled: boolean;
  scan_authorized_at: number | null;
  open_ports: string | null;
  last_scan_at: number | null;
  scan_failures: number;
  last_scan_state: string | null;
  updated_at: number;
}

export interface IpIntelScanConfig {
  enabled: boolean;
  interval_seconds: number;
  intensity: string;
  max_runs_per_cycle: number;
}

export interface IpIntelScanStatus {
  running: boolean;
  current_ip: string | null;
  last_job_id: string | null;
  last_job_state: string | null;
  next_due_at: string | null;
  due_count: number;
  config: IpIntelScanConfig;
}

export interface IpIntelScanOutcome {
  ip: string;
  trigger: string;
  started_at: number;
  state: string;
  open_ports: number[];
  probe_count: number;
  error: string | null;
}

export interface IpIntelNote {
  id: number;
  ip: string | null;
  body: string;
  created_at: number;
  updated_at: number;
}

export interface IntelGeoIpEntry {
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

export interface IntelDnsEntry {
  timestamp: string;
  client_ip: string;
  server_ip: string;
  qname: string;
  qtype: string;
  rcode: number;
  answers: number;
}

export interface IntelPortScanEntry {
  ip: string;
  port: number;
  protocol: string;
  state: string;
  service: string;
  first_seen: number;
  last_seen: number;
}

export interface IpIntelInvestigation {
  record: IpIntelRecord;
  geoip: IntelGeoIpEntry | null;
  geoip_note: string;
  dns_records: IntelDnsEntry[];
  port_scan: IntelPortScanEntry[];
  scan_history: Array<{
    id: number;
    ip: string;
    trigger: string;
    started_at: number;
    finished_at: number | null;
    state: string;
    open_ports: number[] | null;
    probe_count: number | null;
    error: string | null;
  }>;
  notes: IpIntelNote[];
  scan_eligible: boolean;
}

/** BuddyStatus from the shared Capture Buddy engine. */
export interface IntelCaptureSession {
  session_id: string;
  path: string;
  running: boolean;
  bytes: number;
}

/** PacketRow from the shared Capture Buddy engine. */
export interface IntelPacketRow {
  number: number;
  time: string;
  source: string;
  destination: string;
  protocol: string;
  length: string;
  info: string;
}

export interface IntelPacketPage {
  packets: IntelPacketRow[];
  has_more: boolean;
}

function requireTauri(command: string): void {
  if (!isTauriEnvironment()) throw new Error(`${command} is unavailable outside the native app.`);
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  requireTauri(command);
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    // Surface backend messages (they are user-facing validation text) but
    // never raw IPC internals.
    if (error instanceof Error && error.message && !error.message.includes('unavailable outside')) {
      throw new Error(String(error.message));
    }
    throw new Error(`${command} failed.`);
  }
}

export function listIps(limit?: number): Promise<IpIntelRecord[]> {
  return call<IpIntelRecord[]>('watchtower_ips_list', { limit });
}
export function saveIp(edit: {
  ip: string;
  label?: string | null;
  mac?: string | null;
  hostname?: string | null;
  vendor?: string | null;
  excluded?: boolean | null;
  scanEnabled?: boolean | null;
}): Promise<IpIntelRecord> {
  return call<IpIntelRecord>('watchtower_ip_save', edit);
}
export function removeIp(ip: string): Promise<void> {
  return call<void>('watchtower_ip_remove', { ip });
}
export function setIpFlags(ip: string, excluded?: boolean | null, scanEnabled?: boolean | null): Promise<IpIntelRecord> {
  return call<IpIntelRecord>('watchtower_ip_set_flags', { ip, excluded, scanEnabled });
}
export function getScanConfig(): Promise<IpIntelScanConfig> {
  return call<IpIntelScanConfig>('watchtower_scan_config_get');
}
export function setScanConfig(config: {
  enabled: boolean;
  intervalSeconds: number;
  intensity: string;
  maxRunsPerCycle: number;
}): Promise<IpIntelScanConfig> {
  return call<IpIntelScanConfig>('watchtower_scan_config_set', config);
}
export function getScanStatus(): Promise<IpIntelScanStatus> {
  return call<IpIntelScanStatus>('watchtower_scan_status');
}
export function scanIpNow(ip: string, force?: boolean): Promise<IpIntelScanOutcome> {
  return call<IpIntelScanOutcome>('watchtower_ip_scan_now', { ip, force });
}
export function investigateIp(ip: string): Promise<IpIntelInvestigation> {
  return call<IpIntelInvestigation>('watchtower_ip_investigate', { ip });
}
export function listNotes(ip: string | null, limit?: number): Promise<IpIntelNote[]> {
  return call<IpIntelNote[]>('watchtower_notes_list', { ip, limit });
}
export function saveNote(id: number | null, ip: string | null, body: string): Promise<IpIntelNote> {
  return call<IpIntelNote>('watchtower_note_save', { id, ip, body });
}
export function deleteNote(id: number): Promise<void> {
  return call<void>('watchtower_note_delete', { id });
}

// Per-IP capture goes through the existing Capture Buddy engine commands.
export function listCaptureInterfaces(): Promise<string[]> {
  return call<string[]>('buddy_interfaces');
}
export function startCapture(options: {
  interface: string;
  captureFilter: string;
  durationSeconds?: number | null;
  promiscuous?: boolean | null;
  direction?: string | null;
  snapshotLength?: number | null;
  maxBytes?: number | null;
  maxPackets?: number | null;
}): Promise<IntelCaptureSession> {
  return call<IntelCaptureSession>('buddy_start', options);
}
export function stopCapture(sessionId: string): Promise<void> {
  return call<void>('buddy_stop', { sessionId });
}
export function closeCapture(sessionId: string): Promise<void> {
  return call<void>('buddy_close', { sessionId });
}
export function listCapturePackets(sessionId: string, displayFilter = ''): Promise<IntelPacketPage> {
  return call<IntelPacketPage>('buddy_packets', { sessionId, displayFilter });
}
export function exportCapture(sessionId: string, destination: string): Promise<{ path: string; bytes: number }> {
  return call<{ path: string; bytes: number }>('buddy_save_file', { sessionId, destination });
}

/**
 * Injectable source surface so the workspace is testable without a native
 * runtime. Defaults bind to the strict invoke wrappers above.
 */
export interface IpIntelSources {
  listIps: typeof listIps;
  saveIp: typeof saveIp;
  removeIp: typeof removeIp;
  setIpFlags: typeof setIpFlags;
  getScanConfig: typeof getScanConfig;
  setScanConfig: typeof setScanConfig;
  getScanStatus: typeof getScanStatus;
  scanIpNow: typeof scanIpNow;
  investigateIp: typeof investigateIp;
  listNotes: typeof listNotes;
  saveNote: typeof saveNote;
  deleteNote: typeof deleteNote;
  listCaptureInterfaces: typeof listCaptureInterfaces;
  startCapture: typeof startCapture;
  stopCapture: typeof stopCapture;
  closeCapture: typeof closeCapture;
  listCapturePackets: typeof listCapturePackets;
  exportCapture: typeof exportCapture;
}

export const ipIntelSources: IpIntelSources = {
  listIps,
  saveIp,
  removeIp,
  setIpFlags,
  getScanConfig,
  setScanConfig,
  getScanStatus,
  scanIpNow,
  investigateIp,
  listNotes,
  saveNote,
  deleteNote,
  listCaptureInterfaces,
  startCapture,
  stopCapture,
  closeCapture,
  listCapturePackets,
  exportCapture,
};
