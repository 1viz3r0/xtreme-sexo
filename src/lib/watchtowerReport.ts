import type { FlowRecord } from '../services/tauri/flows';
import type { DetectionFinding } from '../services/tauri/detections';
import type { AttackGraph } from '../services/tauri/graph';
import type { DetailedAdapterInfo } from '../services/tauri/network';
import type { DeviceEntry } from '../services/tauri/intel';
import type { WatchtowerSnapshot } from '../services/tauri/watchtower';
import type { ActiveLocalDiscovery } from '../services/tauri/watchtowerDiscovery';
export type WatchtowerExport = 'json' | 'csv' | 'md' | 'txt';
export interface WatchtowerReportInput { generatedAt: string; flows: FlowRecord[]; events: DetectionFinding[]; graph: AttackGraph; interfaces: DetailedAdapterInfo[]; devices: DeviceEntry[]; kernel: WatchtowerSnapshot | null; activeDiscovery: ActiveLocalDiscovery | null; }
const warning = 'Watchtower contains loaded local observations, not a complete network inventory or vulnerability report. MACs, hosts, services, and online status may be unavailable or stale.';
const safe = (value: unknown) => typeof value === 'string' ? value.replace(/[\r\n,]/g, ' ') : value == null ? '' : String(value);
export function buildWatchtowerReport(input: WatchtowerReportInput, format: WatchtowerExport): string {
  const payload = { report: 'NET0ZE Watchtower observation report', generated_at: input.generatedAt, warning, sources: { interfaces: input.interfaces, passive_devices: input.devices, kernel: input.kernel, active_discovery: input.activeDiscovery, flows: input.flows, findings: input.events, graph: input.graph } };
  if (format === 'json') return JSON.stringify(payload, null, 2);
  const rows = input.activeDiscovery?.devices ?? input.devices.map(device => ({ ip: device.ip, mac: device.mac || null, state: device.active ? 'active' : 'historical', method: 'passive inventory', last_seen: new Date(device.last_seen).toISOString(), present: device.active }));
  if (format === 'csv') return [['IP', 'MAC', 'State', 'Method', 'Last seen', 'Present'], ...rows.map(row => [row.ip, row.mac ?? '', row.state, row.method, row.last_seen, row.present ? 'yes' : 'no'])].map(row => row.map(safe).join(',')).join('\n');
  const lines = [`# NET0ZE Watchtower observation report`, `Generated: ${input.generatedAt}`, '', warning, '', `## Sources`, `Interfaces: ${input.interfaces.length}`, `Passive devices: ${input.devices.length}`, `Active discovery devices: ${input.activeDiscovery?.devices.length ?? 0}`, `Kernel neighbors: ${input.kernel?.neighbors.length ?? 'unavailable'}`, `Flows: ${input.flows.length}`, `Findings: ${input.events.length}`, `Graph: ${input.graph.nodes.length} nodes / ${input.graph.edges.length} edges`, '', '## Devices', ...(rows.length ? rows.map(row => `- ${row.ip} · ${row.mac ?? 'MAC unavailable'} · ${row.state} · ${row.method} · last seen ${row.last_seen}`) : ['- No device records loaded.'])];
  return format === 'md' ? lines.join('\n') : lines.join('\n').replace(/^# /, '').replace(/^## /gm, '').replace(/^- /gm, '');
}
