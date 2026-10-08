import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import type { ConnectivityStatus, ThreatIntelStatus } from '../services/tauri/intel';

/** External refreshes are independent: an unavailable feed cannot hide host data. */
export function LiveSources() {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const update = async (key: string, action: () => Promise<string>) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const text = await action();
      setStatus((old) => ({ ...old, [key]: `${text} · ${new Date().toLocaleTimeString()}` }));
    } catch (error) {
      setStatus((old) => ({ ...old, [key]: `Unavailable: ${String(error)}` }));
    } finally { inFlight.current.delete(key); }
  };
  useEffect(() => {
    if (!enabled || !isTauriEnvironment()) return;
    const connectivity = () => update('Connectivity', async () => {
      const result = await invoke<ConnectivityStatus>('check_connectivity');
      return `${result.state}${result.latency_ms !== null ? ` · ${result.latency_ms} ms` : ''}`;
    });
    const publicIp = () => update('Public IP', () => invoke<string>('refresh_public_ip'));
    const feeds = () => update('Threat feeds', async () => {
      const result = await invoke<ThreatIntelStatus>('refresh_threat_intel');
      return `${result.feed_state} · ${result.ioc_count} indicators · ${result.sources.join(', ')}`;
    });
    void connectivity(); void publicIp(); void feeds();
    const timers = [setInterval(connectivity, 60_000), setInterval(publicIp, 600_000), setInterval(feeds, 3_600_000)];
    return () => timers.forEach(clearInterval);
  }, [enabled]);
  return <section className="cyber-card p-4 space-y-3">
    <div className="flex items-center justify-between gap-4">
      <h3 className="font-bold text-white">Live data sources</h3>
      <button disabled={!isTauriEnvironment()} onClick={() => setEnabled(!enabled)} className="rounded border border-slate-600 px-3 py-1.5 text-slate-200 disabled:opacity-40">{enabled ? 'Pause API refresh' : 'Enable API refresh'}</button>
    </div>
    <p className="text-slate-400">Connectivity 1m · Public IP 10m · Threat feeds 1h</p>
    {Object.entries(status).map(([source, value]) => <div key={source} className="flex flex-wrap justify-between gap-2 border-t border-slate-800 pt-2"><span>{source}</span><span className="text-slate-400 break-all">{value}</span></div>)}
  </section>;
}
