import React, { useEffect, useState } from 'react';
import { Download, Radio } from 'lucide-react';
import { interfaceSpeedCsv, speedStaleAfter, SPEED_HISTORY_LIMIT, SPEED_INTERFACE_LIMIT } from '../lib/passiveInterfaceSpeed';
import type { SpeedSnapshot } from '../lib/passiveInterfaceSpeed';

const statusText = {
  warmup: 'Warmup: waiting for a second valid counter reading.',
  live: 'Interval-average throughput measured from local interface byte counters.',
  reset: 'Counters reset: baseline renewed; this interval was skipped.',
  stale: 'Long or invalid sampling gap: baseline renewed; this interval was skipped.',
  invalid: 'Counter values are unsafe or invalid; this interval was skipped.',
  down: 'Interface is down; measurement will warm up when it returns.',
  missing: 'Interface disappeared; retained history only. Reappearance starts a new baseline.',
};

export function PassiveInterfaceSpeed({ snapshot, desktop, refreshMs }: { snapshot: SpeedSnapshot; desktop: boolean; refreshMs: number }) {
  const [selected, setSelected] = useState('');
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const item = snapshot.interfaces.find(i => i.id === selected) || snapshot.interfaces.find(i => i.status !== 'missing' && i.status !== 'down') || snapshot.interfaces[0];
  const stale = snapshot.lastSuccess !== null && Math.max(now, performance.now()) - snapshot.lastSuccess > speedStaleAfter(refreshMs);
  const live = desktop && !snapshot.error && !stale && item?.status === 'live';
  const latest = item?.history.at(-1);
  const history = item?.history || [];
  const max = Math.max(0.001, ...history.flatMap(s => [s.rxMbps, s.txMbps]));
  const point = (index: number, value: number) => `${10 + index * 580 / Math.max(1, history.length - 1)},${110 - value / max * 95}`;
  const segments: number[][] = [];
  history.forEach((s, index) => {
    if (!segments.length || s.gapBefore) segments.push([]);
    segments[segments.length - 1].push(index);
  });
  const exportSamples = () => {
    if (!item || !history.length) return;
    const url = URL.createObjectURL(new Blob([interfaceSpeedCsv(item)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `netoze-interface-throughput-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const message = !desktop ? 'Unavailable in browser mode: open the desktop application.' : snapshot.error ? 'Interface counter read failed. Waiting for a successful refresh; displayed history is retained.' : stale ? 'Stale: no recent interface counter reading. Current rates are unavailable.' : item ? statusText[item.status] : snapshot.lastSuccess === null ? 'Connecting: waiting for native interface counters.' : 'Unavailable: no non-loopback interfaces reported.';
  return <section className="cyber-card p-4 space-y-3" aria-label="Passive interface speed">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#142646] pb-2">
      <h3 className="flex items-center gap-2 font-bold text-white text-xs"><Radio className="w-4 h-4 text-amber-400" />Measured interface throughput</h3>
      <button onClick={exportSamples} disabled={!history.length} className="flex items-center gap-1 text-cyan-400 disabled:opacity-40 border border-cyan-500/40 rounded px-2 py-1"><Download className="w-3 h-3" />Export recent CSV</button>
    </div>
    <p className="text-slate-400">Passive RX/TX activity, not an Internet capacity speed test. No test traffic is sent. Virtual/VPN and physical interfaces may count the same traffic; interfaces are never summed.</p>
    <label className="flex items-center gap-2 text-slate-300">Interface
      <select aria-label="Throughput interface" value={item?.id || ''} onChange={e => setSelected(e.target.value)} disabled={!snapshot.interfaces.length} className="bg-[#050b18] border border-[#142646] rounded p-1 min-w-0 max-w-full">
        {!snapshot.interfaces.length && <option value="">No interface available</option>}
        {snapshot.interfaces.map(i => <option key={i.id} value={i.id}>{i.label} · {i.status}</option>)}
      </select>
    </label>
    <p role="status" className={live ? 'text-emerald-400' : 'text-amber-300'}>{message}</p>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div><div className="text-slate-400">RX (receive)</div><div className="text-emerald-400 font-bold">{live && latest ? `${latest.rxMbps.toFixed(3)} Mbps` : '—'}</div><div className="text-slate-300">{live && latest ? `${latest.rxKibps.toFixed(2)} KiB/s` : '—'}</div></div>
      <div><div className="text-slate-400">TX (transmit)</div><div className="text-cyan-400 font-bold">{live && latest ? `${latest.txMbps.toFixed(3)} Mbps` : '—'}</div><div className="text-slate-300">{live && latest ? `${latest.txKibps.toFixed(2)} KiB/s` : '—'}</div></div>
      <div><div className="text-slate-400">Session measured RX / TX</div><div className="text-white">{item ? `${item.sessionRx.toLocaleString()} / ${item.sessionTx.toLocaleString()} bytes` : '—'}</div></div>
      <div><div className="text-slate-400">Session peak RX / TX</div><div className="text-white">{item && history.length ? `${item.peakRxMbps.toFixed(3)} / ${item.peakTxMbps.toFixed(3)} Mbps` : '—'}</div></div>
    </div>
    {history.length ? <>
      <svg viewBox="0 0 600 125" className="w-full h-36 bg-[#050b18] rounded" role="img" aria-label={`Recent throughput: ${history.length} measured intervals. RX green, TX cyan. Scale 0 to ${max.toFixed(3)} Mbps.`}>
        <line x1="10" x2="590" y1="110" y2="110" stroke="#334155" />
        {segments.map((indices, segment) => <g key={segment}>
          <polyline fill="none" stroke="#34d399" strokeWidth="2" points={indices.map(index => point(index, history[index].rxMbps)).join(' ')} />
          <polyline fill="none" stroke="#22d3ee" strokeWidth="2" points={indices.map(index => point(index, history[index].txMbps)).join(' ')} />
          {indices.length === 1 && <><circle cx={point(indices[0], history[indices[0]].rxMbps).split(',')[0]} cy={point(indices[0], history[indices[0]].rxMbps).split(',')[1]} r="2" fill="#34d399" /><circle cx={point(indices[0], history[indices[0]].txMbps).split(',')[0]} cy={point(indices[0], history[indices[0]].txMbps).split(',')[1]} r="2" fill="#22d3ee" /></>}
        </g>)}
      </svg>
      <p className="text-slate-400">RX green · TX cyan · 0–{max.toFixed(3)} Mbps · {history.length} intervals, oldest → newest (interval-spaced) · latest {latest?.timestamp} ({latest?.elapsedSeconds.toFixed(2)}s interval)</p>
    </> : <p className="text-slate-500 py-6 text-center">History appears after two valid readings.</p>}
    <p className="text-slate-500">Keeps up to {SPEED_HISTORY_LIMIT} recent measured intervals per interface and {SPEED_INTERFACE_LIMIT} interfaces. Session totals cover valid intervals while this view is open; skipped gaps are excluded. CSV exports only the selected interface’s retained samples on request.</p>
  </section>;
}
