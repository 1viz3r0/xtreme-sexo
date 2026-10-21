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

export type OverviewDataState = 'unavailable' | 'stale' | 'loaded' | 'awaiting';

const isValidNumber = (number: number | null | undefined): number is number => (
  number !== null && number !== undefined && Number.isFinite(number) && number >= 0
);

const count = (number: number | null | undefined) => isValidNumber(number) ? number.toLocaleString() : 'Unavailable';

const value = (text: string | number | null | undefined) => (
  text === null || text === undefined || text === '' ? 'Unavailable' : String(text)
);

const bytes = (number: number | null | undefined) => {
  if (!isValidNumber(number)) return 'Unavailable';
  if (number >= 1024 ** 3) return `${(number / 1024 ** 3).toFixed(1)} GB`;
  if (number >= 1024 ** 2) return `${(number / 1024 ** 2).toFixed(0)} MB`;
  if (number >= 1024) return `${(number / 1024).toFixed(1)} KB`;
  return `${number} B`;
};

export function getOverviewDataState(snapshot: GlobalIntelSnapshot | null, unavailable?: string | null): OverviewDataState {
  if (unavailable && !snapshot) return 'unavailable';
  if (unavailable && snapshot) return 'stale';
  if (snapshot) return 'loaded';
  return 'awaiting';
}

export function formatSnapshotAge(collectedAt: string | undefined, now = Date.now()): string {
  if (!collectedAt) return 'timestamp unavailable';
  const timestamp = Date.parse(collectedAt);
  if (!Number.isFinite(timestamp)) return 'timestamp unavailable';
  if (timestamp > now) return 'timestamp in future';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatObservedThroughput(bytesPerSecond: number | null | undefined, packetsPerSecond: number | null | undefined, available: boolean): string {
  if (!available || !isValidNumber(bytesPerSecond) || !isValidNumber(packetsPerSecond)) return 'Unavailable';
  return `${bytes(bytesPerSecond)}/s · ${count(packetsPerSecond)} pkt/s`;
}

export const OverviewSummary: React.FC<OverviewSummaryProps> = ({ system, interfaces, snapshot, unavailable, onNavigate }) => {
  const dataState = getOverviewDataState(snapshot, unavailable);
  const stateLabel = {
    unavailable: 'NATIVE DATA UNAVAILABLE',
    stale: 'LAST SNAPSHOT / STALE',
    loaded: 'NATIVE SNAPSHOT LOADED',
    awaiting: 'AWAITING NATIVE SNAPSHOT',
  }[dataState];
  const snapshotAge = snapshot ? formatSnapshotAge(snapshot.collected_at) : 'No snapshot timestamp';
  const capture = snapshot?.capture;
  const captureAvailability = snapshot?.capture_availability;
  const captureAvailable = captureAvailability?.state?.toUpperCase() === 'AVAILABLE';
  const adapters = interfaces?.filter((item) => item.ipv4_addresses.length || item.ipv6_addresses.length) ?? [];
  const ips = adapters.flatMap((item) => [...item.ipv4_addresses, ...item.ipv6_addresses]);
  const flowCount = snapshot?.flow_summary?.active_flows_count;
  const criticalCount = snapshot?.detection_summary?.critical_count;
  const highCount = snapshot?.detection_summary?.high_count;
  const highFindings = isValidNumber(criticalCount) && isValidNumber(highCount) ? criticalCount + highCount : null;
  const statusTone = dataState === 'loaded' ? 'text-emerald-300' : dataState === 'stale' ? 'text-amber-300' : 'text-slate-400';
  const metricClass = 'border border-[#292929] bg-[#111111] p-3';
  const buttonClass = 'border border-[#525252] bg-[#151515] px-2.5 py-1.5 text-left text-slate-100 transition-colors hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';

  return (
    <section aria-labelledby="gods-eye-title" className="border-b border-[#292929] bg-[#0b0b0b] p-3 font-mono text-[11px] text-slate-300 sm:p-4">
      <header className="flex flex-col gap-3 border-b border-[#292929] pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] tracking-[0.28em] text-slate-500">NET0ZE / GOD'S EYE</p>
          <h1 id="gods-eye-title" className="mt-1 text-2xl font-semibold tracking-[0.12em] text-white sm:text-3xl">GOD'S EYE VIEW</h1>
          <p className="mt-1 text-slate-400">A globe-first view of this node's observed network evidence.</p>
        </div>
        <div className="border-l-2 border-[#3b3b3b] pl-3 lg:min-w-[16rem] lg:text-right">
          <p className={`text-[10px] tracking-[0.16em] ${statusTone}`} role="status">{stateLabel}</p>
          <p className="mt-1 text-[10px] text-slate-500">{snapshotAge}{snapshot ? ` · ${new Date(snapshot.collected_at).toLocaleTimeString()}` : ''}</p>
          {unavailable && <p className="mt-1 break-words text-amber-300">{unavailable}</p>}
        </div>
      </header>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="God's Eye telemetry">
        <article className={metricClass}><p className="text-[10px] tracking-[0.14em] text-slate-500">HOST</p><p className="mt-1 break-words text-white">{value(system?.hostname)}</p><p className="mt-1 text-slate-500">{value(system ? `${system.os_name} ${system.os_version}` : null)}</p></article>
        <article className={metricClass}><p className="text-[10px] tracking-[0.14em] text-slate-500">INTERFACES</p><p className="mt-1 text-xl text-white">{interfaces === null ? '—' : count(adapters.length)}</p><p className="mt-1 text-slate-500">{ips.length ? ips.slice(0, 2).join(' · ') : 'No addresses observed'}</p></article>
        <article className={metricClass}><p className="text-[10px] tracking-[0.14em] text-slate-500">ENDPOINTS</p><p className="mt-1 text-xl text-white">{snapshot ? count(snapshot.devices?.length) : '—'}</p><p className="mt-1 text-slate-500">Observed or cached</p></article>
        <article className={metricClass}><p className="text-[10px] tracking-[0.14em] text-slate-500">ACTIVE FLOWS</p><p className="mt-1 text-xl text-white">{count(flowCount)}</p><p className="mt-1 text-slate-500">Current session</p></article>
        <article className={metricClass}><p className="text-[10px] tracking-[0.14em] text-slate-500">HIGH+ FINDINGS</p><p className="mt-1 text-xl text-white">{count(highFindings)}</p><p className="mt-1 text-slate-500">Loaded evidence only</p></article>
      </div>

      <nav aria-label="God's Eye navigation" className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-slate-600">Open workspace</span>
        {([['system_logs', 'Dashboard'], ['conversations', 'Capture Buddy'], ['network_engine', 'Scan Buddy'], ['watchtower', 'Watchtower']] as const).map(([tab, label]) => (
          <button key={tab} type="button" onClick={() => onNavigate(tab)} className={buttonClass}>{label}</button>
        ))}
      </nav>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#292929] pt-3 text-[10px] text-slate-500">
        <span>Observed capture: {formatObservedThroughput(capture?.bytes_per_sec, capture?.packets_per_sec, captureAvailable)}</span>
        <span>Scope: {value(snapshot?.scope)} · No complete-network claim</span>
      </div>
    </section>
  );
};
