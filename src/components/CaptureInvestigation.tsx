import React, { useEffect, useMemo, useRef, useState } from 'react';
import { generateCaptureInvestigation, type CaptureInvestigation as Investigation } from '../services/tauri/captureInvestigation';
import { boundedPreview, exportCaptureInvestigationBundle, exportCaptureInvestigationJson, exportCaptureInvestigationMarkdown, projectCaptureInvestigation, type InvestigationFilters } from '../lib/captureInvestigationPresentation';
import { isTauriEnvironment } from '../services/tauri/isTauri';

export interface CaptureInvestigationProps { sessionId?: string | null; onSelectPacket?: (number: number) => void }
type Tab = 'conversations' | 'timeline' | 'anomalies';
const button = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const field = 'min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200';
const time = (value: number | null) => value === null ? 'Time unknown' : `${value} s`;
const endpoint = (address: string, port: number | null) => `${address || 'Unknown endpoint'} · ${port === null ? 'port unknown' : `port ${port}`}`;

export function CaptureInvestigation({ sessionId, onSelectPacket }: CaptureInvestigationProps) {
  const [result, setResult] = useState<Investigation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InvestigationFilters>({});
  const [tab, setTab] = useState<Tab>('conversations');
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const native = isTauriEnvironment();
  useEffect(() => {
    mounted.current = true;
    generation.current += 1;
    inFlight.current = false;
    setResult(null); setBusy(false); setError(null); setFilters({}); setBookmarks([]); setSelected(null); setTab('conversations');
    return () => { mounted.current = false; generation.current += 1; inFlight.current = false; };
  }, [sessionId]);
  const generate = async () => {
    if (!native || !sessionId || inFlight.current || !mounted.current) return;
    inFlight.current = true;
    const request = generation.current;
    setBusy(true); setError(null);
    try { const value = await generateCaptureInvestigation(sessionId); if (mounted.current && generation.current === request) { setResult(value); setFilters({}); setSelected(null); setBookmarks([]); } }
    catch (e) { if (mounted.current && generation.current === request) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (mounted.current && generation.current === request) { inFlight.current = false; setBusy(false); } }
  };
  const p = useMemo(() => result ? projectCaptureInvestigation(result, filters) : null, [result, filters]);
  const options = useMemo(() => result ? { severity: [...new Set([...result.anomalies, ...result.timeline].map(a => a.severity))], kind: [...new Set([...result.anomalies, ...result.timeline].map(a => a.kind))] } : { severity: [], kind: [] }, [result]);
  const change = (next: Partial<InvestigationFilters>) => setFilters(current => ({ ...current, ...next, page: 0 }));
  const select = (n: number) => { setSelected(n); onSelectPacket?.(n); };
  const packet = (n: number) => <button type="button" className="rounded px-1 font-mono text-slate-200 underline decoration-slate-600 underline-offset-4 hover:bg-white/10" aria-label={`Select packet ${n}`} onClick={() => select(n)}>{n}</button>;
  const toggleBookmark = (n: number) => setBookmarks(current => current.includes(n) ? current.filter(item => item !== n) : current.length < 100 ? [...current, n] : current);
  const download = (format: 'md' | 'json' | 'bundle') => {
    if (!result) return;
    let url: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const contents = format === 'md' ? exportCaptureInvestigationMarkdown(result, filters) : format === 'json' ? exportCaptureInvestigationJson(result, filters) : exportCaptureInvestigationBundle(result, filters);
      url = URL.createObjectURL(new Blob([contents], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json' }));
      anchor = document.createElement('a'); anchor.href = url; anchor.download = `capture-investigation${format === 'bundle' ? '-bundle' : ''}.${format === 'md' ? 'md' : 'json'}`;
      document.body.append(anchor); anchor.click(); setError(null);
    } catch (e) { setError(`Export failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { anchor?.remove(); if (url) { const release = url; setTimeout(() => URL.revokeObjectURL(release), 30_000); } }
  };
  const rows = p?.[tab];
  const total = p?.totals[tab] ?? 0;
  const page = filters.page ?? 0;
  return <section id="capture-investigate" className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-700 bg-neutral-950/80 p-4 text-sm text-slate-200 [&_.text-xs]:text-sm" aria-label="Capture investigation workspace">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 title="Capture Investigation" className="text-lg font-semibold tracking-tight">Investigate</h2>{!result && <p className="mt-1 text-sm text-slate-400" role="status">{!native ? 'Open the desktop app to investigate; no simulated browser data.' : !sessionId ? 'Open or record a capture below.' : 'Build conversations, timeline and review observations from this capture.'}</p>}</div><button type="button" className={button} disabled={!native || !sessionId || busy} onClick={() => void generate()}>{busy ? 'Generating…' : result ? 'Refresh model' : 'Generate model'}</button></header>
    {!result && <div className="flex flex-wrap gap-2 text-sm text-slate-400" aria-label="Investigation views"><span className="rounded-md bg-slate-900 px-3 py-1">Conversations</span><span className="rounded-md bg-slate-900 px-3 py-1">Timeline</span><span className="rounded-md bg-slate-900 px-3 py-1">Review</span></div>}
     {result && <p className="text-sm text-slate-400">Metadata observations only; review before sharing.</p>}
     {error && <p role="alert" className="rounded-lg border border-slate-600 bg-white/5 p-3 text-sm text-white">{error}</p>}
    {p && result && <>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['Decoded packets', result.generated_from_packets], ['Conversations', result.conversations.length], ['Timeline events', result.timeline.length], ['Review observations', result.anomalies.length]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"><p className="text-sm text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p></div>)}</div>
      <div className="flex flex-wrap gap-2"><input className={`${field} flex-1 basis-52`} type="search" aria-label="Search investigation metadata" placeholder="Search endpoints, protocols, evidence…" value={filters.search ?? ''} onChange={e => change({ search: e.target.value })} /><button type="button" className={button} onClick={() => download('md')}>Export Markdown</button><button type="button" className={button} onClick={() => download('json')}>Export JSON</button><button type="button" className={button} onClick={() => download('bundle')}>Save case bundle</button></div>
       <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3"><div role="tablist" aria-label="Investigation sections" className="flex flex-wrap gap-1">{([['conversations', 'Conversations'], ['timeline', 'Timeline'], ['anomalies', 'Review']] as const).map(([id, label]) => <button type="button" key={id} id={`investigation-${id}`} role="tab" aria-selected={tab === id} aria-controls="investigation-panel" className={`${button} ${tab === id ? 'border-slate-400 bg-white/10 text-white' : ''}`} onClick={() => { setTab(id); setFilters(current => ({ ...current, page: 0 })); }}>{label}</button>)}</div>
      {tab === 'conversations' ? <select className={field} aria-label="Conversation sort" value={filters.conversationSort ?? 'bytes'} onChange={e => change({ conversationSort: e.target.value as 'bytes' | 'packets' })}><option value="bytes">Most bytes first</option><option value="packets">Most packets first</option></select> : <div className="flex flex-wrap gap-2"><select className={field} aria-label="Severity filter" value={filters.severity ?? 'all'} onChange={e => change({ severity: e.target.value })}><option value="all">All severities</option>{options.severity.map(v => <option key={v}>{v}</option>)}</select><select className={field} aria-label="Kind filter" value={filters.kind ?? 'all'} onChange={e => change({ kind: e.target.value })}><option value="all">All kinds</option>{options.kind.map(v => <option key={v}>{v}</option>)}</select>{tab === 'timeline' && <select className={field} aria-label="Timeline sort" value={filters.timelineSort ?? 'newest'} onChange={e => change({ timelineSort: e.target.value as 'newest' | 'oldest' })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>}</div>}</div>
      <section role="tabpanel" id="investigation-panel" aria-labelledby={`investigation-${tab}`} className="min-w-0">
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-slate-400"><span>{total ? `${page * 50 + 1}–${page * 50 + (rows?.length ?? 0)} of ${total} matching records` : 'No matching records'}</span><span>Native bounds: 100 conversations · 500 events · 100 observations</span></div>
        {!rows?.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No metadata matches this view. Try clearing the search or filters.</p>}
        {tab === 'conversations' && <div className="grid gap-3 xl:grid-cols-2">{p.conversations.map((c, index) => <article key={`${c.id}-${index}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs"><h3 className="break-all font-mono leading-relaxed text-slate-100">{endpoint(c.source, c.source_port)} <span className="text-slate-500">→</span> {endpoint(c.destination, c.destination_port)}</h3><p className="mt-2 text-slate-200">{c.protocol} <span className="text-slate-400">· {c.packets} packets · {c.bytes} bytes</span></p><p className="mt-1 text-slate-500">{time(c.first_time)} — {time(c.last_time)}</p><div className="mt-3 flex flex-wrap gap-1"><span className="text-slate-400">Evidence:</span>{c.packet_numbers.slice(0, 20).map((n, i) => <React.Fragment key={`${n}-${i}`}>{packet(n)}</React.Fragment>)}{c.packet_numbers.length > 20 && <span className="text-slate-500">+{c.packet_numbers.length - 20} references in export</span>}</div></article>)}</div>}
        {tab === 'timeline' && <div className="space-y-2">{p.timeline.map((t, index) => <article key={`${t.packet_number}-${index}`} className="grid gap-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs sm:grid-cols-[140px_1fr]"><div className="text-slate-400">{time(t.time)}<p className="mt-1">Packet {packet(t.packet_number)}</p></div><div><h3 className="font-semibold text-white">{t.kind} <span className="ml-2 font-normal text-slate-400">{t.severity}</span></h3><p className="mt-1 break-words text-slate-300">{boundedPreview(t.summary)}</p></div></article>)}</div>}
        {tab === 'anomalies' && <div className="grid gap-3 xl:grid-cols-2">{p.anomalies.map((a, index) => <article key={`${a.id}-${index}`} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs"><h3 className="font-semibold text-slate-200">{a.kind} <span className="font-normal text-slate-400">· {a.severity}</span></h3><p className="mt-1 text-slate-500">Confidence: {a.confidence}</p><p className="mt-3 break-words">{boundedPreview(a.summary)}</p><p className="mt-2 break-words text-slate-400">Why: {boundedPreview(a.reason)}</p><div className="mt-3 flex flex-wrap gap-1"><span className="text-slate-400">Evidence:</span>{a.evidence_packets.slice(0, 20).map((n, i) => <React.Fragment key={`${n}-${i}`}>{packet(n)}</React.Fragment>)}{a.evidence_packets.length > 20 && <span>+{a.evidence_packets.length - 20} references in export</span>}</div></article>)}</div>}
        <div className="mt-3 flex justify-end gap-2"><button type="button" className={button} disabled={page === 0} onClick={() => setFilters(current => ({ ...current, page: page - 1 }))}>Previous</button><button type="button" className={button} disabled={(page + 1) * 50 >= total} onClick={() => setFilters(current => ({ ...current, page: page + 1 }))}>Next records</button></div>
      </section>
      <aside aria-label="Packet selection and bookmarks" className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{selected === null ? 'Select an evidence packet' : `Selected packet ${selected}`}</h3>{selected !== null && <button type="button" className={button} disabled={!bookmarks.includes(selected) && bookmarks.length >= 100} onClick={() => toggleBookmark(selected)}>{bookmarks.includes(selected) ? 'Remove bookmark' : 'Bookmark packet'}</button>}</div><p className="mt-2 text-slate-500">Bookmarks are temporary view memory, not persistent storage. Cleared on session change or model refresh. {bookmarks.length}/100 references.</p>{bookmarks.length > 0 && <div className="mt-2 flex flex-wrap gap-2" aria-label="Bookmarked packets">{bookmarks.map(n => <span key={n}>{packet(n)}<button type="button" aria-label={`Remove bookmark ${n}`} className="ml-1 text-slate-500 hover:text-white" onClick={() => toggleBookmark(n)}>×</button></span>)}</div>}</aside>
      <details className="text-sm leading-relaxed text-slate-400"><summary className="cursor-pointer">Analysis limits</summary><p className="mt-2">{p.limitations.join(' ')}</p></details>
    </>}
    {sessionId && <details className="text-sm leading-relaxed text-slate-400"><summary className="cursor-pointer">Evidence &amp; sharing limits</summary><p className="mt-2"><strong>Evidence, not verdict.</strong> Observations do not prove intent or compromise. Endpoints and exported metadata may be sensitive; review before sharing. Case bundles are filtered, bounded metadata only—not PCAP or hash proof.</p></details>}
  </section>;
}
