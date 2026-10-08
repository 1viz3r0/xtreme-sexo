import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { getBackendReadiness, type BackendReadiness } from '../services/tauri/readiness';

/** Mount once near the host telemetry header or desktop overview. */
export function ReadinessPanel() {
  const [data, setData] = useState<BackendReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const result = await getBackendReadiness();
      if (mounted.current) { setData(result); setError(null); }
    } catch (reason) {
      if (mounted.current) { setData(null); setError(reason instanceof Error ? reason.message : String(reason)); }
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);

  const storageOk = data?.storage.initialized && data.storage.schema_readable && data.storage.read_write_open;
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-gray-300" aria-label="Desktop readiness">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-white">Desktop readiness</h2>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="flex items-center gap-1.5 rounded px-2 py-1 text-cyan-400 hover:bg-white/5 disabled:opacity-50" aria-label="Refresh desktop readiness">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {loading ? 'Checking…' : 'Check'}
        </button>
      </div>
      <div aria-live="polite" className="mt-1">
        {error ? <p className="break-words text-amber-300">{error}</p> : data ? (
          <p>{data.platform} / {data.architecture}{!data.platform_supported && ' (unsupported)'} · Storage {storageOk ? 'readable; read-write open' : 'unavailable or degraded'} · Capture {data.capture.enumeration === 'AVAILABLE' ? `${data.capture.interface_count} interfaces` : 'enumeration unavailable'} · Permission not tested</p>
        ) : <p>Checking local backend…</p>}
      </div>
      {data && (
        <details className="mt-2">
          <summary className="cursor-pointer text-cyan-400">Details{data.last_errors.length > 0 && ` · ${data.last_errors.length} errors`}{data.native_tools.some(tool => !tool.available) && ' · missing tools'}</summary>
          <div className="mt-3 space-y-3">
            <div><h3 className="font-semibold text-white">Storage</h3><p className="break-all">{data.storage.path ?? 'No initialized database path'}</p><p>{data.storage.detail}</p></div>
            <div><h3 className="font-semibold text-white">{data.capture.library}</h3><p>{data.capture.detail}</p></div>
            <div><h3 className="font-semibold text-white">Native tools</h3><ul>{data.native_tools.map(tool => <li key={tool.name} className="break-words" title={tool.path ?? undefined}>{tool.name}: {tool.available ? 'found in PATH' : 'unavailable'} — {tool.purpose}</li>)}</ul></div>
            <div><h3 className="font-semibold text-white">Latest diagnostic errors</h3><p className="text-gray-400">{data.error_scope}</p>{data.last_errors.length ? <ul className="mt-1 space-y-1 text-amber-300">{data.last_errors.map((item, i) => <li key={`${item.source}-${i}`} className="whitespace-pre-wrap break-words">{item.source}: {item.message}</li>)}</ul> : <p>No errors returned by this check.</p>}</div>
            <div><h3 className="font-semibold text-white">Setup guidance</h3><ul className="list-disc space-y-1 pl-4">{data.guidance.map(item => <li key={item}>{item}</li>)}</ul></div>
            <p className="text-gray-500">Checked {new Date(data.checked_at).toLocaleString()} · Passive checks only</p>
          </div>
        </details>
      )}
    </section>
  );
}
