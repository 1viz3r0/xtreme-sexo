import { getDetailedSystemInfo, type DetailedSystemInfo } from '../services/tauri/system';
import { getDetailedNetworkInterfaces, getActiveTcpConnections, type DetailedAdapterInfo, type TcpConnectionEntry } from '../services/tauri/network';
import { getBackendReadiness, type BackendReadiness } from '../services/tauri/readiness';
import type { RuntimeLogStatus } from '../services/tauri/runtimeLogs';
import { isTauriEnvironment } from '../services/tauri/isTauri';

export const REPORT_LIMITS = { interfaces: 64, sockets: 128, tools: 32, addresses: 8, text: 160, serialized: 2097152, preview: 12000 } as const;
const REDACTED = '[redacted]';
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type SectionName = 'system' | 'interfaces' | 'sockets' | 'readiness' | 'logStatus';
export interface HostReportSection {
  name: SectionName;
  source: string;
  status: 'observed' | 'failed' | 'unavailable';
  startedAtUtc: string;
  collectedAtUtc: string;
  note: string;
  data: Json;
}
export interface HostReportSnapshot {
  schemaVersion: 1;
  startedAtUtc: string;
  collectedAtUtc: string;
  identifiersIncluded: boolean;
  provenance: string;
  limits: typeof REPORT_LIMITS;
  sections: HostReportSection[];
}
export interface HostReportSources {
  desktop: boolean;
  system: () => Promise<DetailedSystemInfo>;
  interfaces: () => Promise<DetailedAdapterInfo[]>;
  sockets: () => Promise<TcpConnectionEntry[]>;
  readiness: () => Promise<BackendReadiness>;
  logStatus: () => Promise<RuntimeLogStatus>;
}
const text = (value: unknown): string => typeof value === 'string'
  // Intentional: remove control and bidi characters from untrusted native metadata.
  // eslint-disable-next-line no-control-regex
  ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, REPORT_LIMITS.text) : 'Unknown';
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const flag = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const utc = (value: unknown): string | null => {
  if (typeof value !== 'string' || value.length > 40) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const identifier = (value: unknown, include: boolean): string => include ? text(value) : REDACTED;
const enumText = (value: unknown, allowed: string[]): string => typeof value === 'string' && allowed.includes(value) ? value : 'Unknown';
function rows<T>(values: T[], limit: number, project: (value: T) => Json): Json {
  if (!Array.isArray(values)) throw new Error('Invalid native collection');
  return { observedCount: values.length, includedCount: Math.min(values.length, limit), omittedCount: Math.max(0, values.length - limit), rows: values.slice(0, limit).map(project) };
}
function systemData(v: DetailedSystemInfo, include: boolean): Json {
  return { hostname: identifier(v.hostname, include), user_name: identifier(v.user_name, include), os_name: text(v.os_name), os_version: text(v.os_version), architecture: text(v.architecture), cpu_model: text(v.cpu_model), cpu_core_count: number(v.cpu_core_count), ram_total_bytes: number(v.ram_total_bytes), ram_available_bytes: number(v.ram_available_bytes), ram_usage_percent: number(v.ram_usage_percent), uptime_seconds: number(v.uptime_seconds), is_admin: flag(v.is_admin) };
}
function interfacesData(values: DetailedAdapterInfo[], include: boolean): Json {
  return rows(values, REPORT_LIMITS.interfaces, v => ({
    name: identifier(v.name, include), friendly_name: identifier(v.friendly_name, include), description: identifier(v.description, include), mac_address: identifier(v.mac_address, include),
    ipv4_addresses: include ? rows(v.ipv4_addresses, REPORT_LIMITS.addresses, text) : REDACTED,
    ipv6_addresses: include ? rows(v.ipv6_addresses, REPORT_LIMITS.addresses, text) : REDACTED,
    oper_status: enumText(v.oper_status, ['Up', 'Down', 'Testing', 'Unknown', 'Dormant', 'NotPresent', 'LowerLayerDown']),
    interface_type: enumText(v.interface_type, ['Ethernet', 'Wireless', 'Wi-Fi', 'Loopback', 'Software Loopback', 'Tunnel', 'Other']),
    rx_bytes: number(v.rx_bytes), tx_bytes: number(v.tx_bytes), rx_packets: number(v.rx_packets), tx_packets: number(v.tx_packets),
  }));
}
function socketsData(values: TcpConnectionEntry[], include: boolean): Json {
  return rows(values, REPORT_LIMITS.sockets, v => ({ local_ip: identifier(v.local_ip, include), local_port: include ? number(v.local_port) : REDACTED, remote_ip: identifier(v.remote_ip, include), remote_port: include ? number(v.remote_port) : REDACTED, pid: include ? number(v.pid) : REDACTED, process_name: identifier(v.process_name, include), tcp_state: enumText(v.tcp_state, ['CLOSED', 'LISTEN', 'SYN_SENT', 'SYN_RECEIVED', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'CLOSE_WAIT', 'CLOSING', 'LAST_ACK', 'TIME_WAIT', 'DELETE_TCB']) }));
}
function readinessData(v: BackendReadiness, include: boolean): Json {
  return { checked_at_utc: utc(v.checked_at), platform: text(v.platform), architecture: text(v.architecture), platform_supported: flag(v.platform_supported),
    storage: { initialized: flag(v.storage.initialized), path: identifier(v.storage.path, include), schema_readable: flag(v.storage.schema_readable), read_write_open: flag(v.storage.read_write_open), writes_verified: flag(v.storage.writes_verified) },
    native_tools: rows(v.native_tools, REPORT_LIMITS.tools, tool => ({ name: identifier(tool.name, include), available: flag(tool.available), path: identifier(tool.path, include) })),
    capture: { enumeration: enumText(v.capture.enumeration, ['AVAILABLE', 'UNAVAILABLE']), interface_count: number(v.capture.interface_count), permission: 'NOT_TESTED' },
    diagnostic_error_count: Array.isArray(v.last_errors) ? v.last_errors.length : null,
  };
}
function logData(v: RuntimeLogStatus): Json {
  return { available: flag(v.available), generated_at_utc: utc(v.generated_at), initialized_at_utc: utc(v.initialized_at), last_write_at_utc: utc(v.last_write_at), file_count: number(v.file_count), retained_bytes: number(v.retained_bytes), max_file_bytes: number(v.max_file_bytes), max_files: number(v.max_files), max_read_bytes: number(v.max_read_bytes) };
}
function nativeSources(): HostReportSources {
  return { desktop: isTauriEnvironment(), system: getDetailedSystemInfo, interfaces: getDetailedNetworkInterfaces, sockets: getActiveTcpConnections, readiness: getBackendReadiness,
    logStatus: async () => { const { invoke } = await import('@tauri-apps/api/core'); return invoke<RuntimeLogStatus>('get_runtime_log_status'); },
  };
}

/** Allowlisted projections only: never retain raw native objects, errors, or messages. */
export async function collectHostReport(includeIdentifiers = false, sources: HostReportSources = nativeSources()): Promise<HostReportSnapshot> {
  const startedAtUtc = new Date().toISOString();
  const definitions: { name: SectionName; source: string; read: () => Promise<Json>; unavailable?: (data: Json) => boolean }[] = [
    { name: 'system', source: 'get_detailed_system_info', read: async () => systemData(await sources.system(), includeIdentifiers) },
    { name: 'interfaces', source: 'get_detailed_network_interfaces', read: async () => interfacesData(await sources.interfaces(), includeIdentifiers) },
    { name: 'sockets', source: 'get_active_tcp_connections', read: async () => socketsData(await sources.sockets(), includeIdentifiers) },
    { name: 'readiness', source: 'get_backend_readiness', read: async () => readinessData(await sources.readiness(), includeIdentifiers) },
    { name: 'logStatus', source: 'get_runtime_log_status', read: async () => logData(await sources.logStatus()), unavailable: data => (data as { available: Json }).available !== true },
  ];
  const times = definitions.map(() => ({ startedAtUtc, collectedAtUtc: startedAtUtc }));
  const results = await Promise.allSettled(definitions.map(async (definition, index) => {
    times[index].startedAtUtc = new Date().toISOString();
    try { return sources.desktop ? await definition.read() : null; }
    finally { times[index].collectedAtUtc = new Date().toISOString(); }
  }));
  const sections: HostReportSection[] = results.map((result, index) => {
    const definition = definitions[index];
    const status = !sources.desktop ? 'unavailable' : result.status === 'rejected' ? 'failed' : definition.unavailable?.(result.value) ? 'unavailable' : 'observed';
    return { name: definition.name, source: definition.source, status, ...times[index],
      note: !sources.desktop ? 'Native desktop required; no browser fallback telemetry collected.' : status === 'failed' ? 'Native read or projection failed. Error text omitted to protect identifiers.' : status === 'unavailable' ? 'Native source reported unavailable; reason text omitted.' : 'Observed local read; empty collections mean zero records returned, not proof of absence.',
      data: result.status === 'fulfilled' ? result.value : null,
    };
  });
  return { schemaVersion: 1, startedAtUtc, collectedAtUtc: new Date().toISOString(), identifiersIncluded: includeIdentifiers,
    provenance: 'User-triggered local native reads, collected independently (not an atomic snapshot). Native coverage and permissions vary by platform. No scans, enrichment, capture, packet payloads, tokens, freeform logs or diagnostic messages. Only application log status is read; native host event records are not collected. Readiness only describes backend checks; capture permission is not tested. Interface counters are cumulative, not measured rates. TCP sockets are not all traffic. No threat or host-health assessment. Export stays local unless you share it. Strings and rows are capped; unrecognized states are Unknown. Serialized size limits are in characters.',
    limits: REPORT_LIMITS, sections };
}
export function hostReportJson(report: HostReportSnapshot): string {
  const output = JSON.stringify(report, null, 2);
  if (output.length > REPORT_LIMITS.serialized) throw new Error('Report exceeds export size limit.');
  return output;
}
export function hostReportMarkdown(report: HostReportSnapshot): string {
  // Native strings cannot close the fixed code fence or insert HTML/Markdown.
  const safeJson = hostReportJson(report).replace(/[`<>&~]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const output = `# NET0ZE local host observation report\n\nCollected UTC: ${report.collectedAtUtc}\n\nIdentifiers: ${report.identifiersIncluded ? 'INCLUDED — sensitive; review before sharing' : 'redacted'}\n\nNo threat or host-health assessment. Source status, timestamps, provenance and truncation counts are included below.\n\n\`\`\`json\n${safeJson}\n\`\`\`\n`;
  if (output.length > REPORT_LIMITS.serialized) throw new Error('Report exceeds export size limit.');
  return output;
}
