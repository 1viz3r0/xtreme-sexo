import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Server, RefreshCw, Cpu, ShieldCheck, Network, Wifi, Users } from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { getDetailedSystemInfo } from '../services/tauri/system';
import type { DetailedSystemInfo } from '../services/tauri/system';
import { getDetailedNetworkInterfaces, getActiveTcpConnections } from '../services/tauri/network';
import type { DetailedAdapterInfo, TcpConnectionEntry } from '../services/tauri/network';
import { getWindowsEvents } from '../services/tauri/events';
import type { WindowsEventEntry } from '../services/tauri/events';
import { getDevices, type DeviceEntry } from '../services/tauri/intel';
import { sNo } from '../lib/format';
import { LiveSources } from './LiveSources';
import { ReadinessPanel } from './ReadinessPanel';
import { PassiveInterfaceSpeed } from './PassiveInterfaceSpeed';
import { RuntimeLogs } from './RuntimeLogs';
import { HostReport } from './HostReport';
import { emptySpeedSnapshot, failInterfaceSpeed, measureInterfaceSpeed, speedStaleAfter } from '../lib/passiveInterfaceSpeed';

interface SystemLogsProps {
  refreshMs?: number;
}

export const SystemLogs: React.FC<SystemLogsProps> = ({ refreshMs = 3000 }) => {
  const [sysInfo, setSysInfo] = useState<DetailedSystemInfo | null>(null);
  const [adapters, setAdapters] = useState<DetailedAdapterInfo[]>([]);
  const [tcpConns, setTcpConns] = useState<TcpConnectionEntry[]>([]);
  const [winEvents, setWinEvents] = useState<WindowsEventEntry[]>([]);
  const [devices, setDevices] = useState<DeviceEntry[]>([]);
  const [speedSnapshot, setSpeedSnapshot] = useState(emptySpeedSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);

  const isDesktop = isTauriEnvironment();
  const pollingMs = Number.isFinite(refreshMs) ? Math.max(1000, refreshMs) : 3000;

  const loadRealTelemetry = useCallback(async () => {
    if (!isDesktop || document.hidden || busy.current) return;
    busy.current = true;
    const requestGeneration = generation.current;
    try {
      const results = await Promise.allSettled([
        getDetailedSystemInfo(),
        getDetailedNetworkInterfaces().then(value => {
          if (generation.current === requestGeneration) {
            setAdapters(value);
            const time = performance.now();
            const timestamp = new Date().toISOString();
            setSpeedSnapshot(previous => measureInterfaceSpeed(previous, value, time, timestamp, speedStaleAfter(pollingMs)));
          }
          return value;
        }, error => {
          if (generation.current === requestGeneration) setSpeedSnapshot(failInterfaceSpeed);
          throw error;
        }),
        getActiveTcpConnections(),
        getWindowsEvents(20),
        getDevices(),
      ]);
      if (generation.current !== requestGeneration) return;
      const [sys, , tcp, ev, inventory] = results;
      if (sys.status === 'fulfilled') setSysInfo(sys.value);
      if (tcp.status === 'fulfilled') setTcpConns(tcp.value);
      if (ev.status === 'fulfilled') setWinEvents(ev.value);
      if (inventory.status === 'fulfilled') setDevices(inventory.value);
      const failures = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason));
      setError(failures.length ? failures.join(' · ') : null);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e: any) {
      if (generation.current === requestGeneration) setError(e?.message || 'Failed to load native host telemetry');
    } finally {
      // Keep one shared gate across teardown/restart until native calls settle.
      busy.current = false;
    }
  }, [isDesktop, pollingMs]);

  useEffect(() => {
    loadRealTelemetry();
    const intervalId = setInterval(loadRealTelemetry, pollingMs);
    const onVisible = () => { if (!document.hidden) void loadRealTelemetry(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      generation.current += 1;
    };
  }, [pollingMs, loadRealTelemetry]);

  const usableAddress = (adapter: DetailedAdapterInfo) => [...adapter.ipv4_addresses, ...adapter.ipv6_addresses]
    .find((address) => address !== '::1' && !address.startsWith('127.') && address !== '0.0.0.0');
  // Native inventory has no default-route flag: this is not a verified default route.
  const primaryAdapter = adapters.find((adapter) => usableAddress(adapter) && adapter.oper_status.toLowerCase() === 'up')
    ?? adapters.find((adapter) => usableAddress(adapter));
  const primaryIp = primaryAdapter ? usableAddress(primaryAdapter) : undefined;
  const primaryMac = primaryAdapter?.mac_address;
  const connectedDevices = devices.filter((device) => device.active);

  return (
    <div className="space-y-7 rounded-2xl bg-[#070707] p-5 font-sans text-sm text-zinc-300 [&_.cyber-card]:!border-zinc-800 [&_.cyber-card]:!bg-[#111] [&_.cyber-card]:!shadow-none [&_.cyber-table_th]:!border-zinc-800 [&_.cyber-table_th]:!bg-zinc-900 [&_.cyber-table_td]:!border-zinc-800">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-5">
        <div><div className="mb-2 flex items-center gap-3"><Activity className="h-5 w-5 text-white" /><h2 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h2></div><p className="text-zinc-500">A calm view of this host, its link, and the evidence available locally.</p></div>
        <button type="button" onClick={loadRealTelemetry} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 hover:border-zinc-400"><RefreshCw className="h-3.5 w-3.5" /> Refresh host</button>
      </header>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-zinc-800 bg-[#0d0d0d] px-4 py-3 text-xs text-zinc-400" role="status"><span className="font-medium text-zinc-200">{isDesktop ? 'DESKTOP LINKED' : 'DESKTOP TELEMETRY UNAVAILABLE'}</span><span>{isDesktop ? `Auto-refresh ${pollingMs / 1000}s` : 'Open the desktop application to view local activity.'}</span>{isDesktop && <span>{adapters.length} interfaces observed</span>}<span>{updatedAt ? `Last refresh ${updatedAt}` : isDesktop ? 'Connecting…' : 'No native read yet'}</span></div>
      {error && <div role="alert" className="rounded-lg border border-red-900/70 bg-red-950/30 p-3 text-xs text-red-300">{error}</div>}

      <section aria-label="Host overview" className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-[#111] p-5"><div className="text-xs uppercase tracking-widest text-zinc-500">Host identity</div><div className="mt-3 truncate text-lg font-semibold text-white">{sysInfo?.hostname || 'Awaiting native host'}</div><div className="mt-1 truncate text-zinc-400">{sysInfo?.user_name || (isDesktop ? 'User unavailable' : 'Desktop app required')}</div></div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-[#111] p-5"><div className="text-xs uppercase tracking-widest text-zinc-500">Platform</div><div className="mt-3 truncate text-lg font-semibold text-white">{sysInfo ? `${sysInfo.os_name} ${sysInfo.os_version}` : 'Not observed'}</div><div className="mt-1 text-zinc-400">{sysInfo?.architecture || 'Architecture unavailable'}</div></div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-[#111] p-5"><div className="text-xs uppercase tracking-widest text-zinc-500">Privilege</div><div className={`mt-3 text-lg font-semibold ${sysInfo?.is_admin ? 'text-emerald-400' : 'text-amber-300'}`}>{sysInfo ? (sysInfo.is_admin ? 'Elevated' : 'Standard user') : 'Unknown'}</div><div className="mt-1 text-zinc-400">Native permission state</div></div>
        <div className="min-w-0 rounded-xl border border-zinc-800 bg-[#111] p-5"><div className="text-xs uppercase tracking-widest text-zinc-500">Observed resources</div><div className="mt-3 text-lg font-semibold text-white">{adapters.length} interfaces · {tcpConns.length} sockets</div><div className="mt-1 text-zinc-400">Counts from latest native reads</div></div>
      </div>

        <section aria-label="Network identity" className="rounded-xl border border-zinc-700 bg-[#101010] p-5"><div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4"><div className="flex items-center gap-3"><Network className="h-5 w-5 text-zinc-200" /><h3 className="text-lg font-semibold text-white">Network identity</h3></div><span className="text-xs uppercase tracking-widest text-zinc-500">Passive native evidence</span></div><div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]"><div className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><div><div className="text-xs uppercase tracking-widest text-zinc-500">Local IP</div><div className="mt-2 break-all text-xl font-semibold text-emerald-300">{primaryIp || 'Not reported'}</div></div><div><div className="text-xs uppercase tracking-widest text-zinc-500">MAC address</div><div className="mt-2 break-all text-lg font-semibold text-zinc-100">{primaryMac || 'Not reported'}</div></div><div><div className="text-xs uppercase tracking-widest text-zinc-500">Interface</div><div className="mt-2 truncate text-lg font-semibold text-zinc-100">{primaryAdapter?.friendly_name || primaryAdapter?.name || 'Not reported'}</div></div><div><div className="text-xs uppercase tracking-widest text-zinc-500">Link state</div><div className="mt-2 flex items-center gap-2 text-lg font-semibold text-zinc-100"><Wifi className="h-4 w-4" />{primaryAdapter?.oper_status || 'Not reported'}</div></div></div><div className="rounded-lg border border-zinc-800 bg-[#090909] p-5"><div className="flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500"><Users className="h-4 w-4" />Connected devices</div><div className="mt-3 text-4xl font-semibold tabular-nums text-amber-200">{connectedDevices.length}</div><div className="mt-2 text-xs leading-5 text-zinc-500">Active records from local device inventory.</div></div></div><p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-500">Source: getDetailedNetworkInterfaces + getDevices (stored local ARP/discovery evidence). Active records are not a complete live network census. Empty inventory can also mean the source is unavailable. No scans or uploads are started here.</p></section>

        <section aria-label="System resources" className="rounded-xl border border-zinc-800 bg-[#111] p-5"><div className="mb-4 flex items-center gap-3 border-b border-zinc-800 pb-4"><Cpu className="h-5 w-5 text-zinc-300" /><h3 className="text-lg font-semibold text-white">System resources</h3></div>{sysInfo ? <div className="grid gap-5 sm:grid-cols-2"><div><div className="text-xs uppercase tracking-widest text-zinc-500">CPU</div><div className="mt-2 truncate text-base font-semibold text-zinc-100" title={sysInfo.cpu_model}>{sysInfo.cpu_model}</div><div className="mt-1 text-zinc-400">{sysInfo.cpu_core_count} cores</div></div><div><div className="text-xs uppercase tracking-widest text-zinc-500">Memory</div><div className="mt-2 text-base font-semibold text-emerald-400">{sysInfo.ram_usage_percent.toFixed(1)}% used</div><div className="mt-1 text-zinc-400">{(sysInfo.ram_available_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB free / {(sysInfo.ram_total_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB total</div></div></div> : <p className="text-zinc-400">{isDesktop ? 'Host information not yet available.' : 'Host information requires the desktop application.'}</p>}</section>
      </section>

      <section aria-label="Logs & diagnostics" className="space-y-4 border-t border-zinc-800 pt-7"><div><h3 className="text-xl font-semibold text-white">Logs &amp; diagnostics</h3><p className="mt-1 text-zinc-500">Open a record only when you need the detail behind the dashboard.</p></div><div className="grid gap-4 xl:grid-cols-2"><details open className="rounded-xl border border-zinc-800 bg-[#111] p-5"><summary className="cursor-pointer text-base font-semibold text-zinc-100">Readiness &amp; live sources</summary><div className="mt-4 grid gap-4"><ReadinessPanel /><LiveSources /></div></details><details className="rounded-xl border border-zinc-800 bg-[#111] p-5"><summary className="cursor-pointer text-base font-semibold text-zinc-100">Throughput</summary><div className="mt-4"><PassiveInterfaceSpeed snapshot={speedSnapshot} desktop={isDesktop} refreshMs={pollingMs} /></div></details></div><details className="rounded-xl border border-zinc-800 bg-[#111] p-5"><summary className="cursor-pointer text-base font-semibold text-zinc-100">Runtime logs &amp; host report</summary><div className="mt-4 space-y-4"><RuntimeLogs /><HostReport /></div></details>
         <details className="rounded-xl border border-zinc-800 bg-[#111] p-5"><summary className="cursor-pointer text-base font-semibold text-zinc-100">TCP connections <span className="ml-2 text-xs font-normal text-zinc-500">{tcpConns.length} sockets</span></summary><div className="mt-4 space-y-3">
         <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-zinc-300" />
          <h3 className="font-bold text-white text-xs">Active TCP Connections</h3>
          </div>
           <span className="text-xs text-zinc-400">
            Total Sockets: <strong className="text-white">{tcpConns.length}</strong>
          </span>
        </div>

        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Local Address</th>
                <th>Remote Address</th>
                <th>TCP State</th>
                <th>PID</th>
                <th>Process Name</th>
              </tr>
            </thead>
            <tbody>
              {tcpConns.map((s, i) => (
                <tr key={i}>
                  <td className="text-slate-500">{sNo(i)}</td>
                  <td className="text-emerald-300 font-bold">{s.local_ip}:{s.local_port}</td>
                  <td className="text-slate-200">{s.remote_ip}:{s.remote_port}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.tcp_state === 'ESTABLISHED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : s.tcp_state === 'LISTEN'
                         ? 'bg-zinc-800 text-zinc-200 border border-zinc-600'
                         : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                    }`}>
                      {s.tcp_state}
                    </span>
                  </td>
                   <td className="text-slate-400">{s.pid}</td>
                  <td className="text-white font-semibold">{s.process_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
         </div>
         </details>

         <details className="rounded-xl border border-zinc-800 bg-[#111] p-5"><summary className="cursor-pointer text-base font-semibold text-zinc-100">Native events</summary><div className="mt-4 space-y-3">
         <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-zinc-300" />
            <h3 className="font-bold text-white text-xs">Native Host Event Logs</h3>
          </div>
           <span className="text-xs text-zinc-400">Source: {sysInfo?.os_name || 'Host'}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left cyber-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp</th>
                <th>Provider</th>
                <th>ID</th>
                <th>Level</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {winEvents.length === 0 ? (
                <tr><td colSpan={6} className="py-5 text-center text-slate-500">No native event records available on this host.</td></tr>
              ) : winEvents.map((ev, i) => (
                <tr key={i}>
                  <td className="text-slate-500">{sNo(i)}</td>
                   <td className="text-slate-400 text-xs">{ev.timestamp.slice(0, 19)}</td>
                   <td className="text-zinc-200 font-semibold">{ev.provider}</td>
                   <td className="text-slate-300">{ev.event_id}</td>
                  <td>
                    <span className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.2 rounded text-[10px] font-bold">
                      {ev.level}
                    </span>
                  </td>
                  <td className="text-slate-200 font-sans text-xs">{ev.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
         </div>
         </details>
       </section>
    </div>
  );
};
