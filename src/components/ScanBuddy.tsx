import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Download, Radar, RefreshCw, ShieldCheck, Square, Play, Eye, Search, Activity, Terminal } from 'lucide-react';
import { cancelScan, planScan, scanBuddyAvailable, scanHistory, scanStatus, scanStorageStatus, startScan, type ScanState, type ScanStorageStatus, type ScanResult } from '../services/tauri/scanBuddy';
import { inspectScanResult, type InspectionCheck, type ScanInspection } from '../services/tauri/scanInspection';
import { EXPORT_WARNING, SCAN_PRESETS, exportScan, projectScanResults, scanProgress, type ResultSort, type ScanExport } from '../lib/scanBuddyPresentation';
import { createScanBuddyWorkflow, scopeErrors, startDisabledReason } from '../lib/scanBuddyWorkflow';

const field = 'w-full rounded-xl border border-slate-700 bg-neutral-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-300 focus:ring-1 focus:ring-white/20 disabled:opacity-50';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium hover:border-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const stateColor: Record<ScanState, string> = { OPEN: 'text-white bg-white/10', CLOSED: 'text-slate-300 bg-slate-400/10', TIMEOUT: 'text-slate-200 bg-slate-300/10', UNREACHABLE: 'text-slate-300 bg-slate-500/10', ERROR: 'text-white bg-slate-600/20' };

export function ScanBuddy() {
  const available = scanBuddyAvailable();
  const [workflow] = useState(() => createScanBuddyWorkflow({ cancelScan, planScan, scanHistory, scanStatus, startScan }, available));
  const state = useSyncExternalStore(workflow.subscribe, workflow.getSnapshot, workflow.getSnapshot);
  const { request, preview, job, history, pending, error, pollWarning } = state;
  const busy = pending !== null;
  const [filter, setFilter] = useState<ScanState | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ResultSort>('endpoint');
  const [descending, setDescending] = useState(false);
  const errors = scopeErrors(request);
  const currentPreview = preview?.plan ?? null;
  const running = job?.state === 'RUNNING';
  const startReason = startDisabledReason(state, available);
  const rows = useMemo(() => projectScanResults(job?.results ?? [], filter, search, sort, descending), [job, filter, search, sort, descending]);
  const openCount = job?.results.filter(row => row.state === 'OPEN').length ?? 0;
  const reasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const result of job?.results ?? []) {
      const reason = result.reason || 'Reason not recorded by older backend';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts];
  }, [job]);
  const [storage, setStorage] = useState<ScanStorageStatus | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [selected, setSelected] = useState<ScanResult | null>(null);
  const [inspectionCheck, setInspectionCheck] = useState<InspectionCheck>('connect');
  const [inspectionAuthorized, setInspectionAuthorized] = useState(false);
  const [inspection, setInspection] = useState<ScanInspection | null>(null);
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const inspectionGeneration = React.useRef(0);
  useEffect(() => {
    let cancelled = false;
    if (available) void scanStorageStatus().then(value => {
      if (!cancelled) { setStorage(value); setStorageError(false); }
    }).catch(() => { if (!cancelled) setStorageError(true); });
    return () => { cancelled = true; };
  }, [available, history]);

  useEffect(() => workflow.attach(), [workflow]);
  const edit = workflow.edit;
  const refresh = () => void workflow.refresh();
  const previewRequest = () => void workflow.preview();
  const start = () => void workflow.start();
  const cancel = () => void workflow.cancel();
  const download = (format: ScanExport) => {
    if (!job) return;
    const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : 'text/markdown';
    const url = URL.createObjectURL(new Blob([exportScan(job, format)], { type: `${mime};charset=utf-8` }));
    const link = document.createElement('a'); link.href = url;
    link.download = `scan-buddy-${job.id.replace(/[^a-z0-9_-]/gi, '_')}.${format}`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const inspect = async () => {
    if (!selected || selected.state !== 'OPEN' || !inspectionAuthorized || inspectionBusy) return;
    const generation = ++inspectionGeneration.current;
    setInspectionBusy(true); setInspectionError(null); setInspection(null);
    try { const result = await inspectScanResult(selected.target, selected.port, true, inspectionCheck); if (generation === inspectionGeneration.current) setInspection(result); }
    catch (reason) { if (generation === inspectionGeneration.current) setInspectionError(String(reason)); }
    finally { if (generation === inspectionGeneration.current) setInspectionBusy(false); }
  };

  return <div className="space-y-3 p-4 text-sm text-slate-200 max-w-[1600px] mx-auto [&_.text-xs]:text-sm [&_p]:text-sm [&_label]:text-sm [&_thead]:text-sm [&_span]:text-sm [&_li]:text-sm [&_button_div]:text-sm">
     <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-neutral-950 p-4">
       <div><h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-white"><Radar className="text-slate-200" size={24} /> Scan Buddy</h1></div>
       <nav aria-label="Scan stages" className="flex flex-wrap gap-2"><a className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 hover:border-slate-300" href="#scan-scope">Scope</a><a className="rounded-lg border border-slate-500 bg-white/10 px-3 py-2 text-white" href="#scan-preview">Preview</a><a className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 hover:border-slate-300" href="#scan-results">Results</a></nav>
       <span className={`rounded-full border px-3 py-1 text-sm ${available ? 'border-slate-500 text-slate-200' : 'border-slate-600 text-slate-300'}`}>{available ? 'TCP connect · local' : 'Desktop required'}</span>
    </header>
    {!available && <div role="status" className="rounded-xl border border-slate-600 bg-white/5 p-4 text-sm text-slate-300">Scan Buddy is unavailable in browser mode. Open the native desktop app to preview and run scans. No simulated results or browser scanning.</div>}
    {error && <div role="alert" className="rounded-xl border border-slate-600 bg-white/5 p-4 text-sm text-white">{error}</div>}
    <div className="grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <section id="scan-scope" className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-white"><Terminal size={17} className="text-slate-200" /> Scope</h2>
          <label className="block text-xs text-slate-400">Targets · literal IPs only<textarea aria-label="Target IP addresses" className={`${field} mt-2 font-mono min-h-24`} placeholder={'192.168.1.10, 192.168.1.20\n10.0.0.0/30'} value={request.targets} onChange={event => edit({ targets: event.target.value })} disabled={busy || !available} /></label>
          <p className="text-[11px] text-slate-500">Comma or whitespace separated IPv4/IPv6. Small IPv4 CIDRs /27–/32; no DNS resolution.</p>
          <button className={button} disabled={busy || !available} onClick={() => edit({ targets: '127.0.0.1' })}>Use loopback</button>
          <p className="text-sm text-slate-400">Fills 127.0.0.1; no traffic until Start.</p>
          <label className="block text-xs text-slate-400">TCP ports<input className={`${field} mt-2 font-mono`} value={request.ports} onChange={event => edit({ ports: event.target.value })} disabled={busy || !available} placeholder="22,80,443,8000-8010" /></label>
          <div className="flex gap-2">{(Object.keys(SCAN_PRESETS) as (keyof typeof SCAN_PRESETS)[]).map(preset => <button key={preset} className={`${button} flex-1 capitalize text-slate-200`} disabled={busy || !available} onClick={() => edit({ ports: SCAN_PRESETS[preset] })}>{preset}</button>)}</div>
           <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Timeout · ms<input type="number" min={100} max={2000} step={100} className={`${field} mt-2`} value={request.timeout_ms} onChange={event => edit({ timeout_ms: Number(event.target.value) })} disabled={busy || !available} /></label><label className="text-xs text-slate-400">Concurrency<input type="number" min={1} max={16} className={`${field} mt-2`} value={request.concurrency} onChange={event => edit({ concurrency: Number(event.target.value) })} disabled={busy || !available} /></label></div>
           <div className="space-y-2"><h3 className="font-semibold text-white text-sm">Scan profile</h3><div className="grid grid-cols-3 gap-2">{([['Conservative', 2000, 2], ['Balanced', 800, 4], ['Intensive TCP', 500, 16]] as const).map(([name, timeout_ms, concurrency]) => <button key={name} className={button} disabled={busy || !available} onClick={() => edit({ timeout_ms, concurrency })}>{name}<span className="text-xs text-slate-400">{timeout_ms}ms / {concurrency}</span></button>)}</div></div>
          <h3 className="font-semibold text-white text-sm">Preview</h3>
          <button className={`${button} w-full text-white bg-white/10 border-slate-400`} onClick={previewRequest} disabled={busy || !available || errors.length > 0}><Eye size={15} /> {pending === 'preview' ? 'Previewing…' : 'Preview scan plan'}</button>
          {available && errors.length > 0 && <ul className="text-[11px] space-y-1 text-slate-300">{errors.map(message => <li key={message}>{message}</li>)}</ul>}
          <p className="text-[11px] text-slate-500">Preview does not send probes. Any scope edit invalidates it.</p>
          {currentPreview && <p role="status" className="text-xs text-slate-200">Plan ready: {currentPreview.targets.length} targets × {currentPreview.ports.length} TCP ports = {currentPreview.total_probes} attempts. Review expanded scope on the right.</p>}
          <label className="flex gap-3 rounded-xl border border-slate-600 bg-white/5 p-3 text-xs leading-relaxed"><input type="checkbox" checked={request.authorized} onChange={event => edit({ authorized: event.target.checked })} disabled={busy || !available} className="mt-1 accent-white" /><span>I own these systems or have explicit permission to scan every endpoint in this scope.</span></label>
          <button className={`${button} w-full bg-white text-slate-950 hover:bg-slate-200 border-white`} onClick={start} disabled={startReason !== null} aria-describedby="scan-start-reason"><Play size={15} /> {pending === 'start' ? 'Starting…' : 'Start TCP scan'}</button>
          <p id="scan-start-reason" role="status" className="text-xs text-slate-300">{startReason ?? 'Ready. Start sends TCP connection attempts to this previewed scope.'}</p>
        </section>
        <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-white text-sm">Recent jobs</h2><button className={button} disabled={!available || busy} onClick={refresh} aria-label="Refresh job history"><RefreshCw size={13} /> Refresh</button></div>
          <p className="text-[11px] text-slate-500 mt-2 mb-4">Last 8 jobs. {storage?.persistent && storage.available ? 'Saved locally across app restarts.' : storageError ? 'History storage status unavailable; export important results.' : storage ? 'Persistence unavailable; export important results.' : 'Checking history storage…'}</p>
          {storage?.warnings.map(warning => <p key={warning} role="status" className="text-xs text-slate-300 mb-2">{warning}</p>)}
          <div className="space-y-2">{history.map(item => <button key={item.id} disabled={busy} onClick={() => workflow.select(item)} className={`w-full text-left rounded-xl border p-3 ${job?.id === item.id ? 'border-slate-400 bg-white/10' : 'border-white/5 hover:bg-white/5'}`}><div className="flex justify-between gap-2 text-xs"><span className="font-mono truncate">{item.plan.targets[0]}{item.plan.targets.length > 1 ? ` +${item.plan.targets.length - 1}` : ''}</span><span className={item.state === 'RUNNING' ? 'text-slate-200' : 'text-slate-400'}>{item.state}</span></div><div className="mt-1 text-[10px] text-slate-500">{item.completed_probes}/{item.plan.total_probes} probes · {new Date(item.started_at).toLocaleString()}</div></button>)}</div>
          {history.length === 0 && <p className="text-xs text-slate-500">No jobs loaded. Nothing runs until you explicitly start it.</p>}
        </section>
      </aside>
      <main className="min-w-0 space-y-3">
        <section id="scan-preview" className="rounded-xl border border-slate-700 bg-neutral-950/80 p-4">
          <h2 className="flex items-center gap-2 text-white font-semibold"><ShieldCheck size={18} className="text-slate-200" /> Exact scope preview</h2>
          {currentPreview ? <><div className="grid grid-cols-3 gap-2 mt-3">{[[currentPreview.targets.length, 'Targets'], [currentPreview.ports.length, 'TCP ports'], [currentPreview.total_probes.toLocaleString(), 'Connect attempts']].map(([value, label]) => <div key={label} className="rounded-lg bg-slate-900 border border-slate-800 p-3"><div className="text-xl font-semibold text-slate-200">{value}</div><div className="text-sm text-slate-400 mt-1">{label}</div></div>)}</div><p className="text-sm text-slate-400 mt-3">{currentPreview.timeout_ms} ms timeout · {currentPreview.concurrency} concurrent · native rate limit ≤50 attempts/sec</p><details open className="mt-3 text-sm text-slate-400"><summary className="cursor-pointer text-slate-200">Expanded scope</summary><p className="mt-2 break-all font-mono">Targets: {currentPreview.targets.join(', ')}</p><p className="mt-2 break-all font-mono">Ports: {currentPreview.ports.join(', ')}</p></details>{currentPreview.warnings.map((warning, index) => <p key={index} className="mt-3 text-sm text-slate-300">{warning}</p>)}</> : <p className="text-sm text-slate-400 mt-3">Preview exact targets, ports and warnings. No probes are sent.</p>}
        </section>
        <section id="scan-results" className="rounded-xl border border-slate-700 bg-slate-950/60 overflow-hidden">
          <div className="p-5 border-b border-white/5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex gap-2 items-center font-semibold text-white"><Activity size={18} className="text-slate-200" /> {job ? `Scan ${job.state.toLowerCase()}` : 'Results workspace'}</h2><div className="flex gap-2"><button className={button} disabled={!available || busy} onClick={refresh}><RefreshCw size={13} /> Refresh</button>{running && <button className={`${button} text-white border-slate-600`} disabled={busy} onClick={cancel}><Square size={13} /> Cancel job</button>}</div></div>
            {job && <><div className="mt-3 flex flex-wrap justify-between gap-3 text-sm"><span className="text-slate-400">{job.completed_probes.toLocaleString()} / {job.plan.total_probes.toLocaleString()} probes · {Math.round(scanProgress(job))}%</span><span className="text-slate-200 font-semibold">{openCount} open endpoints</span></div><div role="progressbar" aria-label="Scan progress" aria-valuenow={Math.round(scanProgress(job))} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${scanProgress(job)}%` }} /></div><p className="mt-3 text-sm font-mono text-slate-400 break-all">JOB {job.id} · started {new Date(job.started_at).toLocaleString()}{job.finished_at ? ` · finished ${new Date(job.finished_at).toLocaleString()}` : ''}</p>{job.error && <p role="alert" className="mt-3 text-sm text-white">{job.error}</p>}</>}
            {pollWarning && <p role="status" className="mt-3 text-xs text-slate-300">{pollWarning}</p>}
            {reasons.length > 0 && <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Connection outcome evidence</summary>{reasons.map(([reason, count]) => <p key={reason} className="mt-1">{reason}: {count}</p>)}</details>}
          </div>
          <div className="p-4 flex flex-wrap gap-3 border-b border-white/5"><label className="relative flex-1 min-w-40"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input aria-label="Search scan results" className={`${field} pl-9`} placeholder="Search IP, port, state or hint…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filter result state" className={`${field} !w-auto`} value={filter} onChange={event => setFilter(event.target.value as ScanState | 'ALL')}>{['ALL', 'OPEN', 'CLOSED', 'TIMEOUT', 'UNREACHABLE', 'ERROR'].map(state => <option key={state}>{state}</option>)}</select><select aria-label="Sort results" className={`${field} !w-auto`} value={sort} onChange={event => setSort(event.target.value as ResultSort)}><option value="endpoint">Endpoint</option><option value="port">Port</option><option value="state">State</option><option value="latency">Connect time</option></select><button className={button} onClick={() => setDescending(value => !value)} aria-label="Reverse result sort direction">{descending ? 'Descending ↓' : 'Ascending ↑'}</button></div>
           <div className="overflow-x-auto max-h-[480px]"><table className="w-full text-sm text-left whitespace-nowrap"><thead className="sticky top-0 bg-slate-950 text-sm text-slate-400"><tr>{['Endpoint', 'TCP port', 'State', 'Service hint · unverified', 'Connect time', 'Observed', 'Inspect'].map(title => <th key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.target}:${row.port}:${index}`} className="border-t border-white/5 hover:bg-white/[.03]"><td className="px-4 py-3 font-mono text-slate-200">{row.target}</td><td className="px-4 py-3 font-mono text-slate-200">{row.port}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-sm ${stateColor[row.state]}`}>{row.state}</span></td><td className="px-4 py-3 text-slate-400">{row.service_hint || 'Unknown'}</td><td className="px-4 py-3 font-mono text-slate-400">{Number.isFinite(row.latency_ms) ? `${row.latency_ms} ms` : '—'}</td><td className="px-4 py-3 text-slate-400">{row.observed_at}</td><td className="px-4 py-3">{row.state === 'OPEN' && <button className={button} onClick={() => { inspectionGeneration.current++; setSelected(row); setInspection(null); setInspectionError(null); setInspectionAuthorized(false); }}>Select</button>}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="p-5 text-center text-slate-400"><p className="text-sm">{job ? 'No results match this view yet.' : 'Your scan observations will appear here.'}</p><p className="text-sm mt-2">Open means a TCP connection succeeded, not a verified service.</p></div>}</div>
           {selected && <section className="m-4 rounded-xl border border-slate-600 bg-white/5 p-4 space-y-3" aria-label="Inspection panel"><h3 className="font-semibold text-white">Inspect observed OPEN endpoint</h3><p className="text-sm text-slate-400 font-mono">{selected.target}:{selected.port} · no automatic probes are sent</p><select aria-label="Inspection check" className={field} value={inspectionCheck} onChange={event => setInspectionCheck(event.target.value as InspectionCheck)}><option value="connect">TCP connect</option><option value="http-head">HTTP HEAD / headers</option><option value="http-preview">HTTP preview — bounded GET / content preview</option><option value="ssh-banner">SSH banner</option></select><label className="flex gap-2 text-sm"><input type="checkbox" checked={inspectionAuthorized} onChange={event => setInspectionAuthorized(event.target.checked)} /> I acknowledge permission for this built-in check.</label><button className={button} disabled={!inspectionAuthorized || inspectionBusy || !available} onClick={() => void inspect()}> {inspectionBusy ? 'Inspecting…' : 'Inspect'}</button><p className="text-xs text-slate-500">Select a single observed endpoint, acknowledge permission, then manually Inspect. Built-in checks only; no browser requests, arbitrary scripts, exploits, or Nmap -A.</p>{inspectionError && <p role="alert" className="text-sm text-white">{inspectionError}</p>}{inspection && <article className="rounded-xl border border-slate-600 bg-slate-950/70 p-4 space-y-4" aria-label="Service inspection evidence"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-white">Service inspection evidence</h4><p className="text-xs text-slate-400 font-mono">{inspection.target}:{inspection.port}</p></div><span className="rounded-full border border-slate-500 bg-white/10 px-3 py-1 text-sm text-slate-100">{inspection.status}</span></div><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wide text-slate-500">Check</dt><dd className="mt-1 text-slate-200">{inspection.check === 'http-preview' ? 'HTTP preview — bounded GET / content preview' : inspection.check}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-500">OS fingerprint</dt><dd className="mt-1 text-slate-300">OS fingerprint unavailable</dd></div></dl><div><h5 className="text-xs uppercase tracking-wide text-slate-500">Protocol evidence</h5><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-black/30 p-3 font-mono text-xs text-slate-200"><code>{inspection.protocol_evidence ?? 'No protocol evidence returned.'}</code></pre></div>{inspection.response_headers && <div><h5 className="text-xs uppercase tracking-wide text-slate-500">Response headers</h5><dl className="mt-1 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-black/20 text-xs">{Object.entries(inspection.response_headers).map(([name, value]) => <div key={name} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(8rem,0.4fr)_1fr]"><dt className="font-mono text-slate-400 break-all">{name}</dt><dd className="font-mono text-slate-200 break-all">{value}</dd></div>)}</dl></div>}{inspection.content_preview !== undefined && <div><h5 className="text-xs uppercase tracking-wide text-slate-500">Content preview</h5><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-black/30 p-3 font-mono text-xs text-slate-200"><code>{inspection.content_preview}</code></pre></div>}<div><h5 className="text-xs uppercase tracking-wide text-slate-500">Limitations</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-400">{inspection.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div><p className="text-xs text-slate-500">Observed {inspection.observed_at}</p></article>}</section>}
          <div className="p-4 border-t border-white/5 flex flex-wrap justify-between gap-3 items-center"><p className="text-[11px] text-slate-500">{rows.length} shown / {job?.results.length ?? 0} observed · exports include all results, not just this filter</p><div className="flex gap-2">{(['json', 'csv', 'md'] as ScanExport[]).map(format => <button key={format} className={button} disabled={!job} onClick={() => download(format)}><Download size={12} /> {format === 'md' ? 'Markdown' : format.toUpperCase()}</button>)}</div></div>
        </section>
           <p className="text-sm text-slate-400">Jobs continue off-page. Cancel preserves completed observations.</p>
           <p className="text-sm text-slate-500">OS fingerprint unavailable from TCP ports alone; any assessment shown below is only explicit check evidence.</p>
        <details className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400"><summary className="cursor-pointer">Scan limits, recovery &amp; export privacy</summary><div className="mt-3 space-y-2"><p>Jobs continue when you leave this view until completion, explicit cancellation, or app exit. Return here to resume from history; refresh if needed. Cancelling preserves completed observations.</p><p>{EXPORT_WARNING}</p><p>TCP connect only. No UDP, SYN scanning, OS detection, NSE scripts, or banner probes. TIMEOUT does not prove a firewall; CLOSED, UNREACHABLE and ERROR reflect the native connection outcome. This is not full Nmap parity.</p><p>Bounds: 32 targets · 256 ports · 4,096 probes · ≤50 attempts/sec.</p></div></details>
      </main>
    </div>
  </div>;
}
