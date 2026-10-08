import React from 'react';
import type { DetailedSystemInfo } from '../services/tauri/system';
import type { DetailedAdapterInfo } from '../services/tauri/network';
import type { GlobalIntelSnapshot } from '../services/tauri/globalIntel';
import type { TabType } from './Sidebar';

export interface OverviewSummaryProps {
  system: DetailedSystemInfo | null;
  interfaces: DetailedAdapterInfo[] | null;
  snapshot: GlobalIntelSnapshot | null;
  unavailable?: string | null;
  onNavigate: (tab: TabType) => void;
}

const value = (text: string | number | null | undefined) => text === null || text === undefined || text === '' ? 'Unavailable' : String(text);
const bytes = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${n} B`;
const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

export const OverviewSummary: React.FC<OverviewSummaryProps> = ({ system, interfaces, snapshot, unavailable, onNavigate }) => {
  const adapters = interfaces?.filter((item) => item.ipv4_addresses.length || item.ipv6_addresses.length) ?? [];
  const ips = adapters.flatMap((item) => item.ipv4_addresses);
  const capture = snapshot?.capture;
  const flowCount = snapshot?.flow_summary.active_flows_count;
  const findingCount = snapshot?.detection_summary.total_findings_count;
  return <section aria-label="Operations overview" className="mx-3 mt-3 rounded border border-[#525252] bg-[#0d0d0d] p-3 text-[11px] font-mono">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h1 className="text-sm font-bold tracking-wide text-white">OPERATIONS OVERVIEW</h1><p className="text-slate-500">Local evidence, current session, and cached observations</p></div>
      <nav aria-label="Operations navigation" className="flex flex-wrap gap-1">
        {([['system_logs', 'Dashboard'], ['conversations', 'Capture Buddy'], ['network_engine', 'Scan Buddy'], ['watchtower', 'Watchtower']] as const).map(([tab, label]) => <button key={tab} onClick={() => onNavigate(tab)} className="rounded border border-[#525252] px-2 py-1 text-slate-200 hover:bg-[#252525]">{label}</button>)}
      </nav>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded border border-slate-800 bg-black/20 p-2"><b className="text-slate-400">HOST</b><div className="mt-1 text-white">{value(system?.hostname)}</div><div className="text-slate-500">{value(system ? `${system.os_name} ${system.os_version}` : null)} • {value(system?.architecture)}</div></div>
      <div className="rounded border border-slate-800 bg-black/20 p-2"><b className="text-slate-400">RESOURCES</b><div className="mt-1 text-white">CPU {value(system?.cpu_core_count ? `${system.cpu_core_count} cores` : null)} • RAM {system ? `${system.ram_usage_percent.toFixed(0)}% / ${bytes(system.ram_total_bytes)}` : 'Unavailable'}</div><div className="text-slate-500">Uptime {system ? duration(system.uptime_seconds) : 'Unavailable'}</div></div>
      <div className="rounded border border-slate-800 bg-black/20 p-2"><b className="text-slate-400">LOCAL NETWORK</b><div className="mt-1 break-all text-white">{ips.length ? ips.join(', ') : 'Unavailable'}</div><div className="text-slate-500">{interfaces === null ? 'Reading passive interface inventory…' : `${adapters.length} interface${adapters.length === 1 ? '' : 's'}`}</div></div>
      <div className="rounded border border-slate-800 bg-black/20 p-2"><b className="text-slate-400">SESSION</b><div className="mt-1 text-white">{snapshot ? `${flowCount ?? 0} flows • ${findingCount ?? 0} findings` : 'Unavailable'}</div><div className="text-slate-500">{capture ? `${capture.packets_captured.toLocaleString()} packets • ${capture.dropped_packets.toLocaleString()} dropped` : 'Capture metrics unavailable'}</div></div>
    </div>
    <div role="status" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-2 text-slate-500"><span>Devices: {snapshot ? `${snapshot.devices.length} observed (cached)` : 'Unavailable'}</span><span>Capture: {value(snapshot?.capture_availability.state)}</span><span>Storage: {value(snapshot?.storage.state)}</span><span>Enrichment: {value(snapshot?.enrichment.state)}</span>{unavailable && <span className="text-amber-400">{unavailable}</span>}</div>
    <details className="mt-2 text-slate-500"><summary className="cursor-pointer text-slate-200">Technical status and freshness</summary><div className="mt-1 grid gap-1 sm:grid-cols-2"><span>Snapshot: {snapshot ? new Date(snapshot.collected_at).toLocaleString() : 'Unavailable'}</span><span>Interfaces: {interfaces ? 'fresh passive read' : 'unavailable'}</span><span>Scope: {value(snapshot?.scope)}</span><span>Sources are not health claims; unavailable data stays unavailable.</span></div></details>
  </section>;
};
