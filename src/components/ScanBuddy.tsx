import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw, ShieldCheck, Square, Play, Eye, Search, Activity, Terminal, SlidersHorizontal, ListChecks, Database, Crosshair, ChevronRight } from 'lucide-react';
import { cancelScan, discoverNetworkScope, planScan, resetScanHistory, scanBuddyAvailable, scanHistory, scanStatus, scanStorageStatus, startScan, type NetworkScopeDiscovery, type ScanState, type ScanStorageStatus, type ScanResult } from '../services/tauri/scanBuddy';
import { inspectScanResult, type InspectionCheck, type ScanInspection } from '../services/tauri/scanInspection';
import { EXPORT_WARNING, SCAN_PRESETS, exportScan, projectScanResults, scanProgress, isLocalAuthorizedScope, analyzeScanRequest, estimateScanImpact, type ResultSort, type ScanExport } from '../lib/scanBuddyPresentation';
import { createScanBuddyWorkflow, scopeErrors, startDisabledReason } from '../lib/scanBuddyWorkflow';
import { ReadinessPanel } from './ReadinessPanel';
import { downloadTextFile } from '../lib/localDownload';

const field = 'w-full rounded-xl border border-slate-700 bg-neutral-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-slate-300 focus:ring-1 focus:ring-white/20 disabled:opacity-50';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium hover:border-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const stateColor: Record<ScanState, string> = { OPEN: 'text-white bg-white/10', CLOSED: 'text-slate-300 bg-slate-400/10', TIMEOUT: 'text-slate-200 bg-slate-300/10', UNREACHABLE: 'text-slate-300 bg-slate-500/10', ERROR: 'text-white bg-slate-600/20' };

export function ScanBuddy() {
  const available = scanBuddyAvailable();
  const [workflow] = useState(() => createScanBuddyWorkflow({ cancelScan, planScan, scanHistory, scanStatus, startScan, resetScanHistory }, available));
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
  const impact = useMemo(() => {
    const scope = analyzeScanRequest({ ...request, authorized: true });
    return scope.targetCount > 0 && scope.portCount > 0
      ? estimateScanImpact(scope.targetCount, scope.portCount, request.concurrency, request.timeout_ms)
      : null;
  }, [request]);
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
  const [networkScope, setNetworkScope] = useState<NetworkScopeDiscovery | null>(null);
  const [networkScopeBusy, setNetworkScopeBusy] = useState(false);
  const [networkScopeError, setNetworkScopeError] = useState<string | null>(null);
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

  useEffect(() => {
    const detach = workflow.attach();
    // Rehydrate the native journal whenever the desktop view regains focus;
    // this covers app restart, suspend/resume, and returning from another tab.
    const refreshOnFocus = () => { void workflow.refresh(); };
    window.addEventListener('focus', refreshOnFocus);
    return () => { window.removeEventListener('focus', refreshOnFocus); detach(); };
  }, [workflow]);
  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<{ targets?: string }>).detail;
      if (detail?.targets) workflow.edit({ targets: detail.targets });
    };
    window.addEventListener('netoze:scan-buddy-context', onContext);
    return () => window.removeEventListener('netoze:scan-buddy-context', onContext);
  }, [workflow]);
  const edit = workflow.edit;
  const refresh = () => void workflow.refresh();
  const resetHistory = () => { if (window.confirm('Remove all saved Scan Buddy history? This cannot be undone.')) void workflow.resetHistory(); };
  const previewRequest = () => void workflow.preview();
  const start = () => void workflow.start();
  const cancel = () => void workflow.cancel();
  const detectNetwork = async () => {
    if (networkScopeBusy || !available) return;
    setNetworkScopeBusy(true); setNetworkScopeError(null);
    try { setNetworkScope(await discoverNetworkScope()); }
    catch (reason) { setNetworkScopeError(String(reason)); }
    finally { setNetworkScopeBusy(false); }
  };
  const scanOwnIp = async () => {
    if (busy || networkScopeBusy || !available) return;
    setNetworkScopeBusy(true); setNetworkScopeError(null);
    try {
      const discovered = networkScope ?? await discoverNetworkScope();
      setNetworkScope(discovered);
      const own = discovered.interfaces.find(item => item.address !== '127.0.0.1') ?? discovered.interfaces[0];
      if (!own) {
        setNetworkScopeError('No usable local IPv4 address was reported. Choose another literal IP manually.');
        return;
      }
      edit({ targets: own.address });
    } catch (reason) { setNetworkScopeError(String(reason)); }
    finally { setNetworkScopeBusy(false); }
  };
  const download = async (format: ScanExport) => {
    if (!job) return;
    const mime = format === 'json' ? 'application/json' : format === 'csv' ? 'text/csv' : format === 'pdf' ? 'application/pdf' : format === 'txt' ? 'text/plain' : 'text/markdown';
     await downloadTextFile(exportScan(job, format), mime, `scan-buddy-${job.id.replace(/[^a-z0-9_-]/gi, '_')}.${format}`);
  };
  const inspect = async () => {
    if (!selected || selected.state !== 'OPEN' || !inspectionAuthorized || inspectionBusy) return;
    const generation = ++inspectionGeneration.current;
    setInspectionBusy(true); setInspectionError(null); setInspection(null);
    try { const result = await inspectScanResult(selected.target, selected.port, true, inspectionCheck); if (generation === inspectionGeneration.current) setInspection(result); }
    catch (reason) { if (generation === inspectionGeneration.current) setInspectionError(String(reason)); }
    finally { if (generation === inspectionGeneration.current) setInspectionBusy(false); }
  };

  return <div className="enterprise-tool-shell scan-buddy-shell mx-auto max-w-[1700px] space-y-4 p-3 text-sm text-slate-200 sm:p-5 [&_.text-xs]:text-sm [&_p]:text-sm [&_label]:text-sm [&_thead]:text-sm [&_span]:text-sm [&_li]:text-sm [&_button_div]:text-sm">
       <header className="enterprise-tool-header relative overflow-hidden rounded-2xl border border-slate-700 bg-neutral-950 p-5 shadow-2xl shadow-black/20 sm:p-6">
       <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full border border-slate-800/80" /><div className="pointer-events-none absolute right-10 top-8 h-24 w-24 rounded-full border border-slate-800/70" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between"><div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-slate-600 bg-slate-900 shadow-inner"><Crosshair size={28} className="text-slate-100" /></div><div><p className="enterprise-kicker">NET0ZE / AUTHORIZED DISCOVERY</p><h1 className="text-3xl font-semibold tracking-tight text-white">Scan Buddy</h1><p className="mt-1 max-w-xl text-sm text-slate-400">Define a precise local scope, preview the impact, then inspect only the endpoints you explicitly observed.</p></div></div><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${available ? 'border-slate-500 text-slate-200' : 'border-slate-600 text-slate-300'}`}><span className={`h-2 w-2 rounded-full ${available ? 'bg-slate-200' : 'bg-slate-500'}`} />{available ? 'Native scanner ready' : 'Desktop required'}</span><a className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm hover:border-slate-300" href="#scan-results">Open results <ChevronRight size={14} /></a></div></div>
       <nav aria-label="Scan stages" className="relative mt-6 grid gap-2 sm:grid-cols-3"><a className="group flex items-center gap-3 rounded-xl border border-slate-600 bg-slate-900/80 p-3 hover:border-slate-300" href="#scan-scope"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><SlidersHorizontal size={16} /></span><strong className="text-white">Scope</strong></a><a className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3 hover:border-slate-300" href="#scan-preview"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><ListChecks size={16} /></span><strong className="text-white">Preview</strong></a><a className="group flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/40 p-3 hover:border-slate-300" href="#scan-results"><span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-800"><Activity size={16} /></span><strong className="text-white">Results</strong></a></nav>
      </header>
     <ReadinessPanel />
     {!available && <div role="status" className="rounded-xl border border-slate-600 bg-white/5 p-4 text-sm text-slate-300">Scan Buddy is unavailable in browser mode. Open the native desktop app to preview and run scans. No simulated results or browser scanning.</div>}
    {error && <div role="alert" className="rounded-xl border border-slate-600 bg-white/5 p-4 text-sm text-white">{error}</div>}
     <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
       <aside className="order-2 space-y-4 lg:order-2">
          <section id="scan-scope" aria-hidden={running} className={`${running ? 'hidden' : ''} rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3 shadow-xl shadow-black/10`}>
           <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">01 · Define</p><h2 className="mt-1 flex items-center gap-2 font-semibold text-white"><Terminal size={17} className="text-slate-200" /> Scan scope</h2></div><SlidersHorizontal size={18} className="text-slate-500" /></div>
          <label className="block text-xs text-slate-400">Targets · literal IPs only<textarea aria-label="Target IP addresses" className={`${field} mt-2 font-mono min-h-24`} placeholder={'192.168.1.10, 192.168.1.20\n10.0.0.0/30'} value={request.targets} onChange={event => edit({ targets: event.target.value })} disabled={busy || !available} /></label>
          <p className="text-[11px] text-slate-500">Comma or whitespace separated IPv4/IPv6 or IPv4 CIDRs /24–/32; /24 includes 254 usable hosts. No DNS resolution.</p>
             <button className={`${button} w-full border-slate-400 bg-white/10 text-white`} disabled={busy || !available || networkScopeBusy} onClick={() => void scanOwnIp()}>{networkScopeBusy ? 'Finding self IP…' : 'Scan self IP'}</button>
             <p className="text-xs text-slate-500">Detects this computer’s current local IPv4 address and places it in the scan target. Review Preview, then press Start.</p>
            <button className={button} disabled={busy || !available} onClick={() => edit({ targets: '', authorized: false })}>Other IP / manual scope</button>
            <p className="text-sm text-slate-400">Self IP is detected from the native interface list; no traffic is sent until Start.</p>
           <button className={button} disabled={busy || !available || networkScopeBusy} onClick={() => void detectNetwork()}>{networkScopeBusy ? 'Detecting local network…' : 'Own network · detect interfaces'}</button>
           {networkScopeError && <p role="alert" className="text-xs text-white">{networkScopeError}</p>}
           {networkScope && <div className="rounded-lg border border-slate-700 bg-white/5 p-3 text-xs text-slate-300"><p className="font-semibold text-white">Detected local scopes</p>{networkScope.interfaces.length === 0 && <p className="mt-1">No usable IPv4 interface was reported.</p>}{networkScope.interfaces.map(item => <div key={`${item.interface_name}:${item.address}`} className="mt-2 space-y-2"><p>{item.interface_name} · {item.address}/{item.prefix}</p><button className={button} disabled={busy} onClick={() => edit({ targets: item.scan_cidr })}>Use subnet {item.scan_cidr}</button>{item.gateway ? <button className={button} disabled={busy} onClick={() => edit({ targets: item.gateway! })}>Use gateway {item.gateway}</button> : <p>Gateway unknown</p>}<p>Review detected scope and confirm permission before Start.</p>{item.warnings.map(warning => <p key={warning}>{warning}</p>)}</div>)}{networkScope.warnings.map(warning => <p key={warning} className="mt-2 text-slate-500">{warning}</p>)}</div>}
           <label className="block text-xs text-slate-400">TCP ports<input aria-label="TCP ports" className={`${field} mt-2 font-mono`} value={request.ports} onChange={event => edit({ ports: event.target.value, profile: 'custom' })} disabled={busy || !available} placeholder="22,80,443,8000-8010" /></label><p role="status" className="text-xs text-slate-500">{impact ? `Impact estimate: ${impact.probes.toLocaleString()} distinct connect attempts · timeout + pacing estimate ${Math.ceil(impact.worst_case_duration_ms! / 1000).toLocaleString()} seconds before deadline (concurrency ${request.concurrency}, timeout ${request.timeout_ms}ms, ≤50 starts/sec).` : 'Enter a valid scope for an impact estimate.'}</p>
             <div className="space-y-2"><h3 className="font-semibold text-white text-sm">Port coverage · choose one</h3><div className="grid grid-cols-2 gap-2"><button className={`${button} text-slate-200`} aria-pressed={request.profile === 'all_tcp'} disabled={busy || !available} onClick={() => edit({ ports: SCAN_PRESETS.all_tcp, profile: 'all_tcp' })}>Scan all ports <span className="text-xs text-slate-400">1–65535 · one host</span></button><button className={`${button} text-slate-200`} aria-pressed={request.profile !== 'all_tcp'} disabled={busy || !available} onClick={() => edit({ ports: SCAN_PRESETS.common, profile: 'common' })}>Choose ports <span className="text-xs text-slate-400">Desired list/range</span></button></div><details className="text-xs text-slate-400"><summary className="cursor-pointer">More port profiles</summary><div className="grid grid-cols-2 gap-2 mt-2"><button className={button} aria-pressed={request.profile === 'registered'} disabled={busy || !available} onClick={() => edit({ ports: SCAN_PRESETS.registered, profile: 'registered' })}>Registered 1–1024</button><button className={button} aria-pressed={request.profile === 'custom'} disabled={busy || !available} onClick={() => edit({ profile: 'custom' })}>Custom ports</button></div></details><p className="text-xs text-slate-500">All-port scans are limited to one host. Desired ports accept comma-separated values and ranges. Preview shows the exact final probe count before Start.</p></div>
            <div className="space-y-2"><h3 className="font-semibold text-white text-sm">Time limit / scan speed</h3><div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Connection timeout · ms<input type="number" min={100} max={2000} step={100} className={`${field} mt-2`} value={request.timeout_ms} onChange={event => edit({ timeout_ms: Number(event.target.value) })} disabled={busy || !available} /></label><label className="text-xs text-slate-400">Parallel connections<input type="number" min={1} max={16} className={`${field} mt-2`} value={request.concurrency} onChange={event => edit({ concurrency: Number(event.target.value) })} disabled={busy || !available} /></label></div><p className="text-xs text-slate-500">Higher parallelism is faster but creates more simultaneous local TCP attempts. The native engine still caps starts at 50/sec.</p></div>
            <div className="space-y-2"><h3 className="font-semibold text-white text-sm">Scan profile</h3><p className="text-xs text-slate-500">Profiles change timeout and speed for NET0ZE's own TCP-connect engine. No external scanner engine, SYN, stealth, OS fingerprinting, or automatic banner probes.</p><div className="grid grid-cols-3 gap-2">{([['Conservative', 2000, 2], ['Balanced', 800, 4], ['Intensive TCP', 500, 16]] as const).map(([name, timeout_ms, concurrency]) => <button key={name} className={button} aria-pressed={request.timeout_ms === timeout_ms && request.concurrency === concurrency} disabled={busy || !available} onClick={() => edit({ timeout_ms, concurrency })}>{name}<span className="text-xs text-slate-400">{timeout_ms}ms / {concurrency}</span></button>)}</div></div>
          <h3 className="font-semibold text-white text-sm">Preview</h3>
           <button className={`${button} w-full text-white bg-white/10 border-slate-400`} onClick={previewRequest} disabled={busy || !available}><Eye size={15} /> {pending === 'preview' ? 'Previewing…' : 'Preview scan plan'}</button>
          {available && errors.length > 0 && <ul className="text-[11px] space-y-1 text-slate-300">{errors.map(message => <li key={message}>{message}</li>)}</ul>}
          <p className="text-[11px] text-slate-500">Preview does not send probes. Any scope edit invalidates it.</p>
          {currentPreview && <p role="status" className="text-xs text-slate-200">Plan ready: {currentPreview.targets.length} targets × {currentPreview.ports.length} TCP ports = {currentPreview.total_probes} attempts. Review expanded scope on the right.</p>}
           <label className="flex gap-3 rounded-xl border border-slate-600 bg-white/5 p-3 text-xs leading-relaxed"><input type="checkbox" checked={available ? request.authorized : false} onChange={event => edit({ authorized: event.target.checked })} disabled={busy || !available} className="mt-1 accent-white" /><span>{isLocalAuthorizedScope(request.targets) ? 'I authorize scanning this loopback scope (selected by default).' : 'I own these systems or have explicit permission to scan every endpoint in this IP/CIDR scope.'} Unchecking blocks Start. No network traffic is sent until Start.</span></label>
          <button className={`${button} w-full bg-white text-slate-950 hover:bg-slate-200 border-white`} onClick={start} disabled={startReason !== null} aria-describedby="scan-start-reason"><Play size={15} /> {pending === 'start' ? 'Starting…' : 'Start TCP scan'}</button>
           <p id="scan-start-reason" role="status" className="text-xs text-slate-300">{startReason ?? 'Review the preview and press Start to send TCP connection attempts to this scope.'}</p>
        </section>
         <section className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 shadow-xl shadow-black/10">
           <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold text-white text-sm"><Database size={16} className="text-slate-400" /> Recent jobs</h2><div className="flex gap-2"><button className={button} disabled={!available || busy} onClick={refresh} aria-label="Refresh job history"><RefreshCw size={13} /> Refresh all</button><button className={button} disabled={!available || busy || history.length === 0} onClick={resetHistory} aria-label="Reset scan history">Reset</button></div></div>
          <p className="text-[11px] text-slate-500 mt-2 mb-4">Last 8 jobs. {storage?.persistent && storage.available ? 'Saved locally across app restarts.' : storageError ? 'History storage status unavailable; export important results.' : storage ? 'Persistence unavailable; export important results.' : 'Checking history storage…'}</p>
          {storage?.warnings.map(warning => <p key={warning} role="status" className="text-xs text-slate-300 mb-2">{warning}</p>)}
          <div className="space-y-2">{history.map(item => <button key={item.id} disabled={busy} onClick={() => workflow.select(item)} className={`w-full text-left rounded-xl border p-3 ${job?.id === item.id ? 'border-slate-400 bg-white/10' : 'border-white/5 hover:bg-white/5'}`}><div className="flex justify-between gap-2 text-xs"><span className="font-mono truncate">{item.plan.targets[0]}{item.plan.targets.length > 1 ? ` +${item.plan.targets.length - 1}` : ''}</span><span className={item.state === 'RUNNING' ? 'text-slate-200' : 'text-slate-400'}>{item.state}</span></div><div className="mt-1 text-[10px] text-slate-500">{item.completed_probes}/{item.plan.total_probes} probes · {new Date(item.started_at).toLocaleString()}</div></button>)}</div>
          {history.length === 0 && <p className="text-xs text-slate-500">No jobs loaded. Nothing runs until you explicitly start it.</p>}
        </section>
      </aside>
       <main className="order-1 min-w-0 space-y-4 lg:order-1">
         <section id="scan-preview" className="rounded-2xl border border-slate-700 bg-neutral-950/80 p-5 shadow-xl shadow-black/10">
           <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">02 · Verify</p><h2 className="mt-1 flex items-center gap-2 text-white font-semibold"><ShieldCheck size={18} className="text-slate-200" /> Exact scope preview</h2></div><ListChecks size={20} className="text-slate-500" /></div>
          {currentPreview ? <><div className="grid grid-cols-3 gap-2 mt-3">{[[currentPreview.targets.length, 'Targets'], [currentPreview.ports.length, 'TCP ports'], [currentPreview.total_probes.toLocaleString(), 'Connect attempts']].map(([value, label]) => <div key={label} className="rounded-lg bg-slate-900 border border-slate-800 p-3"><div className="text-xl font-semibold text-slate-200">{value}</div><div className="text-sm text-slate-400 mt-1">{label}</div></div>)}</div><p className="text-sm text-slate-400 mt-3">{currentPreview.timeout_ms} ms timeout · {currentPreview.concurrency} concurrent · native rate limit ≤50 attempts/sec</p><details open className="mt-3 text-sm text-slate-400"><summary className="cursor-pointer text-slate-200">Expanded scope</summary><p className="mt-2 break-all font-mono">Targets: {currentPreview.targets.join(', ')}</p><p className="mt-2 break-all font-mono">Ports: {currentPreview.ports.join(', ')}</p></details>{currentPreview.warnings.map((warning, index) => <p key={index} className="mt-3 text-sm text-slate-300">{warning}</p>)}</> : <p className="text-sm text-slate-400 mt-3">Preview exact targets, ports and warnings. No probes are sent.</p>}
        </section>
         <section id="scan-results" className="rounded-2xl border border-slate-700 bg-slate-950/60 overflow-hidden shadow-xl shadow-black/10">
          <div className="p-5 border-b border-white/5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex gap-2 items-center font-semibold text-white"><Activity size={18} className="text-slate-200" /> {job ? `Scan ${job.state.toLowerCase()}` : 'Results workspace'}</h2><div className="flex gap-2"><button className={button} disabled={!available || busy} onClick={refresh}><RefreshCw size={13} /> Refresh</button>{running && <button className={`${button} text-white border-slate-600`} disabled={busy} onClick={cancel}><Square size={13} /> Cancel job</button>}</div></div>
             {job && <><div className="mt-3 flex flex-wrap justify-between gap-3 text-sm"><span className="text-slate-400">{job.completed_probes.toLocaleString()} / {job.plan.total_probes.toLocaleString()} probes · {Math.round(scanProgress(job))}%</span><span className="text-slate-200 font-semibold">{openCount} open endpoints</span></div><div role="progressbar" aria-label="Scan progress" aria-valuenow={Math.round(scanProgress(job))} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${scanProgress(job)}%` }} /></div><p className="mt-3 text-sm font-mono text-slate-400 break-all">JOB {job.id} · started {new Date(job.started_at).toLocaleString()}{job.finished_at ? ` · finished ${new Date(job.finished_at).toLocaleString()}` : ''}</p>{job.authorization?.scope_fingerprint && <p className="mt-2 text-xs font-mono text-slate-500" title="Stable hash of the normalized target and port scope">Scope fingerprint: {job.authorization.scope_fingerprint}</p>}{job.error && <p role="alert" className="mt-3 text-sm text-white">{job.error}</p>}</>}
            {pollWarning && <p role="status" className="mt-3 text-xs text-slate-300">{pollWarning}</p>}
            {reasons.length > 0 && <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">Connection outcome evidence</summary>{reasons.map(([reason, count]) => <p key={reason} className="mt-1">{reason}: {count}</p>)}</details>}
          </div>
          <div className="p-4 flex flex-wrap gap-3 border-b border-white/5"><label className="relative flex-1 min-w-40"><Search size={14} className="absolute left-3 top-3 text-slate-500" /><input aria-label="Search scan results" className={`${field} pl-9`} placeholder="Search IP, port, state or hint…" value={search} onChange={event => setSearch(event.target.value)} /></label><select aria-label="Filter result state" className={`${field} !w-auto`} value={filter} onChange={event => setFilter(event.target.value as ScanState | 'ALL')}>{['ALL', 'OPEN', 'CLOSED', 'TIMEOUT', 'UNREACHABLE', 'ERROR'].map(state => <option key={state}>{state}</option>)}</select><select aria-label="Sort results" className={`${field} !w-auto`} value={sort} onChange={event => setSort(event.target.value as ResultSort)}><option value="endpoint">Endpoint</option><option value="port">Port</option><option value="state">State</option><option value="latency">Connect time</option></select><button className={button} onClick={() => setDescending(value => !value)} aria-label="Reverse result sort direction">{descending ? 'Descending ↓' : 'Ascending ↑'}</button></div>
           <div className="overflow-x-auto max-h-[480px]"><table className="w-full text-sm text-left whitespace-nowrap"><thead className="sticky top-0 bg-slate-950 text-sm text-slate-400"><tr>{['Endpoint', 'TCP port', 'State', 'Service hint · unverified', 'Connect time', 'Observed', 'Inspect'].map(title => <th key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.target}:${row.port}:${index}`} className="border-t border-white/5 hover:bg-white/[.03]"><td className="px-4 py-3 font-mono text-slate-200">{row.target}</td><td className="px-4 py-3 font-mono text-slate-200">{row.port}</td><td className="px-4 py-3"><span className={`rounded-md px-2 py-1 text-sm ${stateColor[row.state]}`}>{row.state}</span></td><td className="px-4 py-3 text-slate-400">{row.service_hint || 'Unknown'}</td><td className="px-4 py-3 font-mono text-slate-400">{Number.isFinite(row.latency_ms) ? `${row.latency_ms} ms` : '—'}</td><td className="px-4 py-3 text-slate-400">{row.observed_at}</td><td className="px-4 py-3">{row.state === 'OPEN' && <button className={button} onClick={() => { inspectionGeneration.current++; setSelected(row); setInspection(null); setInspectionError(null); setInspectionAuthorized(false); }}>Select</button>}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="p-5 text-center text-slate-400"><p className="text-sm">{job ? 'No results match this view yet.' : 'Your scan observations will appear here.'}</p><p className="text-sm mt-2">Open means a TCP connection succeeded, not a verified service.</p></div>}</div>
           {selected && <section className="m-4 rounded-xl border border-slate-600 bg-white/5 p-4 space-y-3" aria-label="Inspection panel"><h3 className="font-semibold text-white">Inspect observed OPEN endpoint</h3><p className="text-sm text-slate-400 font-mono">{selected.target}:{selected.port} · no automatic probes are sent</p><select aria-label="Inspection check" className={field} value={inspectionCheck} onChange={event => setInspectionCheck(event.target.value as InspectionCheck)}><option value="connect">TCP connect</option><option value="http-head">HTTP HEAD / headers</option><option value="http-preview">HTTP preview — bounded GET / content preview</option><option value="ssh-banner">SSH banner</option></select><label className="flex gap-2 text-sm"><input type="checkbox" checked={inspectionAuthorized} onChange={event => setInspectionAuthorized(event.target.checked)} /> I acknowledge permission for this built-in check.</label><button className={button} disabled={!inspectionAuthorized || inspectionBusy || !available} onClick={() => void inspect()}> {inspectionBusy ? 'Inspecting…' : 'Inspect'}</button><p className="text-xs text-slate-500">Select a single observed endpoint, acknowledge permission, then manually Inspect. Built-in checks only; no browser requests, arbitrary scripts, exploits, or Nmap -A.</p>{inspectionError && <p role="alert" className="text-sm text-white">{inspectionError}</p>}{inspection && <article className="rounded-xl border border-slate-600 bg-slate-950/70 p-4 space-y-4" aria-label="Service inspection evidence"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold text-white">Service inspection evidence</h4><p className="text-xs text-slate-400 font-mono">{inspection.target}:{inspection.port}</p></div><span className="rounded-full border border-slate-500 bg-white/10 px-3 py-1 text-sm text-slate-100">{inspection.status}</span></div><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-wide text-slate-500">Check</dt><dd className="mt-1 text-slate-200">{inspection.check === 'http-preview' ? 'HTTP preview — bounded GET / content preview' : inspection.check}</dd></div><div><dt className="text-xs uppercase tracking-wide text-slate-500">OS fingerprint</dt><dd className="mt-1 text-slate-300">OS fingerprint unavailable</dd></div></dl><div><h5 className="text-xs uppercase tracking-wide text-slate-500">Protocol evidence</h5><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-black/30 p-3 font-mono text-xs text-slate-200"><code>{inspection.protocol_evidence ?? 'No protocol evidence returned.'}</code></pre></div>{inspection.response_headers && <div><h5 className="text-xs uppercase tracking-wide text-slate-500">Response headers</h5><dl className="mt-1 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-black/20 text-xs">{Object.entries(inspection.response_headers).map(([name, value]) => <div key={name} className="grid gap-2 px-3 py-2 sm:grid-cols-[minmax(8rem,0.4fr)_1fr]"><dt className="font-mono text-slate-400 break-all">{name}</dt><dd className="font-mono text-slate-200 break-all">{value}</dd></div>)}</dl></div>}{inspection.content_preview !== undefined && <div><h5 className="text-xs uppercase tracking-wide text-slate-500">Content preview</h5><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-black/30 p-3 font-mono text-xs text-slate-200"><code>{inspection.content_preview}</code></pre></div>}<div><h5 className="text-xs uppercase tracking-wide text-slate-500">Limitations</h5><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-400">{inspection.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></div><p className="text-xs text-slate-500">Observed {inspection.observed_at}</p></article>}</section>}
           <div className="p-4 border-t border-white/5 flex flex-wrap justify-between gap-3 items-center"><p className="text-[11px] text-slate-500">{rows.length} shown / {job?.results.length ?? 0} observed · exports include all results, not just this filter</p><div className="flex flex-wrap gap-2">{(['json', 'csv', 'md', 'txt', 'pdf'] as ScanExport[]).map(format => <button key={format} className={button} disabled={!job} onClick={() => download(format)}><Download size={12} /> {format === 'md' ? 'Markdown' : format.toUpperCase()}</button>)}</div></div>
        </section>
           <p className="text-sm text-slate-400">Jobs continue off-page. Cancel preserves completed observations.</p>
           <p className="text-sm text-slate-500">OS fingerprint unavailable from TCP ports alone; any assessment shown below is only explicit check evidence.</p>
        <details className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400"><summary className="cursor-pointer">Scan limits, recovery &amp; export privacy</summary><div className="mt-3 space-y-2"><p>Jobs continue when you leave this view until completion, explicit cancellation, the two-hour deadline, or app exit. Return here to resume from history; refresh if needed. Cancelling and deadlines preserve completed observations.</p><p>{EXPORT_WARNING}</p><p>TCP connect only, implemented in NET0ZE. No Nmap or other external scanner engine, UDP, SYN scanning, OS detection, scripts, or automatic banner probes. Manual HTTP/SSH inspection is available for OPEN endpoints. TIMEOUT does not prove a firewall; CLOSED, UNREACHABLE and ERROR reflect the native connection outcome.</p><p>Bounds: 256 targets · TCP ports 1–65535 · 65,535 total probes · ≤50 starts/sec · two-hour deadline.</p></div></details>
      </main>
    </div>
  </div>;
}
