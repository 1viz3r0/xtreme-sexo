import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { collectHostReport, hostReportJson, hostReportMarkdown, REPORT_LIMITS, type HostReportSnapshot } from '../lib/hostReport';

/** User-triggered only; never starts polling, capture or a network request. */
export function HostReport() {
  const [report, setReport] = useState<HostReportSnapshot | null>(null);
  const [includeIdentifiers, setIncludeIdentifiers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const desktop = isTauriEnvironment();
  useEffect(() => { generation.current += 1; return () => { generation.current += 1; }; }, []);

  async function gather() {
    if (!desktop || inFlight.current) return;
    inFlight.current = true;
    const request = generation.current;
    setBusy(true); setError(null); setReport(null);
    try {
      const result = await collectHostReport(includeIdentifiers);
      if (generation.current === request) setReport(result);
    } catch {
      if (generation.current === request) setError('Unable to collect the local report. No report was exported.');
    } finally {
      inFlight.current = false;
      if (generation.current === request) setBusy(false);
    }
  }
  function changeInclusion(value: boolean) {
    // Never export an old sensitive report after the user turns inclusion off.
    generation.current += 1;
    setIncludeIdentifiers(value); setReport(null); setError(null);
  }
  function download(format: 'json' | 'md') {
    if (!report || busy) return;
    let url: string | undefined;
    try {
      const content = format === 'json' ? hostReportJson(report) : hostReportMarkdown(report);
      url = URL.createObjectURL(new Blob([content], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `netoze-host-${report.collectedAtUtc.replace(/[:.]/g, '-')}.${format}`;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); }
      // Delayed URL release allows the webview/browser download to consume the Blob.
      const downloadUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      url = undefined;
      setError(null);
    } catch {
      setError('Download could not be started. Check webview/browser download permissions and try again.');
    } finally { if (url) URL.revokeObjectURL(url); }
  }
  const preview = report ? hostReportJson(report).slice(0, REPORT_LIMITS.preview) : '';
  return <section className="cyber-card p-4 space-y-3" aria-label="Local host report">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-bold text-white flex items-center gap-2"><FileText size={14} /> Local host report</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!desktop || busy} onClick={() => void gather()} className="px-3 py-1 border border-cyan-800 rounded text-cyan-300 disabled:opacity-40">{busy ? 'Collecting…' : 'Collect report'}</button>
        <button type="button" disabled={!report || busy} onClick={() => download('md')} className="px-3 py-1 border border-cyan-800 rounded text-cyan-300 disabled:opacity-40 flex items-center gap-1"><Download size={12} /> Save Markdown</button>
        <button type="button" disabled={!report || busy} onClick={() => download('json')} className="px-3 py-1 border border-cyan-800 rounded text-cyan-300 disabled:opacity-40 flex items-center gap-1"><Download size={12} /> Save JSON</button>
      </div>
    </div>
    <p className="text-slate-400">On-demand local observations only; no scans, enrichment, packet capture or threat/health assessment. Log contents, tokens and diagnostic messages are excluded. Export uses a local webview/browser download; nothing is uploaded.</p>
    <label className="flex items-start gap-2 text-amber-200">
      <input type="checkbox" checked={includeIdentifiers} disabled={busy || !desktop} onChange={event => changeInclusion(event.target.checked)} className="mt-0.5" />
      <span>Include sensitive identifiers and endpoints in this local report. Warning: hostname, username, IP/MAC, ports, process identifiers and paths may identify you or your network. Review before sharing. Off by default.</span>
    </label>
    {!desktop && <p role="status" className="text-amber-300">Open the native desktop app to collect a host report. No browser telemetry or sample report is available.</p>}
    {desktop && !report && !busy && <p role="status" className="text-slate-400">No snapshot collected. Choose identifier inclusion, then collect.</p>}
    {busy && <p role="status" className="text-slate-400">Reading native sources independently…</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {report && <>
      <p role="status" className="text-slate-400">Collected {report.collectedAtUtc} (UTC) · {report.identifiersIncluded ? 'Sensitive identifiers included' : 'Identifiers redacted'} · {report.sections.map(section => `${section.name}: ${section.status}`).join(' · ')}</p>
      <p className="text-slate-400">{report.provenance} Preview is limited to {REPORT_LIMITS.preview.toLocaleString()} characters; exports include the full bounded snapshot.</p>
      <details><summary className="cursor-pointer text-cyan-300">Preview collected snapshot</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all bg-[#050b18] p-3 rounded text-slate-300 select-text">{preview}{preview.length === REPORT_LIMITS.preview && '\n[Preview capped; see export for remaining fields.]'}</pre></details>
    </>}
  </section>;
}
