import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { captureIssue, packetMeaning, summarizePage } from '../lib/captureBuddyPresentation';
import { CaptureWorkflow, type CaptureToken } from './captureWorkflow';
import { CaptureInvestigation } from './CaptureInvestigation';

type Session = { session_id: string; path: string; running: boolean; bytes: number };
type Packet = { number: number; time: string; source: string; destination: string; protocol: string; length: string; info: string };
type Page = { packets: Packet[]; has_more: boolean; translated_filter?: string };
type BriefEntry = { label: string; count: number; bytes: number };
type InvestigationBrief = { packet_count: number; captured_bytes: number; wire_bytes: number; time_start: number | null; time_end: number | null; protocols: BriefEntry[]; talkers: BriefEntry[]; conversations: BriefEntry[]; dns_questions: string[]; observations: string[] };

export function CaptureBuddy() {
  const [engine, setEngine] = useState('Checking Capture Buddy native engine…');
  const [available, setAvailable] = useState(false);
  const [engineCheck, setEngineCheck] = useState(0);
  const [mode, setMode] = useState<'live' | 'file'>('live');
  const [liveBlocked, setLiveBlocked] = useState(false);
  const [captureGuidance, setCaptureGuidance] = useState<string | null>(null);
  const [interfaces, setInterfaces] = useState<string[]>([]);
  const [iface, setIface] = useState('');
  const [path, setPath] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [filter, setFilter] = useState('');
  const [applied, setApplied] = useState('');
  const [searchPending, setSearchPending] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [captureFilter, setCaptureFilter] = useState('');
  const [duration, setDuration] = useState('60');
  const [savePath, setSavePath] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [page, setPage] = useState<Page>({ packets: [], has_more: false });
  const [after, setAfter] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState('Select a packet to inspect its decoded protocols and bytes.');
  const [brief, setBrief] = useState<InvestigationBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [workflow] = useState(() => new CaptureWorkflow());
  const errorOwner = useRef<'action' | 'poll' | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const sessionId = session?.session_id;

  useEffect(() => {
    if (showInspector) inspectorRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }, [showInspector, selected]);

  useEffect(() => {
    workflow.mount();
    return () => {
      const id = workflow.unmount();
      if (id) void invoke('buddy_close', { sessionId: id }).catch(console.error);
    };
  }, [workflow]);

  useEffect(() => {
    let cancelled = false;
    if (!isTauriEnvironment()) { setEngine('Open the desktop app to use Capture Buddy.'); return; }
    void invoke<{ available: boolean; detail: string; live_capture_blocked: boolean; capture_guidance: string | null }>('buddy_engine_status').then((value) => {
      if (cancelled) return;
      setAvailable(value.available); setEngine(value.detail);
      setLiveBlocked(value.live_capture_blocked); setCaptureGuidance(value.capture_guidance);
      if (value.available) void invoke<string[]>('buddy_interfaces').then((items) => {
        if (!cancelled) { setInterfaces(items); setIface(items[0]?.split('.')[0] ?? ''); }
      }).catch((e) => { if (!cancelled) { setError(String(e)); errorOwner.current = 'action'; } });
    }).catch((e) => { if (!cancelled) setEngine(String(e)); });
    return () => { cancelled = true; };
  }, [engineCheck]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const token = workflow.token('view');
    const current = () => !cancelled && workflow.current(token);
    const poll = () => workflow.serialPoll(current, async () => {
      let repeat = false;
      try {
        const state = await invoke<Session>('buddy_session_status', { sessionId });
        if (!current()) return;
        setSession(state);
        repeat = state.running;
        if (state.bytes > 0) {
          const packets = await invoke<Page>('buddy_search_packets', { sessionId, query: applied, after });
          if (current()) {
            setPage(packets);
            if (errorOwner.current === 'poll') { setError(null); errorOwner.current = null; }
            if (applied.trim()) setRecentSearches((previous) => [applied, ...previous.filter((query) => query !== applied)].slice(0, 5));
          }
        }
      } catch (e) {
        if (current()) {
          if (errorOwner.current !== 'action') { setError(String(e)); errorOwner.current = 'poll'; }
          // Reconcile a process that has exited, while preserving its error.
          try {
            const reconciled = await invoke<Session>('buddy_session_status', { sessionId });
            if (current()) { setSession(reconciled); repeat = reconciled.running; }
          } catch { repeat = false; }
        }
      }
      finally { if (current()) { setSearchPending(false); if (repeat) timer = setTimeout(poll, 2000); } }
    });
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [sessionId, applied, after, refresh, workflow]);

  const action = async (operation: (token: CaptureToken) => Promise<void>, scope: 'session' | 'detail' = 'session') => {
    const release = workflow.acquireAction();
    if (!release) return;
    if (scope === 'detail') workflow.invalidateDetail();
    const token = workflow.token(scope);
    setBusy(true); setError(null); errorOwner.current = null;
    try { await operation(token); }
    catch (e) { if (workflow.current(token)) { setError(String(e)); errorOwner.current = 'action'; } }
    finally {
      release();
      // Adoption changes session ownership, but not this action's mounted lifetime.
      if (workflow.currentLifetime(token)) setBusy(false);
    }
  };
  const adopt = (value: Session, token: CaptureToken) => {
    if (!workflow.current(token)) { void invoke('buddy_close', { sessionId: value.session_id }).catch(console.error); return; }
    const previous = workflow.sessionId;
    workflow.setSession(value.session_id);
    if (previous && previous !== value.session_id) void invoke('buddy_close', { sessionId: previous }).catch(console.error);
    setSession(value); setPage({ packets: [], has_more: false }); setSearchPending(false);
    setAfter(0); setSelected(null); setDetail('Select a packet.');
    setSavePath(value.path.replace(/(\.[^./\\]+)$/, '-copy$1')); setBrief(null);
    setSaved(null); setShowSave(false); setShowInspector(false);
  };
  const inspect = async (number: number) => {
    const activeSessionId = workflow.sessionId;
    if (!activeSessionId) return;
    workflow.invalidateDetail();
    const token = workflow.token('detail');
    setSelected(number); setDetail('Dissecting…');
    setShowInspector(true);
    try {
      const result = await invoke<{ dissection: string }>('buddy_packet_detail', { sessionId: activeSessionId, number });
      if (workflow.current(token)) setDetail(result.dissection);
    } catch (e) { if (workflow.current(token)) setDetail(String(e)); }
  };
  const bytesAt = detail.search(/^0000\s/m);
  const pageSummary = summarizePage(page.packets);
  const selectedPacket = page.packets.find((packet) => packet.number === selected);
  const issue = error ? captureIssue(error) : captureGuidance ? captureIssue(captureGuidance) : null;
  const durationSeconds = Number(duration);
  const validDuration = /^\d+$/.test(duration) && Number.isInteger(durationSeconds) && durationSeconds >= 1 && durationSeconds <= 3600;
  const search = (query: string) => {
    workflow.invalidateView();
    setFilter(query); setApplied(query); setAfter(0); setPage({ packets: [], has_more: false });
    setSelected(null); setShowInspector(false); setDetail('Select a packet.'); setError(null); errorOwner.current = null; setSearchPending(!!session);
    setRefresh((value) => value + 1);
  };
  const changePage = (next: number) => {
    workflow.invalidateView(); setAfter(next); setPage({ packets: [], has_more: false });
    setSelected(null); setShowInspector(false); setDetail('Select a packet.'); setSearchPending(!!session);
  };
  const input = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 min-w-0';
  const button = 'rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white hover:border-slate-300 hover:bg-white/10 disabled:opacity-40';
  const recordingSource = <section id="capture-source" className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3" aria-label="Recording source">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-base font-semibold mr-2">Capture</h2>
      <button className={`${button} ${mode === 'live' ? 'bg-white/10' : ''}`} aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Record this device</button>
      <button className={`${button} ${mode === 'file' ? 'bg-white/10' : ''}`} aria-pressed={mode === 'file'} onClick={() => setMode('file')}>Review a saved recording</button>
      {session && <button className={`${button} ml-auto`} disabled={busy} onClick={() => void action(async (token) => {
        await invoke('buddy_close', { sessionId });
        if (!workflow.current(token)) return;
        workflow.setSession(undefined); setSession(null); setPage({ packets: [], has_more: false });
         setSelected(null); setShowInspector(false); setDetail('Select a packet.'); setSearchPending(false); setSaved(null); setShowSave(false); setBrief(null);
      })}>End review</button>}
    </div>
    {issue && <section role="alert" className="rounded-lg border border-slate-600 bg-white/5 p-3 space-y-2">
      <h2 className="text-sm font-semibold text-white">{issue.title}</h2>
      <p className="text-sm text-slate-300 leading-relaxed">{issue.action}</p>
      {captureGuidance?.startsWith('CAPTURE_SETUP:') && <div className="space-y-2 text-xs text-slate-300">
        <p>Install the latest capture-access DEB using your system package manager. The package grants CAP_NET_RAW only to the small recorder helper, not to the desktop app.</p>
        <p>Access is limited to the <code>netdev</code> group. If your account is not a member, an administrator can add it; then sign out and back in.</p>
        <button className={button} onClick={() => { setError(null); errorOwner.current = null; setEngineCheck((value) => value + 1); }}>Recheck recording access</button>
      </div>}
      <details className="text-xs text-slate-400"><summary className="cursor-pointer">Technical evidence</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap select-text">{error || captureGuidance}</pre></details>
    </section>}
    {mode === 'file' && <div className="flex flex-wrap gap-2">
      <input className={`${input} flex-1`} value={path} onChange={(e) => setPath(e.target.value)} placeholder="Absolute path to a .pcap or .pcapng file" aria-label="Capture file path" />
      <button className={button} disabled={!available || busy || !path || session?.running} onClick={() => void action(async (token) => adopt(await invoke<Session>('buddy_open_file', { path }), token))}>Read recording</button>
    </div>}
    {mode === 'live' && <div className="space-y-2 rounded-lg border border-slate-800 p-3"><div className="flex flex-wrap gap-2">
      <select aria-label="Capture interface" className={`${input} flex-1`} value={iface} onChange={(e) => setIface(e.target.value)} disabled={session?.running}>{interfaces.map((name) => <option key={name} value={name.split('.')[0]}>{name}</option>)}</select>
      <label className="flex items-center gap-2 text-sm">Duration<input type="number" min={1} max={3600} step={1} aria-label="Recording duration in seconds" className={`${input} w-24`} value={duration} onChange={(e) => setDuration(e.target.value)} disabled={session?.running} />seconds</label>
      <button className={button} disabled={!available || liveBlocked || busy || !iface || !validDuration || session?.running} onClick={() => void action(async (token) => adopt(await invoke<Session>('buddy_start', { interface: iface, captureFilter, durationSeconds }), token))}>Start recording</button>
      <button className={button} disabled={busy || !session?.running} onClick={() => void action(async (token) => {
        await invoke('buddy_stop', { sessionId });
        if (workflow.current(token)) { workflow.invalidateView(); setRefresh((v) => v + 1); }
      })}>Finish recording</button>
    </div><div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">{[30, 60, 300, 900].map((seconds) => <button key={seconds} className="rounded border border-slate-700 px-2 py-1 hover:bg-white/10 disabled:opacity-40" disabled={session?.running} onClick={() => setDuration(String(seconds))}>{seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}</button>)}<span>{validDuration ? 'Stops at the selected duration, 32 MiB, or 100,000 packets—whichever comes first.' : 'Enter a whole number from 1 to 3600 seconds.'}</span></div><details className="text-xs text-slate-400"><summary className="cursor-pointer">Advanced recording filter</summary><input className={`${input} mt-2 w-full`} value={captureFilter} onChange={(e) => setCaptureFilter(e.target.value)} disabled={session?.running} placeholder="Optional BPF recording filter, e.g. tcp port 443" aria-label="Capture filter" /></details></div>}
    {session && <details className="text-xs text-slate-400"><summary className="cursor-pointer">Recording file · {(session.bytes / 1024).toFixed(1)} KiB</summary><p className="break-all select-text">{session.path}</p></details>}
    </section>;
  return <div className="flex flex-col gap-3 p-4 h-full min-h-0 overflow-y-auto text-sm text-slate-200 [&_.text-xs]:text-sm">
    <header className="flex flex-wrap justify-between items-center gap-3 rounded-xl border border-slate-700 bg-neutral-950 p-4">
      <div><p className="text-sm font-medium text-slate-300">Capture Buddy</p><h1 className="text-2xl font-semibold tracking-tight text-white">Capture workspace</h1></div>
      <nav aria-label="Capture stages" className="flex flex-wrap gap-2 text-sm"><a className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 hover:border-slate-300" href="#capture-source">Capture</a><a className="rounded-lg border border-slate-500 bg-white/10 px-3 py-2 text-white" href="#capture-investigate">Investigate</a><a className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 hover:border-slate-300" href="#capture-evidence">Evidence</a></nav>
      <span className="rounded-full border border-slate-700 px-3 py-1 text-sm">{session?.running ? 'Recording' : session ? 'Reviewing a recording' : liveBlocked ? 'File review available' : available ? 'Choose a source' : 'Engine unavailable'}</span>
    </header>
    <CaptureInvestigation key={sessionId ?? 'empty'} sessionId={sessionId} onSelectPacket={(number) => void inspect(number)} />
    {recordingSource}
    <section id="capture-evidence" ref={inspectorRef} aria-label="Packet evidence" className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3 shrink-0">
       <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">Evidence{selected !== null ? <span className="text-slate-300"> · Packet {selected}</span> : ''}</h2><div className="flex flex-wrap gap-2">
        <button className={button} aria-expanded={showInspector} onClick={() => setShowInspector(!showInspector)}>{showInspector ? 'Hide packet details' : 'Show packet details'}</button>
        <button className={button} disabled={selected === null || busy} onClick={() => void action(async (token) => {
          setShowInspector(true); setDetail('Dissecting…');
          const result = await invoke<string>('buddy_follow_tcp', { sessionId, number: selected });
          if (workflow.current(token)) setDetail(result);
        }, 'detail')}>Read TCP exchange</button>
        <button className={button} disabled={!session || busy} onClick={() => void action(async (token) => {
          setShowInspector(true); setDetail('Dissecting…');
          const result = await invoke<string>('buddy_statistics', { sessionId });
          if (workflow.current(token)) { setSelected(null); setDetail(result); }
        }, 'detail')}>Summarize recording</button>
      </div></div>
      {!showInspector && <p className="text-sm text-slate-400">Select a packet from the investigation or timeline.</p>}
      {showInspector && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="rounded border border-slate-800 max-h-72 overflow-auto p-3"><h3 className="text-sm font-semibold mb-2">Decoded evidence</h3>
          {selectedPacket && <p className="text-sm text-slate-300 mb-3">{packetMeaning(selectedPacket.protocol)} from <span className="font-mono">{selectedPacket.source}</span> to <span className="font-mono">{selectedPacket.destination}</span>. Protocol evidence is not a safety verdict.</p>}
          <pre role="status" className="text-sm whitespace-pre font-mono select-text">{bytesAt >= 0 ? detail.slice(0, bytesAt) : detail}</pre></section>
        <section className="rounded border border-slate-800 max-h-72 overflow-auto p-3"><h3 className="text-sm font-semibold mb-2">Original bytes</h3><p className="text-sm text-slate-400 mb-2">Recorded hexadecimal and readable characters.</p><pre className="text-sm whitespace-pre font-mono select-text">{bytesAt >= 0 ? detail.slice(bytesAt) : 'No byte view in this evidence.'}</pre></section>
      </div>}
    </section>
    <details className="rounded-lg border border-slate-800 p-3 text-sm text-slate-400">
      <summary className="cursor-pointer">Recording overview{brief ? ` · ${brief.packet_count.toLocaleString()} packets` : ''}</summary>
      <button className={`${button} mt-3`} disabled={!session || busy} onClick={() => void action(async (token) => {
        const result = await invoke<InvestigationBrief>('buddy_investigation_brief', { sessionId });
        if (workflow.current(token)) setBrief(result);
      })}>Build investigation brief</button>
      {brief && <div className="mt-3 space-y-3" aria-label="Investigation brief">
        <p>{brief.captured_bytes.toLocaleString()} B captured · {brief.wire_bytes.toLocaleString()} B on wire · {brief.conversations.length} top conversations</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3"><div><h3 className="font-semibold mb-1">Protocols</h3>{brief.protocols.map(item => <p key={item.label}>{item.label} · {item.count} packets</p>)}</div><div><h3 className="font-semibold mb-1">Top talkers</h3>{brief.talkers.map(item => <p key={item.label} className="font-mono break-all">{item.label} · {item.count}</p>)}</div><div><h3 className="font-semibold mb-1">DNS questions</h3>{brief.dns_questions.length ? brief.dns_questions.map(item => <p key={item} className="break-all">{item}</p>) : <p>None decoded.</p>}</div></div>
        {brief.observations.length > 0 && <div className="text-slate-200 space-y-1"><h3 className="font-semibold">Review notes</h3>{brief.observations.map(note => <p key={note}>{note}</p>)}</div>}
      </div>}
    </details>
    <section className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3" aria-label="Capture Buddy search engine">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Buddy Search</h2><span className="text-sm text-slate-400">Local only · Encrypted content stays encrypted</span></div>
      {session && <p className="text-xs text-slate-400">This page · {page.packets.length} packets · {pageSummary.endpoints} addresses · {pageSummary.bytes.toLocaleString()} B reported packet lengths</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); search(filter); }}>
        <input className={`${input} flex-1`} aria-label="Search recording" placeholder='Search packets — dns, port:443, from:192.0.2.1, or "example.com"' value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className={button} disabled={!session || searchPending}>{searchPending ? 'Searching…' : 'Search recording'}</button>
        <button type="button" className={button} disabled={!session} onClick={() => search('')}>Clear</button>
      </form>
      <div className="flex flex-wrap gap-2">{[['Everything', ''], ['Name lookups', 'dns'], ['TLS records', 'tls'], ['Port 443', 'port:443'], ['Large packets', 'size:>1000']].map(([label, expression]) => <button className={`${button} ${applied === expression ? 'bg-white/10' : ''}`} key={label} disabled={!session} onClick={() => search(expression)}>{label}</button>)}</div>
      <details className="text-xs text-slate-400"><summary className="cursor-pointer">How Buddy Search works</summary><p className="mt-2 leading-relaxed">Combine terms to narrow results: <code>tcp port:443 from:192.0.2.1</code>. Use <code>OR</code> for alternatives and a minus sign to exclude: <code>tcp -port:443</code>. Supported fields: ip, from, to, port, text, size (bytes), time (seconds from recording start). Quote phrases, for example <code>text:"dns query"</code>. Bare words search decoded packet summaries. Queries run directly on the native decoded records. Encrypted content is not decrypted.</p></details>
      {recentSearches.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>Recent searches</span>{recentSearches.map((query) => <button key={query} className="border border-slate-800 rounded px-2 py-1 max-w-64 truncate hover:text-white" title={query} disabled={!session} onClick={() => search(query)}>{query}</button>)}</div>}
      {session && <p className="text-xs text-slate-400" role="status">{searchPending ? 'Searching the recording…' : error ? 'Search results unavailable — see the error above.' : `${page.packets.length} matches on this page${page.has_more ? ' · More matches available' : ''}${applied ? ` · Query: ${applied}` : ' · All packets'}`}</p>}
      {page.translated_filter && <details className="text-xs text-slate-500"><summary className="cursor-pointer">Native search plan</summary><code className="block mt-2 break-all select-text">{page.translated_filter}</code></details>}
    </section>
    <div className="flex flex-wrap justify-between items-center gap-2"><h2 className="text-base font-semibold">Packet timeline</h2><div className="flex gap-2">
      <button className={button} aria-expanded={tableExpanded} onClick={() => setTableExpanded(!tableExpanded)}>{tableExpanded ? 'Standard table' : 'Expand table'}</button>
      <button className={button} disabled={!session || session.running || session.bytes === 0 || busy} onClick={() => setShowSave(!showSave)}>Save recording as…</button>
    </div></div>
    {session?.running && <p className="text-sm text-slate-400">Recording is saved automatically in app storage. Finish recording to save a copy elsewhere.</p>}
    {showSave && session && <form className="rounded border border-slate-700 p-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void action(async (token) => {
      setSaved(null);
      const result = await invoke<{ path: string; bytes: number }>('buddy_save_file', { sessionId, destination: savePath });
      if (workflow.current(token)) setSaved(`Saved ${result.bytes.toLocaleString()} bytes to ${result.path}`);
    }); }}>
      <label className="block text-sm" htmlFor="buddy-save-path">Save the full recording to a new file</label>
      <div className="flex gap-2"><input id="buddy-save-path" className={`${input} flex-1`} value={savePath} onChange={(e) => { setSavePath(e.target.value); setSaved(null); }} placeholder="Full destination path, including .pcapng or .pcap" /><button className={button} disabled={busy || session.running || !savePath.trim()}>Save file</button></div>
      <p className="text-xs text-slate-400">Preserves all packets and original bytes, regardless of the view filter. Existing files are never overwritten.</p>
    </form>}
    {saved && <p role="status" className="text-sm text-slate-200 break-all select-text">{saved}</p>}
    <div className={`overflow-auto shrink-0 border border-slate-700 rounded-lg ${!session ? 'min-h-24' : tableExpanded ? 'h-[72vh] min-h-[400px]' : 'h-[40vh] min-h-[240px]'}`}>
      <table className="w-full min-w-[760px] text-sm text-left leading-relaxed"><thead className="sticky top-0 z-10 bg-neutral-900 text-slate-200 shadow"><tr>{['Observed', 'Communication path', 'What this packet carries', 'Wire size'].map((name) => <th key={name} className="px-4 py-3 font-semibold">{name}</th>)}</tr></thead>
         <tbody>{page.packets.map((packet, index) => <tr key={packet.number} tabIndex={0} aria-selected={selected === packet.number} onClick={() => void inspect(packet.number)} onKeyDown={(e) => { if (e.key === 'Enter') void inspect(packet.number); }} className={`cursor-pointer border-t border-slate-800 focus-visible:outline focus-visible:outline-slate-300 ${selected === packet.number ? 'bg-white/10 text-white' : `${index % 2 ? 'bg-white/[0.03]' : ''} hover:bg-white/10`}`}>
          <td className="p-3 whitespace-nowrap"><span className="block font-mono">{packet.time === 'unavailable' ? 'Time not recorded' : `${Number(packet.time) >= 0 ? '+' : ''}${packet.time}s`}</span><span className="text-slate-500">Packet {packet.number}</span></td>
          <td className="p-3 font-mono"><span className="block">{packet.source || 'Unresolved'}</span><span className="text-slate-400">→ {packet.destination || 'Unresolved'}</span></td>
          <td className="p-3"><span className="font-medium">{packetMeaning(packet.protocol)}</span><span className="block text-slate-400 text-xs max-w-2xl whitespace-normal break-words" title={packet.info}>{packet.info}</span></td>
          <td className="p-3 whitespace-nowrap">{packet.length} B</td>
        </tr>)}</tbody>
      </table>
      {!page.packets.length && <p className="p-6 text-sm text-slate-500">{error || liveBlocked ? 'No new recording is available. Review a saved file, or resolve recording access above.' : session ? 'Nothing matches this view yet. Try Everything or wait for traffic.' : 'Choose a source above. This timeline fills only with packets from your recording.'}</p>}
    </div>
    <div className="flex flex-wrap justify-end gap-2">
       <button className={button} disabled={!after} onClick={() => changePage(0)}>First page</button><button className={button} disabled={!page.has_more} onClick={() => changePage(page.packets.at(-1)?.number ?? 0)}>Next 200</button>
     </div>
    <details className="text-sm text-slate-400"><summary className="cursor-pointer">Analysis engine</summary><p>{engine}</p></details>
  </div>;
}
