import React, { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauriEnvironment } from '../services/tauri/isTauri'
import { captureDurationError, captureBuddyMasteryStepAt, CAPTURE_BUDDY_MASTERY_STEPS } from '../lib/captureBuddyMastery'
import { awardLabBadge } from '../lib/labBadges'

export interface CaptureBuddyEngineStatus { available: boolean; detail: string; live_capture_blocked: boolean; capture_guidance: string | null; visibility_scope: string; visibility_note: string }
export interface CaptureBuddySession { session_id: string; path: string; running: boolean; bytes: number }
export interface CaptureBuddyBrief { packet_count: number; captured_bytes: number; wire_bytes: number; protocols: Array<{ label: string; count: number; bytes: number }>; observations: string[] }
export interface CaptureBuddyMiniPanelService {
  engineStatus: () => Promise<CaptureBuddyEngineStatus>
  interfaces: () => Promise<string[]>
  start: (input: { interface: string; durationSeconds: number }) => Promise<CaptureBuddySession>
  stop: (sessionId: string) => Promise<void>
  status: (sessionId: string) => Promise<CaptureBuddySession>
  brief: (sessionId: string) => Promise<CaptureBuddyBrief>
}

const nativeService: CaptureBuddyMiniPanelService = {
  engineStatus: () => invoke<CaptureBuddyEngineStatus>('buddy_engine_status'),
  interfaces: () => invoke<string[]>('buddy_interfaces'),
  start: input => invoke<CaptureBuddySession>('buddy_start', { interface: input.interface, captureFilter: '', durationSeconds: input.durationSeconds, promiscuous: false, direction: 'inout', snapshotLength: 65535, maxBytes: 4 * 1024 * 1024, maxPackets: 5000 }),
  stop: sessionId => invoke('buddy_stop', { sessionId }),
  status: sessionId => invoke<CaptureBuddySession>('buddy_session_status', { sessionId }),
  brief: sessionId => invoke<CaptureBuddyBrief>('buddy_investigation_brief', { sessionId }),
}

const button = 'inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-40'
const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100'

export interface CaptureBuddyMiniPanelProps { service?: CaptureBuddyMiniPanelService; available?: boolean; className?: string; profileScope?: string }
export interface CaptureBuddyMasteryLabProps extends CaptureBuddyMiniPanelProps { initialStep?: number }

export function CaptureBuddyMiniPanel({ service = nativeService, available = isTauriEnvironment(), className = '', profileScope = 'guest' }: CaptureBuddyMiniPanelProps) {
  const [engine, setEngine] = useState<CaptureBuddyEngineStatus | null>(null)
  const [interfaces, setInterfaces] = useState<string[]>([])
  const [iface, setIface] = useState('')
  const [duration, setDuration] = useState('60')
  const [authorized, setAuthorized] = useState(false)
  const [session, setSession] = useState<CaptureBuddySession | null>(null)
  const [brief, setBrief] = useState<CaptureBuddyBrief | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const durationError = captureDurationError(duration)
  useEffect(() => {
    if (!available) return
    let cancelled = false
    void service.engineStatus().then(value => { if (!cancelled) { setEngine(value); if (value.available) void service.interfaces().then(items => { if (!cancelled) { setInterfaces(items); setIface(items[0]?.split('.')[0] ?? '') } }) } }).catch(value => { if (!cancelled) setError(String(value)) })
    return () => { cancelled = true }
  }, [available, service])
  const run = async (operation: () => Promise<void>) => { setBusy(true); setError(null); try { await operation() } catch (value) { setError(value instanceof Error ? value.message : String(value)) } finally { setBusy(false) } }
  const running = session?.running === true
  const ready = available && engine?.available === true && !engine.live_capture_blocked && !!iface && !durationError && authorized
  useEffect(() => { if (brief) awardLabBadge('capture-buddy-challenge', profileScope) }, [brief, profileScope])
  return <aside className={`rounded-2xl border border-slate-700 bg-slate-950/90 p-4 shadow-xl ${className}`} aria-label="Capture Buddy mini panel">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.18em] text-slate-500">Hands-on panel</p><h2 className="mt-1 font-semibold text-white">Capture Buddy</h2></div><span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300">{available && engine?.available ? 'Native ready' : 'Desktop required'}</span></div>
    {!available && <p role="status" className="mt-3 rounded-lg border border-slate-700 bg-white/5 p-3 text-xs text-slate-300">Open the desktop app to check readiness and use real Capture Buddy data. No simulated packets are shown.</p>}
    <div className="mt-4 space-y-3">
      <label className="block text-xs text-slate-400">Authorized local interface<select aria-label="Tutorial capture interface" className={`${field} mt-1`} value={iface} onChange={event => { setIface(event.target.value); setAuthorized(false) }} disabled={!available || running || busy}><option value="">Choose an interface</option>{interfaces.map(item => <option key={item} value={item.split('.')[0]}>{item}</option>)}</select></label>
      <label className="block text-xs text-slate-400">Bounded duration (seconds)<input aria-label="Tutorial capture duration" className={`${field} mt-1`} value={duration} onChange={event => { setDuration(event.target.value); setAuthorized(false) }} disabled={!available || running || busy} inputMode="numeric" /></label>
      {durationError && <p role="alert" className="text-xs text-amber-200">{durationError}</p>}
      <p className="text-xs leading-5 text-slate-500">{engine?.visibility_scope ?? 'Selected local interface'}. {engine?.visibility_note ?? 'Only traffic delivered to the selected interface is eligible.'}</p>
      <label className="flex gap-2 rounded-lg border border-slate-700 bg-white/5 p-3 text-xs text-slate-300"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} disabled={!available || running || busy} className="mt-0.5" />I have explicit authorization to observe this interface for this bounded capture.</label>
      <div className="flex gap-2"><button className={`${button} flex-1 bg-white text-slate-950`} disabled={!ready || busy || running} onClick={() => void run(async () => setSession(await service.start({ interface: iface, durationSeconds: Number(duration) })))}>{busy ? 'Working…' : 'Start bounded capture'}</button>{running && <button className={button} disabled={busy} onClick={() => void run(async () => { await service.stop(session.session_id); setSession(await service.status(session.session_id)) })}>Finish capture</button>}</div>
      {!running && session && <button className={`${button} w-full`} disabled={busy || session.bytes === 0} onClick={() => void run(async () => setBrief(await service.brief(session.session_id)))}>Build evidence brief</button>}
      {error && <p role="alert" className="rounded-lg border border-slate-700 p-2 text-xs text-slate-200">{error}</p>}
      {session && <p role="status" className="text-xs text-slate-400">Native session: {running ? 'recording' : 'ready for review'} · {session.bytes.toLocaleString()} bytes</p>}
       <section aria-label="Observe in the live panel" className="rounded-lg border border-slate-700 bg-white/[.03] p-3 text-xs"><h3 className="font-semibold text-white">Observe in the live panel</h3>{!available && <p className="mt-1 leading-5 text-slate-400">Browser mode has no native capture source. There are no packets, interfaces, or readiness claims to observe here.</p>}{available && !engine && <p className="mt-1 leading-5 text-slate-400">Checking native engine readiness…</p>}{available && engine && <ul className="mt-2 space-y-1 text-slate-400"><li>Engine: <span className="text-slate-200">{engine.available ? 'available' : 'unavailable'}</span></li><li>Scope: <span className="text-slate-200">{engine.visibility_scope}</span></li><li>{engine.visibility_note}</li>{engine.capture_guidance && <li>{engine.capture_guidance}</li>}</ul>}{session && <p className="mt-2 text-slate-300">Native session is {running ? 'recording' : 'stopped'} with {session.bytes.toLocaleString()} captured bytes.</p>}</section>
       {brief && <section aria-label="Capture evidence brief" className="rounded-lg border border-slate-700 p-3 text-xs"><h3 className="font-semibold text-white">Evidence review</h3><p className="mt-1 text-slate-300">{brief.packet_count.toLocaleString()} packets · {brief.captured_bytes.toLocaleString()} captured bytes · {brief.wire_bytes.toLocaleString()} wire bytes · {brief.protocols.length} protocols</p><ul className="mt-2 list-disc space-y-1 pl-4 text-slate-400">{brief.protocols.map(item => <li key={item.label}>{item.label}: {item.count.toLocaleString()} packets, {item.bytes.toLocaleString()} bytes</li>)}{brief.observations.map(item => <li key={item}>{item}</li>)}</ul><p className="mt-2 text-slate-500">Metadata only; review sensitive endpoints before reporting. This panel never creates packet evidence.</p></section>}
    </div>
  </aside>
}

export function CaptureBuddyMasteryLab({ initialStep = 0, ...panelProps }: CaptureBuddyMasteryLabProps) {
  const [stepIndex, setStepIndex] = useState(() => Math.min(Math.max(initialStep, 0), CAPTURE_BUDDY_MASTERY_STEPS.length - 1))
  const step = captureBuddyMasteryStepAt(stepIndex)
  useEffect(() => { if (stepIndex === CAPTURE_BUDDY_MASTERY_STEPS.length - 1) awardLabBadge('capture-buddy-master', panelProps.profileScope ?? 'guest') }, [panelProps.profileScope, stepIndex])
  return <main className="min-h-full bg-[#070b12] p-4 text-slate-200 sm:p-6" aria-label="Capture Buddy mastery tutorial lab"><div className="mx-auto max-w-[1420px]"><header className="rounded-2xl border border-slate-700 bg-neutral-950 p-5"><p className="text-xs font-semibold uppercase tracking-[.22em] text-slate-500">Mastery tutorial lab</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Learn Capture Buddy safely</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A guided environment for explicit authorization, native readiness, bounded recording, evidence review, and responsible reporting. It uses real Capture Buddy data only.</p></header><div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px]"><article className="space-y-4"><section className="rounded-2xl border border-slate-700 bg-slate-950/70 p-5"><p className="text-xs text-slate-500">Lesson {stepIndex + 1} of {CAPTURE_BUDDY_MASTERY_STEPS.length}</p><h2 className="mt-2 text-xl font-semibold text-white">{step.title}</h2><p className="mt-2 text-sm font-medium text-slate-200">{step.summary}</p><p className="mt-2 text-sm leading-6 text-slate-400">{step.lesson}</p><div className="mt-5 grid gap-3 md:grid-cols-2"><section className="rounded-xl border border-slate-800 bg-white/[.03] p-3"><h3 className="font-semibold text-white">Theory</h3><p className="mt-2 text-sm leading-6 text-slate-400">{step.theory}</p></section><section className="rounded-xl border border-slate-800 bg-white/[.03] p-3"><h3 className="font-semibold text-white">Practice</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-5 text-slate-400">{step.practice.map(item => <li key={item}>{item}</li>)}</ul></section><section className="rounded-xl border border-slate-800 bg-white/[.03] p-3"><h3 className="font-semibold text-white">Observe in the live panel</h3><ul className="mt-2 list-disc space-y-2 pl-4 text-sm leading-5 text-slate-400">{step.observe.map(item => <li key={item}>{item}</li>)}</ul></section><section className="rounded-xl border border-slate-800 bg-white/[.03] p-3"><h3 className="font-semibold text-white">Real-world note</h3><p className="mt-2 text-sm leading-6 text-slate-400">{step.realWorldNote}</p></section></div><div className="mt-4 flex flex-wrap gap-2"><button className={button} onClick={() => setStepIndex(value => Math.max(0, value - 1))} disabled={stepIndex === 0}>Previous</button><button className={`${button} bg-white text-slate-950`} onClick={() => setStepIndex(value => Math.min(CAPTURE_BUDDY_MASTERY_STEPS.length - 1, value + 1))} disabled={stepIndex === CAPTURE_BUDDY_MASTERY_STEPS.length - 1}>Next lesson</button></div></section><nav aria-label="Capture Buddy mastery lessons" className="grid gap-2 sm:grid-cols-2">{CAPTURE_BUDDY_MASTERY_STEPS.map((item, index) => <button key={item.id} className={`rounded-xl border p-3 text-left text-sm ${index === stepIndex ? 'border-slate-400 bg-white/10' : 'border-slate-800'}`} onClick={() => setStepIndex(index)}><span className="text-slate-500">{index + 1}.</span> {item.title}<span className="mt-1 block text-xs text-slate-500">{item.summary}</span></button>)}</nav></article><CaptureBuddyMiniPanel {...panelProps} /></div></div></main>
}
