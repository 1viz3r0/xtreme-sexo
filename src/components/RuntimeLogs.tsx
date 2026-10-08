import React, { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { getRecentRuntimeLogs } from '../services/tauri/runtimeLogs';
import type { RecentRuntimeLogs } from '../services/tauri/runtimeLogs';

/** On-demand reads only; operational records contain no packet payloads or secrets. */
export function RuntimeLogs() {
  const [logs, setLogs] = useState<RecentRuntimeLogs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const desktop = isTauriEnvironment();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function refresh() {
    if (!desktop || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await getRecentRuntimeLogs();
      if (mounted.current) setLogs(result);
    } catch {
      if (mounted.current) { setError('Unable to read application logs. Check that the desktop build is up to date.'); setLogs(null); }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const text = logs?.chunks.map(chunk => `# ${chunk.file_id} · ${chunk.modified_at ?? 'unknown time'}\n${chunk.text}`).join('\n') ?? '';
  function download() {
    if (!logs?.status.available || !text) return;
    const header = `NET0ZE operational log snapshot\nCollected: ${logs.status.generated_at}\nTimezone: ${logs.status.timezone}\nBytes read: ${logs.bytes_read}\nTruncated: ${logs.truncated}\n\n`;
    const url = URL.createObjectURL(new Blob([header, text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `netoze-runtime-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="cyber-card p-4 space-y-3" aria-label="Application logs">
    <div className="flex flex-wrap justify-between items-center gap-2">
      <h3 className="font-bold text-white">Application logs</h3>
      <div className="flex gap-2">
        <button type="button" disabled={!desktop || busy} onClick={() => void refresh()} className="px-3 py-1 border border-cyan-800 rounded text-cyan-300 disabled:opacity-40 flex items-center gap-1">
          <RefreshCw size={12} /> {busy ? 'Reading…' : 'Read logs'}
        </button>
        <button type="button" disabled={!logs?.status.available || !text || busy} onClick={download} className="px-3 py-1 border border-cyan-800 rounded text-cyan-300 disabled:opacity-40 flex items-center gap-1">
          <Download size={12} /> Save log
        </button>
      </div>
    </div>
    <p className="text-slate-400">Local operational events only. Packet contents and credentials are excluded. Five 1 MiB files; reads are limited to the latest 64 KiB.</p>
    {!desktop && <p role="status" className="text-amber-300">Open the native desktop app to read its logs.</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {logs && <p role="status" className="text-slate-400">
      {logs.status.available ? `${logs.status.file_count} files · ${logs.status.retained_bytes} retained bytes · ${logs.bytes_read} bytes read · ${logs.status.generated_at}` : logs.status.reason ?? 'File logging unavailable'}
      {logs.truncated && ' · Older records omitted; first line may be partial.'}
    </p>}
    {logs?.status.available && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-[#050b18] p-3 rounded text-slate-300 select-text">{text || 'No operational events recorded yet.'}</pre>}
  </section>;
}
