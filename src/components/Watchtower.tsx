import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, Eye, Network, Radio, RefreshCw, Server, Wifi } from 'lucide-react';
import type { FlowRecord } from '../services/tauri/flows';
import type { DetectionFinding } from '../services/tauri/detections';
import type { AttackGraph } from '../services/tauri/graph';
import { localInventorySources, type LocalInventorySources } from '../services/tauri/localInventory';
import type { DetailedAdapterInfo } from '../services/tauri/network';
import type { DeviceEntry } from '../services/tauri/intel';
import { isTauriEnvironment } from '../services/tauri/isTauri';

export interface WatchtowerProps {
  flows: FlowRecord[];
  events: DetectionFinding[];
  graph: AttackGraph;
  /** Injectable only to keep the explicit, local inventory actions testable. */
  inventorySources?: WatchtowerDataSources;
}

export type WatchtowerDataSources = LocalInventorySources;

const MAX_RECENT_SIGNALS = 5;
const MAX_INVENTORY_ROWS = 100;

const defaultInventorySources: WatchtowerDataSources = localInventorySources;

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
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-100">{value}</p>
      <p className="mt-1 text-[11px] text-zinc-500">{detail}</p>
    </div>
  );
}

/** A local snapshot view. Inventory reads are bounded, passive local reads only. */
export function Watchtower({ flows, events, graph, inventorySources }: WatchtowerProps) {
  const sources = inventorySources ?? defaultInventorySources;
  const inventoryAvailable = Boolean(inventorySources) || isTauriEnvironment();
  const [adapters, setAdapters] = useState<DetailedAdapterInfo[]>([]);
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [interfaceBusy, setInterfaceBusy] = useState(false);
  const [neighborBusy, setNeighborBusy] = useState(false);
  const [interfaceError, setInterfaceError] = useState<string | null>(null);
  const [neighborError, setNeighborError] = useState<string | null>(null);
  const [interfaceLoaded, setInterfaceLoaded] = useState(false);
  const [neighborLoaded, setNeighborLoaded] = useState(false);
  const mountedRef = useRef(true);
  const requestRef = useRef({ interfaces: 0, neighbors: 0 });
  const inFlightRef = useRef<{ interfaces?: Promise<void>; neighbors?: Promise<void> }>({});
  const populatedSources = [flows.length > 0, events.length > 0, graph.nodes.length > 0 || graph.edges.length > 0, adapters.length > 0, devices.length > 0].filter(Boolean).length;
  const recentSignals = [...events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECENT_SIGNALS);

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

  useEffect(() => {
    mountedRef.current = true;
    if (inventoryAvailable) {
      void loadInterfaces();
      void loadNeighbors(true);
    }
    const onVisible = () => {
      if (!document.hidden) {
        void loadInterfaces();
        void loadNeighbors(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { mountedRef.current = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [inventoryAvailable, loadInterfaces, loadNeighbors]);

  const formatSeen = (value: number) => Number.isFinite(value) && value >= 0 && value <= 8640000000000000 ? new Date(value).toISOString() : 'Unavailable';

  return (
    <main aria-labelledby="watchtower-title" className="min-h-full bg-[#090a0b] p-3 text-zinc-300 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="relative overflow-hidden rounded-xl border border-zinc-800 bg-[#0d0f10] px-4 py-4 sm:px-5">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border border-zinc-800/70" />
          <div className="pointer-events-none absolute -right-2 -top-8 h-24 w-24 rounded-full border border-zinc-800/50" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-zinc-500">
              <Eye aria-hidden="true" size={16} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">Local observation</span>
            </div>
            <h1 id="watchtower-title" className="text-2xl font-semibold tracking-tight text-zinc-100">Watchtower</h1>
            <p className="mt-1 text-xs text-zinc-500">A local snapshot of loaded signals and explicit inventory.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-700 bg-[#111315] px-3 py-1.5 text-[11px] font-medium text-zinc-400">
            <Radio aria-hidden="true" size={13} /> Snapshot only
          </span>
          </div>
        </header>

        <section aria-labelledby="watchtower-metrics" className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
             <h2 id="watchtower-metrics" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Source visibility</h2>
            <span className="text-[11px] text-zinc-600">{populatedSources}/5 sources with records</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
             <Metric label="Sources with records" value={`${populatedSources}/5`} detail="Records are not detection, ATT&CK, or network coverage." />
            <Metric label="Interfaces" value={adapters.length} detail={interfaceLoaded ? `${adapters.length} records loaded` : interfaceError ? 'Not loaded / unavailable' : 'Not loaded'} />
            <Metric label="Neighbors" value={devices.length} detail={neighborLoaded ? `${devices.length} records loaded` : neighborError ? 'Not loaded / unavailable' : 'Not loaded'} />
            <Metric label="Active flows" value={flows.length} detail="Flow records in this snapshot" />
            <Metric label="Observed findings" value={events.length} detail="Detection findings in this snapshot" />
            <Metric label="Graph nodes" value={graph.nodes.length} detail="Nodes in the supplied graph" />
            <Metric label="Graph edges" value={graph.edges.length} detail="Edges in the supplied graph" />
          </div>
        </section>

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
               <p className="mt-1 text-[11px] text-zinc-500">Passive local interfaces and existing neighbor records. Native inventory is unavailable in browser mode.</p>
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
          <p><strong className="font-medium text-zinc-300">Observation boundary</strong><span className="mx-2 text-zinc-700">/</span>Only data currently loaded by NET0ZE is shown. No scan or upload occurs here; this is not a threat verdict.</p>
        </aside>
      </div>
    </main>
  );
}

export default Watchtower;
