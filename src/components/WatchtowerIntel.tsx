import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Crosshair,
  Radar,
  Radio,
  Search,
  ShieldQuestion,
} from 'lucide-react';
import {
  ipIntelSources,
  type IntelPacketRow,
  type IpIntelInvestigation,
  type IpIntelNote,
  type IpIntelRecord,
  type IpIntelScanConfig,
  type IpIntelScanStatus,
  type IpIntelSources,
} from '../services/tauri/ipIntel';
import {
  INTENSITY_OPTIONS,
  INTERVAL_OPTIONS,
  captureFilterForIp,
  filterPacketsForIp,
  formatMs,
  isPcapDestination,
  nextDueLabel,
  osBadge,
  packetStats,
  portSummary,
  relativeAge,
  scanStateLabel,
  sourceBadge,
  type PacketDirectionFilter,
} from '../lib/ipIntelPresentation';

export interface WatchtowerIntelProps {
  /** Injectable only so the workspace is testable without a native runtime. */
  sources?: IpIntelSources;
}

const DEFAULT_SOURCES: IpIntelSources = ipIntelSources;
const NOTE_AUTOSAVE_MS = 700;
const CAPTURE_POLL_MS = 2000;
const CAPTURE_DURATION_MIN = 5;
const CAPTURE_DURATION_MAX = 600;

const cardClass = 'rounded-xl border border-zinc-800 bg-[#0d0f10] p-3.5 sm:p-4';
const inputClass =
  'rounded border border-zinc-700 bg-[#111315] px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-600 focus:outline-none disabled:opacity-50';
const primaryButton =
  'rounded border border-cyan-600/50 px-2.5 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50';
const dangerButton =
  'rounded border border-red-900/60 px-2 py-1 text-xs text-red-300 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50';
const emptyClass =
  'mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-5 text-center text-xs text-zinc-500';
const errorClass = 'mt-3 rounded border border-red-900/70 px-3 py-2 text-xs text-red-300';
const noticeClass = 'mt-3 rounded border border-cyan-900/60 px-3 py-2 text-xs text-cyan-300';

function toneClass(tone: string): string {
  switch (tone) {
    case 'ok':
      return 'text-emerald-300';
    case 'warn':
      return 'text-amber-300';
    case 'error':
      return 'text-red-300';
    case 'medium':
      return 'text-cyan-300';
    case 'low':
      return 'text-amber-300';
    default:
      return 'text-zinc-400';
  }
}

function badge(label: string, tone: string): React.ReactNode {
  const toneMap: Record<string, string> = {
    manual: 'border-zinc-600 text-zinc-300',
    passive: 'border-zinc-700 text-zinc-400',
    traffic: 'border-cyan-800 text-cyan-300',
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${toneMap[tone] ?? 'border-zinc-700 text-zinc-400'}`}>
      {label}
    </span>
  );
}

/** Autosave note editor: debounced, timestamped, restart-persistent. */
function NoteEditor({
  scopeKey,
  note,
  ip,
  draft,
  status,
  onDraftChange,
  onDelete,
  disabled,
}: {
  scopeKey: string;
  note: IpIntelNote | null;
  ip: string | null;
  draft: string;
  status: string;
  onDraftChange: (key: string, id: number | null, ip: string | null, body: string) => void;
  onDelete: (note: IpIntelNote) => void;
  disabled: boolean;
}) {
  const body = draft;
  const canSave = body.trim().length > 0;
  return (
    <div className="rounded-lg border border-zinc-800 bg-[#111315] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {note ? `Note #${note.id} · updated ${new Date(note.updated_at).toLocaleString()}` : ip ? `New note for ${ip}` : 'New general note'}
        </span>
        {note && (
          <button type="button" className={dangerButton} disabled={disabled} onClick={() => onDelete(note)}>
            Delete
          </button>
        )}
      </div>
      <textarea
        className={`${inputClass} mt-2 min-h-[72px] w-full resize-y`}
        value={body}
        disabled={disabled}
        placeholder="Write investigation notes. Changes autosave."
        onChange={(event) => onDraftChange(scopeKey, note?.id ?? null, ip, event.target.value)}
        aria-label={note ? `Edit note ${note.id}` : 'New note text'}
      />
      {status && <p className="mt-1 text-[11px] text-zinc-500">{status}</p>}
      {!status && !canSave && <p className="mt-1 text-[11px] text-zinc-600">Blank notes are not saved.</p>}
    </div>
  );
}

/**
 * Watchtower persistent IP intelligence workspace: passive inventory ingest,
 * bounded auto-scan scheduling (shared Scan Buddy engine), per-IP
 * investigation (existing Capture Buddy engine) and notes.
 */
export function WatchtowerIntel({ sources = DEFAULT_SOURCES }: WatchtowerIntelProps) {
  // Inventory -------------------------------------------------------------
  const [records, setRecords] = useState<IpIntelRecord[] | null>(null);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Auto-scan configuration ----------------------------------------------
  const [status, setStatus] = useState<IpIntelScanStatus | null>(null);
  const [configDraft, setConfigDraft] = useState<IpIntelScanConfig | null>(null);
  const [configSaving, setConfigSaving] = useState(false);

  // Investigation ----------------------------------------------------------
  const [investigation, setInvestigation] = useState<IpIntelInvestigation | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [investigationError, setInvestigationError] = useState<string | null>(null);

  // Notes ------------------------------------------------------------------
  const [generalNotes, setGeneralNotes] = useState<IpIntelNote[] | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteStatus, setNoteStatus] = useState<Record<string, string>>({});
  const noteTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [newNoteDraft, setNewNoteDraft] = useState('');
  const newNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual add -------------------------------------------------------------
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ip: '', label: '', mac: '', hostname: '', vendor: '', enableScan: false });
  const [addBusy, setAddBusy] = useState(false);

  // Per-IP capture (shared Capture Buddy engine) ----------------------------
  const [captureInterfaces, setCaptureInterfaces] = useState<string[] | null>(null);
  const [captureIface, setCaptureIface] = useState('');
  const [captureDuration, setCaptureDuration] = useState(60);
  const [captureDirection, setCaptureDirection] = useState<'in' | 'out' | 'inout'>('inout');
  const [packetDirection, setPacketDirection] = useState<PacketDirectionFilter>('both');
  const [capture, setCapture] = useState<{ ip: string; sessionId: string; running: boolean } | null>(null);
  const [capturePackets, setCapturePackets] = useState<IntelPacketRow[]>([]);
  const [packetDetailView, setPacketDetailView] = useState<{ number: number; dissection: string } | null>(null);
  const [packetDetailBusy, setPacketDetailBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureErrorIp, setCaptureErrorIp] = useState<string | null>(null);
  const [exportDestination, setExportDestination] = useState('');
  const captureRef = useRef<{ sessionId: string } | null>(null);
  const mountedRef = useRef(true);

  const refreshRecords = useCallback(async () => {
    setRefreshing(true);
    setRecordsError(null);
    try {
      const [rows, scanStatus] = await Promise.all([sources.listIps(), sources.getScanStatus()]);
      if (mountedRef.current) {
        setRecords(rows);
        setStatus(scanStatus);
        setConfigDraft(scanStatus.config);
      }
    } catch (error) {
      if (mountedRef.current) setRecordsError(error instanceof Error ? error.message : 'IP inventory is unavailable.');
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [sources]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshRecords();
    void sources.listNotes(null).then(
      (notes) => { if (mountedRef.current) setGeneralNotes(notes); },
      () => { if (mountedRef.current) setGeneralNotes([]); },
    );
    return () => { mountedRef.current = false; };
  }, [refreshRecords, sources]);

  // Investigation loads whenever the selected row changes.
  useEffect(() => {
    if (!selected) { setInvestigation(null); setInvestigationError(null); return; }
    let alive = true;
    setInvestigating(true);
    setInvestigationError(null);
    sources.investigateIp(selected).then(
      (result) => { if (alive) setInvestigation(result); },
      (error) => { if (alive) setInvestigationError(error instanceof Error ? error.message : 'Investigation failed.'); },
    ).finally(() => { if (alive) setInvestigating(false); });
    return () => { alive = false; };
  }, [selected, sources]);

  // Capture interface list loads once.
  useEffect(() => {
    let alive = true;
    sources.listCaptureInterfaces().then(
      (list) => { if (alive && list.length > 0) { setCaptureInterfaces(list); setCaptureIface(list[0].split('.')[0]); } },
      () => { if (alive) setCaptureInterfaces([]); },
    );
    return () => { alive = false; };
  }, [sources]);

  // Live packet polling while a capture runs.
  useEffect(() => {
    if (!capture?.running) return;
    let alive = true;
    const timer = window.setInterval(() => {
      void sources.listCapturePackets(capture.sessionId).then(
        (page) => { if (alive) setCapturePackets(page.packets); },
        () => { /* transient poll errors keep the last good page */ },
      );
    }, CAPTURE_POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, [capture?.running, capture?.sessionId, sources]);

  // Close a still-running capture on unmount.
  useEffect(() => () => {
    const active = captureRef.current;
    if (active) void sources.closeCapture(active.sessionId).catch(() => undefined);
  }, [sources]);

  const filteredRecords = useMemo(() => {
    const rows = records ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [row.ip, row.label, row.hostname, row.vendor, row.mac, row.os_guess, row.source]
        .some((field) => (field ?? '').toLowerCase().includes(needle)),
    );
  }, [records, query]);

  const refreshNotesForScope = useCallback(async (ip: string | null) => {
    if (ip == null) {
      const notes = await sources.listNotes(null);
      if (mountedRef.current) setGeneralNotes(notes);
      return;
    }
    const result = await sources.investigateIp(ip);
    if (mountedRef.current) setInvestigation(result);
  }, [sources]);

  const commitNote = useCallback(async (key: string, id: number | null, ip: string | null, body: string) => {
    try {
      const saved = await sources.saveNote(id, ip, body);
      if (!mountedRef.current) return;
      // Move the draft to persisted state so later edits autosave in place.
      setNoteDrafts((previous) => {
        if (previous[key] === undefined) return previous;
        const next = { ...previous };
        if (saved.body === body.trim()) delete next[key];
        return next;
      });
      setNoteStatus((previous) => ({ ...previous, [key]: `Saved ${new Date().toLocaleTimeString()}` }));
      await refreshNotesForScope(ip).catch(() => undefined);
      if (ip == null) setNewNoteDraft((current) => (current === body ? '' : current));
    } catch (error) {
      if (mountedRef.current) {
        setNoteStatus((previous) => ({
          ...previous,
          [key]: error instanceof Error ? error.message : 'Note could not be saved.',
        }));
      }
    }
  }, [refreshNotesForScope, sources]);

  const onNoteDraftChange = useCallback((key: string, id: number | null, ip: string | null, body: string) => {
    setNoteDrafts((previous) => ({ ...previous, [key]: body }));
    setNoteStatus((previous) => ({ ...previous, [key]: 'Saving…' }));
    const timers = noteTimersRef.current;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(key, setTimeout(() => { timers.delete(key); void commitNote(key, id, ip, body); }, NOTE_AUTOSAVE_MS));
  }, [commitNote]);

  const onNewGeneralNoteChange = useCallback((body: string) => {
    setNewNoteDraft(body);
    if (newNoteTimerRef.current) clearTimeout(newNoteTimerRef.current);
    if (body.trim().length === 0) return;
    newNoteTimerRef.current = setTimeout(() => {
      void commitNote('new-general', null, null, body);
    }, NOTE_AUTOSAVE_MS);
  }, [commitNote]);

  const runRowAction = useCallback(async (action: () => Promise<string>, successMessage: string) => {
    setRowBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const message = await action();
      await refreshRecords();
      if (selected) await refreshNotesForScope(selected).catch(() => undefined);
      if (mountedRef.current) setNotice(message || successMessage);
    } catch (error) {
      if (mountedRef.current) setActionError(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      if (mountedRef.current) setRowBusy(false);
    }
  }, [refreshNotesForScope, refreshRecords, selected]);

  const onAddIp = useCallback(() => {
    void runRowAction(async () => {
      setAddBusy(true);
      try {
        await sources.saveIp({
          ip: addForm.ip.trim(),
          label: addForm.label.trim() || null,
          mac: addForm.mac.trim() || null,
          hostname: addForm.hostname.trim() || null,
          vendor: addForm.vendor.trim() || null,
          scanEnabled: addForm.enableScan ? true : null,
        });
        setAddForm({ ip: '', label: '', mac: '', hostname: '', vendor: '', enableScan: false });
        setShowAdd(false);
        return `${addForm.ip.trim()} saved to the inventory.`;
      } finally {
        setAddBusy(false);
      }
    }, 'IP saved.');
  }, [addForm, runRowAction, sources]);

  const onScanNow = useCallback((ip: string) => {
    void runRowAction(async () => {
      const outcome = await sources.scanIpNow(ip, true);
      const state = scanStateLabel(outcome.state);
      const ports = outcome.open_ports.length > 0 ? ` Open ports: ${outcome.open_ports.join(', ')}.` : ' No open ports observed.';
      return `Scan ${state.label.toLowerCase()} (${outcome.probe_count} probes).${ports}`;
    }, 'Scan finished.');
  }, [runRowAction, sources]);

  const onSetFlags = useCallback((ip: string, excluded: boolean | null, scanEnabled: boolean | null, message: string) => {
    void runRowAction(async () => {
      await sources.setIpFlags(ip, excluded, scanEnabled);
      return message;
    }, message);
  }, [runRowAction, sources]);

  const onRemoveIp = useCallback((ip: string) => {
    void runRowAction(async () => {
      await sources.removeIp(ip);
      if (selected === ip) setSelected(null);
      return `${ip} removed from the inventory (with its notes and scan history).`;
    }, 'IP removed.');
  }, [runRowAction, selected, sources]);

  const onConfigSave = useCallback(() => {
    if (!configDraft) return;
    void runRowAction(async () => {
      setConfigSaving(true);
      try {
        await sources.setScanConfig({
          enabled: configDraft.enabled,
          intervalSeconds: configDraft.interval_seconds,
          intensity: configDraft.intensity,
          maxRunsPerCycle: configDraft.max_runs_per_cycle,
        });
        return 'Auto-scan configuration saved.';
      } finally {
        setConfigSaving(false);
      }
    }, 'Auto-scan configuration saved.');
  }, [configDraft, runRowAction, sources]);

  // Capture controls -------------------------------------------------------
  const startIpCapture = useCallback(async (ip: string) => {
    setCaptureError(null);
    setCaptureErrorIp(null);
    setCapturePackets([]);
    setPacketDetailView(null);
    setCaptureBusy(true);
    const filter = captureFilterForIp(ip);
    if (!captureIface || !filter) {
      setCaptureBusy(false);
      setCaptureErrorIp(ip);
      setCaptureError(captureIface ? 'A valid interface and IP are required.' : 'Select a capture interface first.');
      return;
    }
    const previous = captureRef.current;
    if (previous) await sources.closeCapture(previous.sessionId).catch(() => undefined);
    try {
      const session = await sources.startCapture({
        interface: captureIface,
        captureFilter: filter,
        durationSeconds: Math.min(Math.max(captureDuration, CAPTURE_DURATION_MIN), CAPTURE_DURATION_MAX),
        promiscuous: false,
        direction: captureDirection,
        snapshotLength: 65535,
      });
      if (mountedRef.current) {
        captureRef.current = { sessionId: session.session_id };
        setCapture({ ip, sessionId: session.session_id, running: session.running });
        setExportDestination(`watchtower-${ip}-${new Date().toISOString().replace(/[:.]/g, '-')}.pcap`);
      }
    } catch (error) {
      if (mountedRef.current) {
        captureRef.current = null;
        setCaptureErrorIp(ip);
        setCaptureError(error instanceof Error ? error.message : 'Capture could not start.');
      }
    } finally {
      if (mountedRef.current) setCaptureBusy(false);
    }
  }, [captureDirection, captureDuration, captureIface, sources]);

  const stopIpCapture = useCallback(async () => {
    if (!capture) return;
    setCaptureBusy(true);
    try {
      await sources.stopCapture(capture.sessionId);
      const page = await sources.listCapturePackets(capture.sessionId);
      if (mountedRef.current) {
        setCapturePackets(page.packets);
        setCapture((previous) => (previous && previous.sessionId === capture.sessionId ? { ...previous, running: false } : previous));
      }
    } catch (error) {
      if (mountedRef.current) { setCaptureErrorIp(capture.ip); setCaptureError(error instanceof Error ? error.message : 'Capture could not stop cleanly.'); }
    } finally {
      if (mountedRef.current) setCaptureBusy(false);
    }
  }, [capture, sources]);

  const exportIpCapture = useCallback(async () => {
    if (!capture || capture.running) return;
    const destination = exportDestination.trim();
    if (!isPcapDestination(destination)) {
      setCaptureError('Enter an absolute destination path ending in .pcap or .pcapng.');
      return;
    }
    setCaptureBusy(true);
    setCaptureError(null);
    try {
      const saved = await sources.exportCapture(capture.sessionId, destination);
      if (mountedRef.current) setNotice(`Capture exported to ${saved.path} (${saved.bytes} bytes).`);
    } catch (error) {
      if (mountedRef.current) { setCaptureErrorIp(capture.ip); setCaptureError(error instanceof Error ? error.message : 'Export failed.'); }
    } finally {
      if (mountedRef.current) setCaptureBusy(false);
    }
  }, [capture, exportDestination, sources]);

  const releaseCapture = useCallback(() => {
    const active = captureRef.current;
    if (active) void sources.closeCapture(active.sessionId).catch(() => undefined);
    captureRef.current = null;
    setCapture(null);
    setCapturePackets([]);
    setPacketDetailView(null);
    setCaptureError(null);
    setCaptureErrorIp(null);
  }, [sources]);

  const showPacketDetail = useCallback(async (number: number) => {
    if (!capture) return;
    setPacketDetailBusy(true);
    try {
      const detail = await sources.packetDetail(capture.sessionId, number);
      if (mountedRef.current) setPacketDetailView(detail);
    } catch (error) {
      if (mountedRef.current) { setCaptureErrorIp(capture.ip); setCaptureError(error instanceof Error ? error.message : 'Packet detail unavailable.'); }
    } finally {
      if (mountedRef.current) setPacketDetailBusy(false);
    }
  }, [capture, sources]);

  const investigationNotes = investigation?.notes ?? [];
  const capturePacketsForView = useMemo(
    () => (capture ? filterPacketsForIp(capturePackets, capture.ip, packetDirection) : []),
    [capture, capturePackets, packetDirection],
  );
  const packetSummary = useMemo(() => packetStats(capturePacketsForView), [capturePacketsForView]);

  // ---------------------------------------------------------------- render
  return (
    <section aria-labelledby="watchtower-intel-heading" className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="watchtower-intel-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Radar aria-hidden="true" size={15} className="text-cyan-400" />
            IP intelligence workspace
          </h2>
          <p className="mt-1 text-[11px] text-zinc-500">
            Persistent inventory of observed addresses · passive discovery, traffic flows and kernel neighbours are recorded automatically; active scans run only for addresses you explicitly enable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={secondaryButton} disabled={refreshing} onClick={() => void refreshRecords()}>
            {refreshing ? 'Refreshing…' : 'Refresh inventory'}
          </button>
          <button type="button" className={primaryButton} onClick={() => setShowAdd((value) => !value)}>
            {showAdd ? 'Cancel add' : 'Add IP manually'}
          </button>
        </div>
      </div>

      {notice && <p role="status" className={noticeClass}>{notice}</p>}
      {actionError && <p role="alert" className={errorClass}>{actionError}</p>}
      {recordsError && <p role="alert" className={errorClass}>{recordsError}</p>}

      {/* Auto-scan configuration */}
      {configDraft && (
        <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={configDraft.enabled}
                onChange={(event) => setConfigDraft({ ...configDraft, enabled: event.target.checked })}
                aria-label="Enable automatic scanning of enabled IPs"
              />
              Automatic scanning
            </label>
            <select
              className={inputClass}
              value={configDraft.interval_seconds}
              aria-label="Scan interval"
              onChange={(event) => setConfigDraft({ ...configDraft, interval_seconds: Number(event.target.value) })}
            >
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              className={inputClass}
              value={configDraft.intensity}
              aria-label="Scan intensity"
              onChange={(event) => setConfigDraft({ ...configDraft, intensity: event.target.value })}
            >
              {INTENSITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              per cycle
              <input
                type="number"
                min={1}
                max={16}
                className={`${inputClass} w-16`}
                value={configDraft.max_runs_per_cycle}
                aria-label="Maximum scans per cycle"
                onChange={(event) => setConfigDraft({ ...configDraft, max_runs_per_cycle: Number(event.target.value) })}
              />
            </label>
            <button type="button" className={primaryButton} disabled={configSaving || rowBusy} onClick={onConfigSave}>
              Save schedule
            </button>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {status
              ? `${nextDueLabel(status.next_due_at)} · ${status.due_count} address${status.due_count === 1 ? '' : 'es'} due${status.running ? ` · scanning ${status.current_ip ?? ''}` : ''}${status.last_job_state ? ` · last job: ${scanStateLabel(status.last_job_state).label}` : ''}`
              : 'Schedule status unavailable.'}
            {' '}Recently active hosts are scanned first; failing hosts back off. Off by default.
          </p>
        </div>
      )}

      {/* Manual add */}
      {showAdd && (
        <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={inputClass} placeholder="IP address (required)" value={addForm.ip} aria-label="IP address" onChange={(event) => setAddForm({ ...addForm, ip: event.target.value })} />
            <input className={inputClass} placeholder="Label (optional)" value={addForm.label} aria-label="Label" onChange={(event) => setAddForm({ ...addForm, label: event.target.value })} />
            <input className={inputClass} placeholder="MAC (optional)" value={addForm.mac} aria-label="MAC address" onChange={(event) => setAddForm({ ...addForm, mac: event.target.value })} />
            <input className={inputClass} placeholder="Hostname (optional)" value={addForm.hostname} aria-label="Hostname" onChange={(event) => setAddForm({ ...addForm, hostname: event.target.value })} />
            <input className={inputClass} placeholder="Vendor (optional)" value={addForm.vendor} aria-label="Vendor" onChange={(event) => setAddForm({ ...addForm, vendor: event.target.value })} />
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={addForm.enableScan}
                onChange={(event) => setAddForm({ ...addForm, enableScan: event.target.checked })}
                aria-label="Authorize automatic scanning for this IP"
              />
              Authorize auto-scan
            </label>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={primaryButton} disabled={addBusy || rowBusy || !addForm.ip.trim()} onClick={onAddIp}>
              Save IP
            </button>
            <span className="text-[11px] text-zinc-500">Enabling auto-scan here records your explicit authorization for this address.</span>
          </div>
        </div>
      )}

      {/* Inventory */}
      <div className="relative">
        <Search aria-hidden="true" size={13} className="pointer-events-none absolute left-2.5 top-2.5 text-zinc-600" />
        <input
          className={`${inputClass} w-full pl-8`}
          placeholder="Search by IP, label, hostname, vendor, OS or source…"
          value={query}
          aria-label="Search IP inventory"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {records === null ? (
        <p role="status" className={emptyClass}>{recordsError ? 'Inventory unavailable.' : 'Loading IP inventory…'}</p>
      ) : filteredRecords.length === 0 ? (
        <p role="status" className={emptyClass}>
          {records.length === 0
            ? 'No IPs recorded yet. Open a live view (Overview/Watchtower) or run local discovery and observed addresses will appear here.'
            : 'No inventory rows match the current search.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <caption className="sr-only">Persistent IP intelligence inventory</caption>
            <thead className="text-zinc-500">
              <tr>
                {['IP', 'Label / host', 'MAC', 'Vendor', 'OS (inference)', 'Ports', 'Activity', 'Source', 'Scan', 'Actions'].map((heading) => (
                  <th key={heading} scope="col" className="px-2 pb-2 font-medium">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredRecords.map((row) => {
                const os = osBadge(row.os_confidence, row.os_guess);
                const origin = sourceBadge(row.source, row.origin);
                const scanState = scanStateLabel(row.last_scan_state);
                const isSelected = selected === row.ip;
                return (
                  <React.Fragment key={row.ip}>
                    <tr className={isSelected ? 'bg-cyan-950/20 text-zinc-200' : 'text-zinc-300'}>
                      <td className="px-2 py-2 font-mono">{row.ip}</td>
                      <td className="px-2 py-2">{row.label || row.hostname || '—'}{row.excluded ? <span className="ml-1 text-[10px] text-red-300">excluded</span> : null}</td>
                      <td className="px-2 py-2 font-mono">{row.mac || '—'}</td>
                      <td className="px-2 py-2">{row.vendor || '—'}</td>
                      <td className={`px-2 py-2 ${toneClass(os.kind)}`}>{os.text}</td>
                      <td className="px-2 py-2 font-mono">{portSummary(row.open_ports)}</td>
                      <td className="px-2 py-2">
                        {relativeAge(row.last_seen)}
                        <span className="ml-1 text-zinc-600">· {row.packet_count} pkt</span>
                      </td>
                      <td className="px-2 py-2">{badge(origin.label, origin.tone)}</td>
                      <td className="px-2 py-2">
                        <span className={toneClass(scanState.tone)}>{scanState.label}</span>
                        {row.scan_enabled && <span className="ml-1 text-[10px] text-cyan-300">auto</span>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <button type="button" className={secondaryButton} disabled={rowBusy} onClick={() => setSelected(isSelected ? null : row.ip)}>
                            {isSelected ? 'Close' : 'Investigate'}
                          </button>
                          <button
                            type="button"
                            className={secondaryButton}
                            disabled={rowBusy || row.excluded}
                            onClick={() => onScanNow(row.ip)}
                            title="Run one bounded, authorized scan now (shared Scan Buddy engine)"
                          >
                            Scan now
                          </button>
                          {row.scan_enabled ? (
                            <button type="button" className={secondaryButton} disabled={rowBusy} onClick={() => onSetFlags(row.ip, null, false, `Auto-scan disabled for ${row.ip}.`)}>
                              Disable auto
                            </button>
                          ) : (
                            <button type="button" className={secondaryButton} disabled={rowBusy} onClick={() => onSetFlags(row.ip, null, true, `Auto-scan authorized for ${row.ip}.`)}>
                              Enable auto
                            </button>
                          )}
                          <button type="button" className={row.excluded ? secondaryButton : dangerButton} disabled={rowBusy} onClick={() => onSetFlags(row.ip, !row.excluded, null, row.excluded ? `${row.ip} re-included.` : `${row.ip} excluded from all scanning.`)}>
                            {row.excluded ? 'Include' : 'Exclude'}
                          </button>
                          <button type="button" className={dangerButton} disabled={rowBusy} onClick={() => onRemoveIp(row.ip)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isSelected && (
                      <tr>
                        <td colSpan={10} className="px-2 pb-4">
                          <InvestigationPanel
                            investigation={investigation}
                            investigating={investigating}
                            investigationError={investigationError}
                            notes={investigationNotes}
                            noteDrafts={noteDrafts}
                            noteStatus={noteStatus}
                            onNoteDraftChange={onNoteDraftChange}
                            onDeleteNote={(note) => void runRowAction(async () => {
                              await sources.deleteNote(note.id);
                              await refreshNotesForScope(row.ip);
                              return `Note #${note.id} deleted.`;
                            }, 'Note deleted.')}
                            rowBusy={rowBusy}
                            // Capture
                            captureInterfaces={captureInterfaces}
                            captureIface={captureIface}
                            setCaptureIface={setCaptureIface}
                            captureDuration={captureDuration}
                            setCaptureDuration={setCaptureDuration}
                            captureDirection={captureDirection}
                            setCaptureDirection={setCaptureDirection}
                            packetDirection={packetDirection}
                            setPacketDirection={setPacketDirection}
                            capture={capture && capture.ip === row.ip ? capture : null}
                            capturePackets={capture && capture.ip === row.ip ? capturePacketsForView : []}
                            packetSummary={packetSummary}
                            packetDetail={capture && capture.ip === row.ip ? packetDetailView : null}
                            packetDetailBusy={capture && capture.ip === row.ip ? packetDetailBusy : false}
                            onShowPacketDetail={showPacketDetail}
                            captureBusy={captureBusy}
                            captureError={captureError && captureErrorIp === row.ip ? captureError : null}
                            exportDestination={exportDestination}
                            setExportDestination={setExportDestination}
                            onStartCapture={() => void startIpCapture(row.ip)}
                            onStopCapture={() => void stopIpCapture()}
                            onExportCapture={() => void exportIpCapture()}
                            onReleaseCapture={releaseCapture}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* General notes workspace */}
      <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <ClipboardList aria-hidden="true" size={14} className="text-cyan-400" />
            General investigation notes
          </h3>
          <span className="text-[11px] text-zinc-500">Autosaved · retained across restarts</span>
        </div>
        <NoteEditor
          scopeKey="new-general"
          note={null}
          ip={null}
          draft={newNoteDraft}
          status={noteStatus['new-general'] ?? ''}
          onDraftChange={(key, _id, ip, body) => {
            if (key === 'new-general' && ip == null) onNewGeneralNoteChange(body);
          }}
          onDelete={() => undefined}
          disabled={rowBusy}
        />
        <div className="mt-2 space-y-2">
          {(generalNotes ?? []).map((note) => (
            <NoteEditor
              key={note.id}
              scopeKey={`note-${note.id}`}
              note={note}
              ip={note.ip}
              draft={noteDrafts[`note-${note.id}`] ?? note.body}
              status={noteStatus[`note-${note.id}`] ?? ''}
              onDraftChange={onNoteDraftChange}
              onDelete={(target) => void runRowAction(async () => {
                await sources.deleteNote(target.id);
                await refreshNotesForScope(null);
                return `Note #${target.id} deleted.`;
              }, 'Note deleted.')}
              disabled={rowBusy}
            />
          ))}
          {generalNotes !== null && generalNotes.length === 0 && (
            <p role="status" className="text-[11px] text-zinc-600">No general notes yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Expandable per-IP investigation panel with capture controls. */
function InvestigationPanel({
  investigation,
  investigating,
  investigationError,
  notes,
  noteDrafts,
  noteStatus,
  onNoteDraftChange,
  onDeleteNote,
  rowBusy,
  captureInterfaces,
  captureIface,
  setCaptureIface,
  captureDuration,
  setCaptureDuration,
  captureDirection,
  setCaptureDirection,
  packetDirection,
  setPacketDirection,
  capture,
  capturePackets,
  packetSummary,
  packetDetail,
  packetDetailBusy,
  onShowPacketDetail,
  captureBusy,
  captureError,
  exportDestination,
  setExportDestination,
  onStartCapture,
  onStopCapture,
  onExportCapture,
  onReleaseCapture,
}: {
  investigation: IpIntelInvestigation | null;
  investigating: boolean;
  investigationError: string | null;
  notes: IpIntelNote[];
  noteDrafts: Record<string, string>;
  noteStatus: Record<string, string>;
  onNoteDraftChange: (key: string, id: number | null, ip: string | null, body: string) => void;
  onDeleteNote: (note: IpIntelNote) => void;
  rowBusy: boolean;
  captureInterfaces: string[] | null;
  captureIface: string;
  setCaptureIface: (value: string) => void;
  captureDuration: number;
  setCaptureDuration: (value: number) => void;
  captureDirection: 'in' | 'out' | 'inout';
  setCaptureDirection: (value: 'in' | 'out' | 'inout') => void;
  packetDirection: PacketDirectionFilter;
  setPacketDirection: (value: PacketDirectionFilter) => void;
  capture: { ip: string; sessionId: string; running: boolean } | null;
  capturePackets: IntelPacketRow[];
  packetSummary: ReturnType<typeof packetStats>;
  packetDetail: { number: number; dissection: string } | null;
  packetDetailBusy: boolean;
  onShowPacketDetail: (number: number) => void;
  captureBusy: boolean;
  captureError: string | null;
  exportDestination: string;
  setExportDestination: (value: string) => void;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onExportCapture: () => void;
  onReleaseCapture: () => void;
}) {
  const record = investigation?.record;
  return (
    <div className="mt-2 space-y-3 rounded-lg border border-cyan-900/40 bg-[#0a0c0d] p-3">
      {investigating && <p role="status" className="text-xs text-zinc-500">Loading investigation…</p>}
      {investigationError && <p role="alert" className={errorClass}>{investigationError}</p>}
      {!investigating && !investigation && !investigationError && (
        <p role="status" className={emptyClass}>Investigation data unavailable.</p>
      )}
      {record && investigation && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            {/* Identity + activity */}
            <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Identity · detected</h4>
              <dl className="mt-2 space-y-1 text-zinc-400">
                <div><dt className="inline text-zinc-600">IP: </dt><dd className="inline font-mono text-zinc-200">{record.ip}</dd></div>
                <div><dt className="inline text-zinc-600">Label: </dt><dd className="inline">{record.label ?? '—'}</dd></div>
                <div><dt className="inline text-zinc-600">MAC: </dt><dd className="inline font-mono">{record.mac ?? 'Unknown'}</dd></div>
                <div><dt className="inline text-zinc-600">Hostname: </dt><dd className="inline">{record.hostname ?? 'Unknown'}</dd></div>
                <div><dt className="inline text-zinc-600">Vendor: </dt><dd className="inline">{record.vendor ?? 'Unknown'}</dd></div>
                <div><dt className="inline text-zinc-600">Interface: </dt><dd className="inline">{record.interface ?? 'Unknown'}</dd></div>
                <div><dt className="inline text-zinc-600">First seen: </dt><dd className="inline">{formatMs(record.first_seen)}</dd></div>
                <div><dt className="inline text-zinc-600">Last seen: </dt><dd className="inline">{formatMs(record.last_seen)}</dd></div>
                <div><dt className="inline text-zinc-600">Activity: </dt><dd className="inline">{record.packet_count} packets · {record.byte_count} bytes · {record.flow_count} flows</dd></div>
                <div><dt className="inline text-zinc-600">Source: </dt><dd className="inline">{record.source} ({record.origin})</dd></div>
              </dl>
            </div>
            {/* Geolocation + DNS */}
            <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Geolocation &amp; DNS</h4>
              {investigation.geoip ? (
                <dl className="mt-2 space-y-1 text-zinc-400">
                  <div><dt className="inline text-zinc-600">Country: </dt><dd className="inline text-zinc-200">{investigation.geoip.country} ({investigation.geoip.country_code})</dd></div>
                  <div><dt className="inline text-zinc-600">City: </dt><dd className="inline">{investigation.geoip.city || '—'}</dd></div>
                  <div><dt className="inline text-zinc-600">ASN / org: </dt><dd className="inline">{investigation.geoip.asn ?? '—'} {investigation.geoip.org ?? ''}</dd></div>
                  <div><dt className="inline text-zinc-600">Coordinates: </dt><dd className="inline">{investigation.geoip.latitude ?? '—'}, {investigation.geoip.longitude ?? '—'}</dd></div>
                </dl>
              ) : (
                <p className="mt-2 text-[11px] text-zinc-500">{investigation.geoip_note}</p>
              )}
              <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">DNS observations</h4>
              {investigation.dns_records.length === 0 ? (
                <p className="mt-1 text-[11px] text-zinc-600">No DNS records involve this address.</p>
              ) : (
                <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto font-mono text-[11px] text-zinc-400">
                  {investigation.dns_records.slice(0, 20).map((entry, index) => (
                    <li key={`${entry.timestamp}-${entry.qname}-${index}`}>
                      {entry.qname} <span className="text-zinc-600">({entry.client_ip === record.ip ? 'client' : 'server'} · {entry.qtype})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* OS inference + scan state */}
            <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
              <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <ShieldQuestion aria-hidden="true" size={12} />
                OS fingerprint · inferred
              </h4>
              {(() => {
                const os = osBadge(record.os_confidence, record.os_guess);
                return (
                  <>
                    <p className={`mt-2 ${toneClass(os.kind)}`}>{os.text}</p>
                    <p className="mt-1 break-words text-[11px] text-zinc-500">
                      Basis: {record.os_basis || 'no fingerprint evidence'}. Inference only — never a verified OS identification.
                    </p>
                  </>
                );
              })()}
              <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Scan state</h4>
              <dl className="mt-2 space-y-1 text-zinc-400">
                <div><dt className="inline text-zinc-600">Auto-scan: </dt><dd className="inline">{record.scan_enabled ? 'Authorized' : 'Not authorized'}</dd></div>
                <div><dt className="inline text-zinc-600">Scheduled: </dt><dd className="inline">{investigation.scan_eligible ? 'Yes' : 'No'}</dd></div>
                <div><dt className="inline text-zinc-600">Last scan: </dt><dd className="inline">{formatMs(record.last_scan_at)} {scanStateLabel(record.last_scan_state).label}</dd></div>
                <div><dt className="inline text-zinc-600">Failures: </dt><dd className="inline">{record.scan_failures}</dd></div>
              </dl>
            </div>
          </div>

          {/* Ports & services + scan history */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
              <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <Crosshair aria-hidden="true" size={12} />
                Ports &amp; services · detected
              </h4>
              {investigation.port_scan.length === 0 ? (
                <p className="mt-2 text-[11px] text-zinc-600">
                  No port/service records. Saved inventory ports: {portSummary(record.open_ports)}.
                </p>
              ) : (
                <table className="mt-2 w-full text-left text-[11px]">
                  <thead className="text-zinc-600">
                    <tr>{['Port', 'Protocol', 'State', 'Service', 'Last seen'].map((heading) => <th key={heading} className="pb-1 font-medium">{heading}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {investigation.port_scan.slice(0, 30).map((entry) => (
                      <tr key={`${entry.port}-${entry.protocol}-${entry.state}`} className="text-zinc-400">
                        <td className="py-1 font-mono text-zinc-200">{entry.port}</td>
                        <td className="py-1">{entry.protocol}</td>
                        <td className={`py-1 ${entry.state === 'OPEN' ? 'text-emerald-300' : 'text-zinc-500'}`}>{entry.state}</td>
                        <td className="py-1">{entry.service || '—'}</td>
                        <td className="py-1">{formatMs(entry.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
              <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Scan history</h4>
              {investigation.scan_history.length === 0 ? (
                <p className="mt-2 text-[11px] text-zinc-600">No scans recorded for this address.</p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px]">
                  {investigation.scan_history.map((entry) => {
                    const state = scanStateLabel(entry.state);
                    return (
                      <li key={entry.id} className="flex items-center justify-between gap-2 text-zinc-400">
                        <span>{formatMs(entry.started_at)}</span>
                        <span className="text-zinc-600">{entry.trigger}</span>
                        <span className={toneClass(state.tone)}>{state.label}</span>
                        <span className="font-mono">{entry.open_ports?.length ? entry.open_ports.join(',') : '—'}</span>
                        {entry.error && <span className="text-red-300" title={entry.error}>!</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Per-IP notes */}
          <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3">
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              <ClipboardList aria-hidden="true" size={12} />
              Notes for {record.ip}
            </h4>
            <div className="mt-2 space-y-2">
              <NoteEditor
                scopeKey={`new-${record.ip}`}
                note={null}
                ip={record.ip}
                draft={noteDrafts[`new-${record.ip}`] ?? ''}
                status={noteStatus[`new-${record.ip}`] ?? ''}
                onDraftChange={onNoteDraftChange}
                onDelete={() => undefined}
                disabled={rowBusy}
              />
              {notes.map((note) => (
                <NoteEditor
                  key={note.id}
                  scopeKey={`note-${note.id}`}
                  note={note}
                  ip={note.ip}
                  draft={noteDrafts[`note-${note.id}`] ?? note.body}
                  status={noteStatus[`note-${note.id}`] ?? ''}
                  onDraftChange={onNoteDraftChange}
                  onDelete={onDeleteNote}
                  disabled={rowBusy}
                />
              ))}
              {notes.length === 0 && <p className="text-[11px] text-zinc-600">No notes attached to this address yet.</p>}
            </div>
          </div>

          {/* Per-IP capture via the shared Capture Buddy engine */}
          <div className="rounded-lg border border-zinc-800 bg-[#111315] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                <Radio aria-hidden="true" size={12} />
                Packet capture · {record.ip}
              </h4>
              <span className="font-mono text-[11px] text-cyan-300">{captureFilterForIp(record.ip)}</span>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">
              BPF-restricted to this host only — unrelated traffic is not captured. Runs on the existing Capture Buddy engine.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select className={inputClass} value={captureIface} aria-label="Capture interface" onChange={(event) => setCaptureIface(event.target.value)}>
                {(captureInterfaces ?? []).map((name) => <option key={name} value={name.split('.')[0]}>{name}</option>)}
                {captureInterfaces !== null && captureInterfaces.length === 0 && <option value="">No interfaces</option>}
              </select>
              <select className={inputClass} value={captureDirection} aria-label="Capture direction" onChange={(event) => setCaptureDirection(event.target.value as 'in' | 'out' | 'inout')}>
                <option value="inout">In + out</option>
                <option value="in">In only</option>
                <option value="out">Out only</option>
              </select>
              <label className="flex items-center gap-1.5 text-zinc-400">
                duration s
                <input
                  type="number"
                  min={CAPTURE_DURATION_MIN}
                  max={CAPTURE_DURATION_MAX}
                  className={`${inputClass} w-20`}
                  value={captureDuration}
                  aria-label="Capture duration seconds"
                  onChange={(event) => setCaptureDuration(Number(event.target.value))}
                />
              </label>
              {!capture || capture.ip !== record.ip ? (
                <button type="button" className={primaryButton} disabled={captureBusy || !captureIface} onClick={onStartCapture}>
                  {captureBusy ? 'Starting…' : 'Start capture'}
                </button>
              ) : (
                <>
                  {capture.running ? (
                    <button type="button" className={secondaryButton} disabled={captureBusy} onClick={onStopCapture}>
                      {captureBusy ? 'Stopping…' : 'Stop capture'}
                    </button>
                  ) : (
                    <button type="button" className={dangerButton} disabled={captureBusy} onClick={onReleaseCapture}>
                      Close session
                    </button>
                  )}
                  <span className={capture.running ? 'text-amber-300' : 'text-zinc-500'}>{capture.running ? 'Capturing…' : 'Capture finished'}</span>
                </>
              )}
            </div>
            {captureError && <p role="alert" className={errorClass}>{captureError}</p>}
            {capture && capture.ip === record.ip && (
              <>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(['both', 'src', 'dst'] as PacketDirectionFilter[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={packetDirection === mode}
                      className={`${secondaryButton} ${packetDirection === mode ? 'border-cyan-600 text-cyan-300' : ''}`}
                      onClick={() => setPacketDirection(mode)}
                    >
                      {mode === 'both' ? 'Src or dst' : mode === 'src' ? 'Src only' : 'Dst only'}
                    </button>
                  ))}
                  <span className="text-[11px] text-zinc-500">
                    {packetSummary.count} packets · {packetSummary.bytes} bytes
                    {packetSummary.protocols[0] ? ` · top protocol ${packetSummary.protocols[0].protocol} (${packetSummary.protocols[0].count})` : ''}
                  </span>
                </div>
                {capturePackets.length === 0 ? (
                  <p role="status" className={emptyClass}>
                    {capture.running ? 'No matching packets captured yet.' : 'No packets recorded in this session.'}
                  </p>
                ) : (
                  <div className="mt-2 max-h-64 overflow-auto rounded border border-zinc-800">
                    <table className="w-full min-w-[640px] text-left text-[11px]">
                      <thead className="sticky top-0 bg-[#111315] text-zinc-500">
                        <tr>{['#', 'Time', 'Source', 'Destination', 'Protocol', 'Length', 'Info'].map((heading) => <th key={heading} className="px-2 py-1 font-medium">{heading}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800 text-zinc-400">
                        {capturePackets.slice(0, 300).map((packet) => (
                          <tr
                            key={packet.number}
                            className={`cursor-pointer hover:bg-[#0d1418] ${packetDetail?.number === packet.number ? 'bg-[#0d1a20]' : ''}`}
                            onClick={() => onShowPacketDetail(packet.number)}
                          >
                            <td className="px-2 py-1 font-mono">{packet.number}</td>
                            <td className="px-2 py-1 font-mono">{packet.time}</td>
                            <td className="px-2 py-1 font-mono">{packet.source}</td>
                            <td className="px-2 py-1 font-mono">{packet.destination}</td>
                            <td className="px-2 py-1">{packet.protocol}</td>
                            <td className="px-2 py-1 font-mono">{packet.length}</td>
                            <td className="px-2 py-1">{packet.info}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {packetDetailBusy && <p role="status" className="mt-2 text-xs text-zinc-500">Dissecting packet…</p>}
                {packetDetail && !packetDetailBusy && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded border border-cyan-900/40 bg-black p-2 font-mono text-[11px] text-cyan-200">{packetDetail.dissection}</pre>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className={`${inputClass} flex-1`}
                    placeholder="Absolute path ending in .pcap or .pcapng"
                    value={exportDestination}
                    aria-label="PCAP export destination"
                    onChange={(event) => setExportDestination(event.target.value)}
                  />
                  <button type="button" className={primaryButton} disabled={captureBusy || capture.running || !isPcapDestination(exportDestination)} onClick={onExportCapture}>
                    Export PCAP
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default WatchtowerIntel;
