import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Eye, Network, Radio, RefreshCw, Server, Wifi } from 'lucide-react';
import type { FlowRecord } from '../services/tauri/flows';
import type { DetectionFinding } from '../services/tauri/detections';
import type { AttackGraph } from '../services/tauri/graph';
import { localInventorySources, type LocalInventorySources } from '../services/tauri/localInventory';
import type { DetailedAdapterInfo } from '../services/tauri/network';
import type { DeviceEntry } from '../services/tauri/intel';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { getWatchtowerSnapshot, type WatchtowerSnapshot } from '../services/tauri/watchtower';
import { discoverLocalNetwork, type ActiveLocalDiscovery } from '../services/tauri/watchtowerDiscovery';
import { buildWatchtowerReport, type WatchtowerExport } from '../lib/watchtowerReport';
import { downloadTextFile } from '../lib/localDownload';
import { ReadinessPanel } from './ReadinessPanel';

export interface WatchtowerProps {
  flows: FlowRecord[];
  events: DetectionFinding[];
  graph: AttackGraph;
  onOpenScan?: (target: string) => void;
  onOpenCapture?: (context: Record<string, unknown>) => void;
  kernelSnapshotSource?: (refresh?: boolean) => Promise<WatchtowerSnapshot>;
  /** Injectable only to keep the explicit, local inventory actions testable. */
  inventorySources?: WatchtowerDataSources;
}

export type WatchtowerDataSources = LocalInventorySources;

const MAX_RECENT_SIGNALS = 5;
const MAX_INVENTORY_ROWS = 100;

const defaultInventorySources: WatchtowerDataSources = localInventorySources;
const defaultKernelSnapshot = getWatchtowerSnapshot;

function signalTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 8640000000000000) return 'Time unavailable';
  return new Date(timestamp).toISOString();
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="group rounded-xl border border-zinc-800/90 bg-[#111315] p-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 transition-colors group-hover:bg-zinc-300" />
      </div>
       <p className="mt-2 break-all text-xl font-semibold tabular-nums tracking-tight text-zinc-100 sm:text-2xl">{value}</p>
       <p className="mt-1 break-words text-[11px] text-zinc-500">{detail}</p>
    </div>
  );
}

/** A local snapshot view. Inventory reads are bounded, passive local reads only. */
export function Watchtower({ flows, events, graph, inventorySources, kernelSnapshotSource, onOpenScan, onOpenCapture }: WatchtowerProps) {
  const sources = inventorySources ?? defaultInventorySources;
  const kernelSnapshot = kernelSnapshotSource ?? defaultKernelSnapshot;
  const inventoryAvailable = Boolean(inventorySources || kernelSnapshotSource) || isTauriEnvironment();
  const [adapters, setAdapters] = useState<DetailedAdapterInfo[]>([]);
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [interfaceBusy, setInterfaceBusy] = useState(false);
  const [neighborBusy, setNeighborBusy] = useState(false);
  const [interfaceError, setInterfaceError] = useState<string | null>(null);
  const [neighborError, setNeighborError] = useState<string | null>(null);
  const [interfaceLoaded, setInterfaceLoaded] = useState(false);
  const [neighborLoaded, setNeighborLoaded] = useState(false);
  const [kernel, setKernel] = useState<WatchtowerSnapshot | null>(null);
  const [kernelBusy, setKernelBusy] = useState(false);
  const kernelBusyRef = useRef(false);
  const [kernelError, setKernelError] = useState<string | null>(null);
  const [activeDiscovery, setActiveDiscovery] = useState<ActiveLocalDiscovery | null>(null);
  const [activeDiscoveryStarted, setActiveDiscoveryStarted] = useState(false);
  const [activeDiscoveryBusy, setActiveDiscoveryBusy] = useState(false);
  const [activeDiscoveryPaused, setActiveDiscoveryPaused] = useState(false);
  const activeDiscoveryRef = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef({ interfaces: 0, neighbors: 0 });
  const inFlightRef = useRef<{ interfaces?: Promise<void>; neighbors?: Promise<void> }>({});
  const populatedSources = [flows.length > 0, events.length > 0, graph.nodes.length > 0 || graph.edges.length > 0, adapters.length > 0, devices.length > 0, kernel !== null].filter(Boolean).length;
  const recentSignals = [...events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENT_SIGNALS);
  const downloadReport = async (format: WatchtowerExport) => {
    const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/plain';
    await downloadTextFile(buildWatchtowerReport({ generatedAt: new Date().toISOString(), flows, events, graph, interfaces: adapters, devices, kernel, activeDiscovery }, format), mime, `watchtower-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`);
  };

  const runActiveDiscovery = useCallback(async () => {
    if (activeDiscoveryPaused || activeDiscoveryRef.current || !inventoryAvailable) return;
    setActiveDiscoveryStarted(true);
    activeDiscoveryRef.current = true;
    setActiveDiscoveryBusy(true);
    try { setActiveDiscovery(await discoverLocalNetwork()); }
    catch (error) { setActiveDiscovery({ interface: '', local_ip: '', cidr: '', gateway: null, devices: [], warnings: [error instanceof Error ? error.message : 'Active local discovery failed.'] }); }
    finally { activeDiscoveryRef.current = false; setActiveDiscoveryBusy(false); }
  }, [activeDiscoveryPaused, inventoryAvailable]);

  const loadInterfaces = useCallback(async () => {
    if (inFlightRef.current.interfaces) return inFlightRef.current.interfaces;
    const request = ++requestRef.current.interfaces;
    setInterfaceBusy(true);
    setInterfaceError(null);
    const task = (async () => { try {
      const result = (await sources.getDetailedNetworkInterfaces()).slice(0, MAX_INVENTORY_ROWS);
      if (mountedRef.current && request === requestRef.current.interfaces) { setAdapters(result); setInterfaceLoaded(true); }
    } catch (error) {
      if (mountedRef.current && request === requestRef.current.interfaces) setInterfaceError(error instanceof Error ? error.message : 'Unable to load local interfaces.');
    } finally {
      if (mountedRef.current && request === requestRef.current.interfaces) setInterfaceBusy(false);
      inFlightRef.current.interfaces = undefined;
    } })();
    inFlightRef.current.interfaces = task;
    return task;
  }, [sources]);

  const loadNeighbors = useCallback(async (initial = false) => {
    if (inFlightRef.current.neighbors) return inFlightRef.current.neighbors;
    const request = ++requestRef.current.neighbors;
    setNeighborBusy(true);
    setNeighborError(null);
    const task = (async () => { try {
      const refreshed = initial ? await sources.getDevices() : await sources.refreshDevices();
      // An empty successful refresh is authoritative; never replace it with stale cache.
      const result = refreshed.slice(0, MAX_INVENTORY_ROWS);
      if (mountedRef.current && request === requestRef.current.neighbors) { setDevices(result); setNeighborLoaded(true); }
    } catch (error) {
      if (mountedRef.current && request === requestRef.current.neighbors) setNeighborError(error instanceof Error ? error.message : 'Unable to refresh local neighbors.');
    } finally {
      if (mountedRef.current && request === requestRef.current.neighbors) setNeighborBusy(false);
      inFlightRef.current.neighbors = undefined;
    } })();
    inFlightRef.current.neighbors = task;
    return task;
  }, [sources]);

  const loadKernelSnapshot = useCallback(async (refresh = false) => {
    if (kernelBusyRef.current) return;
    kernelBusyRef.current = true;
    if (refresh) setKernel((previous) => previous ? { ...previous, stale: true } : previous);
    setKernelBusy(true);
    setKernelError(null);
    try {
      const result = await kernelSnapshot(refresh);
      if (mountedRef.current) setKernel(result);
    } catch (error) {
      if (mountedRef.current) setKernelError(error instanceof Error ? error.message : 'Unable to load the native kernel snapshot.');
    } finally {
      if (mountedRef.current) setKernelBusy(false);
      kernelBusyRef.current = false;
    }
  }, [kernelSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    if (inventoryAvailable) {
      void loadInterfaces();
      void loadNeighbors(true);
      void loadKernelSnapshot();
    }
    const onVisible = () => {
      if (!document.hidden) {
        void loadInterfaces();
        void loadNeighbors(false);
        void loadKernelSnapshot(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { mountedRef.current = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [inventoryAvailable, loadInterfaces, loadNeighbors, loadKernelSnapshot]);

  useEffect(() => {
    if (!inventoryAvailable || !activeDiscoveryStarted || activeDiscoveryPaused) return;
    const activeTimer = window.setInterval(() => { void runActiveDiscovery(); }, 30_000);
    return () => window.clearInterval(activeTimer);
  }, [activeDiscoveryPaused, activeDiscoveryStarted, inventoryAvailable, runActiveDiscovery]);

  const formatSeen = (value: number) => Number.isFinite(value) && value >= 0 && value <= 8640000000000000 ? new Date(value).toISOString() : 'Unavailable';

  return (
    <main aria-labelledby="watchtower-title" className="enterprise-page enterprise-watchtower-page min-h-full bg-[#090a0b] p-3 text-zinc-300 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-4">
           <header className="enterprise-tool-header relative overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0f10] px-4 py-4 sm:px-5">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border border-zinc-800/70" />
          <div className="pointer-events-none absolute -right-2 -top-8 h-24 w-24 rounded-full border border-zinc-800/50" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-zinc-500">
              <Eye aria-hidden="true" size={16} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">Local observation</span>
            </div>
             <h1 id="watchtower-title" className="text-2xl font-semibold tracking-tight text-zinc-100">Watchtower</h1>
             <p className="mt-1 text-xs text-zinc-500">A deliberate local evidence board: loaded signals, explicit inventory, and bounded discovery.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-700 bg-[#111315] px-3 py-1.5 text-[11px] font-medium text-zinc-400">
             <Radio aria-hidden="true" size={13} /> Live + snapshot
          </span>
         </div>
        </header>
          <ReadinessPanel />

          <section aria-labelledby="watchtower-live-discovery" className="rounded-xl border border-zinc-700 bg-[#0d0f10] p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
             <div><h2 id="watchtower-live-discovery" className="text-sm font-semibold text-zinc-200">Live local discovery</h2><p className="mt-1 text-[11px] text-zinc-500">Run bounded ICMP discovery of the detected local subnet on demand. After the first refresh, it repeats every 30 seconds until paused.</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void runActiveDiscovery()} disabled={!inventoryAvailable || activeDiscoveryBusy || activeDiscoveryPaused} className="rounded-lg border border-zinc-600 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-50">{activeDiscoveryBusy ? 'Discovering…' : 'Refresh now'}</button><button type="button" onClick={() => setActiveDiscoveryPaused(value => !value)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-zinc-500">{activeDiscoveryPaused ? 'Resume discovery' : 'Pause discovery'}</button></div>
            </div>
             {activeDiscovery ? <><div className="mt-3 grid gap-2 sm:grid-cols-5"><Metric label="Subnet" value={activeDiscovery.cidr || 'Unavailable'} detail={activeDiscovery.interface || 'No interface'} /><Metric label="Gateway" value={activeDiscovery.gateway || 'Unknown'} detail="Default route evidence" /><Metric label="Known devices" value={activeDiscovery.devices.length} detail="Retained across refreshes" /><Metric label="Present now" value={activeDiscovery.devices.filter(device => device.present).length} detail="Seen in latest sweep" /><Metric label="State" value={activeDiscoveryBusy ? 'RUNNING' : activeDiscoveryPaused ? 'PAUSED' : 'READY'} detail={activeDiscovery.devices[0]?.last_seen ? `Last result ${new Date(activeDiscovery.devices[0].last_seen).toLocaleTimeString()}` : 'No replies recorded'} /></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><caption className="sr-only">Actively discovered local devices</caption><thead className="text-zinc-500"><tr>{['IP', 'MAC', 'Role', 'Presence', 'State', 'Evidence', 'Last seen', 'Action'].map(heading => <th key={heading} className="px-2 pb-2 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800">{activeDiscovery.devices.map(device => <tr key={device.ip} className={`text-zinc-300 ${device.present ? '' : 'opacity-60'}`}><td className="px-2 py-2 font-mono">{device.ip}</td><td className="px-2 py-2 font-mono">{device.mac || 'Unavailable'}</td><td className="px-2 py-2">{device.gateway ? 'Gateway' : device.ip === activeDiscovery.local_ip ? 'This host' : 'Local device'}</td><td className="px-2 py-2">{device.present ? 'Present' : 'Historical'}</td><td className="px-2 py-2">{device.state}</td><td className="px-2 py-2">{device.method}</td><td className="px-2 py-2">{new Date(device.last_seen).toLocaleTimeString()} · {device.seen_count} sweep{device.seen_count === 1 ? '' : 's'}</td><td className="px-2 py-2"><button type="button" disabled={!onOpenScan} onClick={() => onOpenScan?.(device.ip)} className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:border-zinc-500 disabled:opacity-50">Scan Buddy</button></td></tr>)}</tbody></table>{activeDiscovery.devices.length === 0 && <p role="status" className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">No devices were observed yet. Hosts that block ICMP and do not answer ARP may still be connected.</p>}</div>{activeDiscovery.warnings.map(warning => <p key={warning} className="mt-3 text-[11px] text-amber-300">{warning}</p>)}</> : <p role="status" className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">Waiting for the first local discovery sweep.</p>}
          </section>

         {activeDiscovery && <section aria-label="Watchtower actions and downloads" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-500">Observed-device actions:</span><button type="button" disabled={!onOpenScan || !activeDiscovery.devices.some(device => device.present)} onClick={() => { const device = activeDiscovery.devices.find(item => item.present); if (device) onOpenScan?.(device.ip); }} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50">Scan Buddy</button><button type="button" disabled={!onOpenCapture || !activeDiscovery.interface} onClick={() => onOpenCapture?.({ interfaceName: activeDiscovery.interface, provenance: 'watchtower-active-discovery' })} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 disabled:opacity-50">Capture Buddy</button><span className="ml-2 text-xs text-zinc-500">Download Watchtower report:</span>{(['json', 'csv', 'md', 'txt'] as WatchtowerExport[]).map(format => <button key={format} type="button" onClick={() => downloadReport(format)} className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-500">{format.toUpperCase()}</button>)}</div></section>}
         <section aria-labelledby="watchtower-metrics" className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
             <h2 id="watchtower-metrics" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Source visibility</h2>
             <span className="text-[11px] text-zinc-600">{populatedSources}/6 sources with records</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
             <Metric label="Sources with records" value={`${populatedSources}/6`} detail="Records are not detection, ATT&CK, or network coverage." />
            <Metric label="Interfaces" value={adapters.length} detail={interfaceLoaded ? `${adapters.length} records loaded` : interfaceError ? 'Not loaded / unavailable' : 'Not loaded'} />
            <Metric label="Neighbors" value={devices.length} detail={neighborLoaded ? `${devices.length} records loaded` : neighborError ? 'Not loaded / unavailable' : 'Not loaded'} />
            <Metric label="Active flows" value={flows.length} detail="Flow records in this snapshot" />
            <Metric label="Observed findings" value={events.length} detail="Detection findings in this snapshot" />
            <Metric label="Graph nodes" value={graph.nodes.length} detail="Nodes in the supplied graph" />
            <Metric label="Graph edges" value={graph.edges.length} detail="Edges in the supplied graph" />
           </div>
         </section>

          <section aria-labelledby="watchtower-graph" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4">
           <div className="flex items-center justify-between gap-2">
             <div>
               <h2 id="watchtower-graph" className="text-sm font-semibold text-zinc-200">Observed relationship graph</h2>
               <p className="mt-1 text-[11px] text-zinc-500">Relationships derived only from loaded flow and finding records.</p>
             </div>
             <span className="text-xs text-zinc-500">{graph.nodes.length} nodes · {graph.edges.length} edges</span>
           </div>
           <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!onOpenScan || !devices[0]?.ip} onClick={() => onOpenScan?.(devices[0]?.ip ?? '')} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">Scan first neighbor</button>
              <button type="button" disabled={!onOpenCapture || !adapters[0]?.name} onClick={() => onOpenCapture?.({ interface_name: adapters[0]?.name ?? '', provenance: 'observed-on-interface' })} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">Capture interface</button>
           </div>
           {adapters[0]?.ipv4_addresses[0] && devices[0]?.ip && (
             <p className="mt-3 rounded-lg border border-zinc-800 bg-[#111315] px-3 py-2 text-xs text-zinc-400">
               Observed local relationship: <span className="text-zinc-200">{adapters[0].ipv4_addresses[0]} → {devices[0].ip}</span>
             </p>
           )}
         </section>

         <section aria-labelledby="watchtower-provenance" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4">
           <div className="flex items-start justify-between gap-3">
             <div>
               <h2 id="watchtower-provenance" className="text-sm font-semibold text-zinc-200">Visibility and provenance</h2>
               <p className="mt-1 text-[11px] text-zinc-500">Each source describes what the host can actually observe; none is a controller inventory.</p>
             </div>
             <button type="button" onClick={() => void loadKernelSnapshot(true)} disabled={!inventoryAvailable || kernelBusy} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50">{kernelBusy ? 'Reading kernel…' : 'Refresh kernel snapshot'}</button>
           </div>
           {kernelError && <p role="alert" className="mt-3 rounded border border-red-900/70 px-3 py-2 text-xs text-red-300">{kernelError}</p>}
           <div className="mt-3 grid gap-2 md:grid-cols-3">
             <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3"><strong className="text-xs text-zinc-200">Host-local</strong><p className="mt-1 text-[11px] text-zinc-500">Interfaces, routes, and IPv4/IPv6 kernel neighbors on this host.</p><p className="mt-2 text-xs text-zinc-300">{kernel ? `${kernel.interfaces.length} interfaces · ${kernel.neighbors.length} neighbors` : 'Not loaded'}</p></div>
             <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3"><strong className="text-xs text-zinc-200">Observed-on-interface</strong><p className="mt-1 text-[11px] text-zinc-500">Loaded flows/findings or packets from an explicitly selected capture interface.</p><p className="mt-2 text-xs text-zinc-300">{flows.length + events.length} loaded records</p></div>
             <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3"><strong className="text-xs text-zinc-200">Authoritative controller</strong><p className="mt-1 text-[11px] text-zinc-500">No AP/controller credentials or telemetry are connected in this view.</p><p className="mt-2 text-xs text-amber-300">Unavailable · no client count claimed</p></div>
           </div>
           <div className="mt-3 rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs text-zinc-400"><span className="text-zinc-600">Kernel snapshot:</span> {kernel ? `${kernel.captured_at} · gateway ${kernel.default_gateway ?? 'unknown'} · ${kernel.stale ? 'stale' : 'current read'}${kernel.warnings.length ? ` · ${kernel.warnings.join(' ')}` : ''}` : 'Gateway unavailable from the native route table in this view.'}</div>
         </section>

         {kernel && <section aria-labelledby="watchtower-kernel-neighbors" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4">
           <div className="flex items-center justify-between gap-2"><div><h2 id="watchtower-kernel-neighbors" className="text-sm font-semibold text-zinc-200">Kernel neighbor evidence</h2><p className="mt-1 text-[11px] text-zinc-500">Read-only IPv4/IPv6 neighbor table; this is bounded local evidence, not a complete LAN/AP client list.</p></div><span className="text-xs text-zinc-500">{kernel.neighbors.length} records</span></div>
           {kernel.neighbors.length === 0 ? <p role="status" className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">No kernel neighbors are currently recorded.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><caption className="sr-only">Kernel neighbor evidence</caption><thead className="text-zinc-500"><tr>{['Interface', 'Address', 'Link address', 'Kernel state'].map((heading) => <th key={heading} scope="col" className="px-2 pb-2 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800">{kernel.neighbors.map((neighbor) => <tr key={`${neighbor.interface}-${neighbor.address}`} className="text-zinc-300"><td className="px-2 py-2">{neighbor.interface}</td><td className="px-2 py-2">{neighbor.address}</td><td className="px-2 py-2">{neighbor.mac_address || 'Unavailable'}</td><td className="px-2 py-2">{neighbor.state}</td></tr>)}</tbody></table></div>}
         </section>}

         <section aria-labelledby="watchtower-signals" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
            <Activity aria-hidden="true" size={16} className="text-zinc-400" />
            <h2 id="watchtower-signals" className="text-sm font-semibold text-zinc-200">Recent signals</h2>
            </div>
            <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Latest 5</span>
          </div>
          {recentSignals.length === 0 ? (
            <p role="status" className="rounded-md border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
              No findings are currently loaded.
            </p>
          ) : (
            <ol className="space-y-2" aria-label="Recent detection findings">
              {recentSignals.map((event) => (
                <li key={event.finding_id} className="flex flex-col gap-1 rounded-lg border border-zinc-800/80 bg-[#111315] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">{event.title || event.category || 'Untitled finding'}</p>
                    <p className="truncate text-xs text-zinc-500">{event.source_ip} → {event.destination_ip} · {event.protocol}</p>
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs text-zinc-500">
                    <span>{event.severity || 'Unrated'}</span>
                    <time dateTime={Number.isFinite(event.timestamp) ? new Date(event.timestamp).toISOString() : undefined}>{signalTime(event.timestamp)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="watchtower-inventory" className="space-y-3">
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div>
              <div className="flex items-center gap-2">
                <Server aria-hidden="true" size={15} className="text-zinc-400" />
                <h2 id="watchtower-inventory" className="text-sm font-semibold text-zinc-200">Local network inventory</h2>
              </div>
                <p className="mt-1 text-[11px] text-zinc-500">Passive host inventory plus the latest bounded active local discovery. Native inventory is unavailable in browser mode.</p>
            </div>
            <div className="flex flex-wrap gap-2">
               <button type="button" onClick={() => void loadInterfaces()} disabled={!inventoryAvailable || interfaceBusy} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-[#111315] px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">
                 <Network aria-hidden="true" size={14} /> {!inventoryAvailable ? 'Interfaces unavailable in browser' : interfaceBusy ? 'Loading interfaces…' : 'Load local interfaces'}
              </button>
               <button type="button" onClick={() => void loadNeighbors()} disabled={!inventoryAvailable || neighborBusy} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-[#111315] px-3 py-2 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60">
                 <RefreshCw aria-hidden="true" size={14} /> {!inventoryAvailable ? 'Neighbors unavailable in browser' : neighborBusy ? 'Refreshing neighbors…' : 'Refresh local neighbors'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section aria-labelledby="watchtower-interfaces" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 id="watchtower-interfaces" className="text-sm font-semibold text-zinc-200">Host interfaces</h3>
                <Wifi aria-hidden="true" size={15} className="text-zinc-500" />
              </div>
              <p className="mt-1 text-[11px] text-zinc-600">Native adapter data · addresses and link state as returned</p>
              {interfaceError && <p role="alert" className="mt-3 rounded border border-red-900/70 px-3 py-2 text-xs text-red-300">{interfaceError}</p>}
              {adapters.length === 0 ? <p role="status" className="mt-4 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">{interfaceBusy ? 'Loading local interface inventory…' : interfaceError ? 'Interface inventory unavailable.' : 'No interface inventory available.'}</p> : <div className="mt-3 space-y-2">{adapters.map((adapter) => <article key={`${adapter.name}-${adapter.mac_address}`} className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
                <div className="flex justify-between gap-2"><strong className="text-zinc-200">{adapter.friendly_name || adapter.name}</strong><span className={adapter.oper_status.toLowerCase() === 'up' ? 'text-emerald-400' : 'text-zinc-500'}>{adapter.oper_status || 'Link status unavailable'}</span></div>
                 <dl className="mt-2 grid gap-1 text-zinc-400 sm:grid-cols-2"><div><dt className="inline text-zinc-600">Interface: </dt><dd className="inline">{adapter.name}</dd></div><div><dt className="inline text-zinc-600">MAC: </dt><dd className="inline">{adapter.mac_address || 'Unavailable'}</dd></div><div><dt className="inline text-zinc-600">IPv4: </dt><dd className="inline break-words">{adapter.ipv4_addresses.join(', ') || 'None reported'}</dd></div><div><dt className="inline text-zinc-600">IPv6: </dt><dd className="inline break-words">{adapter.ipv6_addresses.join(', ') || 'None reported'}</dd></div></dl>
              </article>)}</div>}
            </section>

            <section aria-labelledby="watchtower-neighbors" className="rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 id="watchtower-neighbors" className="text-sm font-semibold text-zinc-200">Same-network neighbors</h3>
                <Network aria-hidden="true" size={15} className="text-zinc-500" />
              </div>
              <p className="mt-1 text-[11px] text-zinc-600">Local ARP/discovery evidence · not a complete inventory</p>
              {neighborError && <p role="alert" className="mt-3 rounded border border-red-900/70 px-3 py-2 text-xs text-red-300">{neighborError}</p>}
              {devices.length === 0 ? <p role="status" className="mt-4 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500">{neighborBusy ? 'Loading existing local neighbor inventory…' : neighborError ? 'Neighbor inventory unavailable.' : 'No neighbor records available.'}</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><caption className="sr-only">Local neighbor records</caption><thead className="text-zinc-500"><tr>{['IP', 'MAC', 'Hostname', 'Vendor', 'Active', 'First seen', 'Last seen'].map((heading) => <th key={heading} scope="col" className="px-2 pb-2 font-medium">{heading}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800">{devices.map((device) => <tr key={`${device.ip}-${device.mac}`} className="text-zinc-300"><td className="px-2 py-2">{device.ip}</td><td className="px-2 py-2">{device.mac || 'Unavailable'}</td><td className="px-2 py-2">{device.hostname || 'Unavailable'}</td><td className="px-2 py-2">{device.vendor || 'Unavailable'}</td><td className="px-2 py-2">{device.active ? 'Yes' : 'No'}</td><td className="px-2 py-2">{formatSeen(device.first_seen)}</td><td className="px-2 py-2">{formatSeen(device.last_seen)}</td></tr>)}</tbody></table></div>}
            </section>
          </div>
          <aside className="rounded-xl border border-zinc-800 bg-[#111315] px-3.5 py-3 text-[11px] text-zinc-500"><strong className="font-medium text-zinc-300">Inventory limits</strong><span className="mx-2 text-zinc-700">/</span>No CIDR, hostname, vendor, or device details are inferred. Full port/service information requires an explicit authorized Scan Buddy job and remains unverified.</aside>
        </section>

        <aside aria-label="Watchtower boundary" className="flex gap-3 rounded-xl border border-zinc-800 bg-[#111315] p-3.5 text-xs text-zinc-500">
          <Network aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-zinc-400" />
             <p><strong className="font-medium text-zinc-300">Observation boundary</strong><span className="mx-2 text-zinc-700">/</span>Only data currently loaded by NET0ZE is shown. Active discovery is bounded to the detected local subnet and records ICMP/ARP evidence; kernel neighbors are host-local evidence; flows are observed records. No AP client count, controller inventory, or vulnerability verdict is claimed here.</p>
        </aside>
      </div>
    </main>
  );
}

export default Watchtower;
