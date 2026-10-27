import React, { useEffect, useRef, useState } from 'react'
import { type LabRuntimeAdapter, type LabRuntimeStatus } from '../services/tauri/labRuntime'
import { LAB_TOPIC_CATALOG } from '../lib/labTopicCatalog'

const panel = 'rounded-xl border border-slate-800 bg-[#0c121d] p-5'
const button = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
export function LabRuntimeWorkspace({ adapter, pollIntervalMs = 5000 }: { adapter: LabRuntimeAdapter; pollIntervalMs?: number }) {
  const [category, setCategory] = useState('All categories')
  const [stage, setStage] = useState('All stages')
  const [runtime, setRuntime] = useState<LabRuntimeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [flag, setFlag] = useState('')
  const [evidenceNotes, setEvidenceNotes] = useState('')
  const [checkedSteps, setCheckedSteps] = useState<boolean[]>([])
  const [selectedLab, setSelectedLab] = useState('web-exposure')
  const gate = useRef<string | null>(null)
  const mounted = useRef({ active: false })
  const revision = useRef(0)
  const working = !!(runtime?.running && runtime.phase === 'running' && runtime.targetUrl)

  useEffect(() => {
    const lifetime = { active: true }
    mounted.current = lifetime
    gate.current = null; setBusy(false); setProvisioning(false)
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const version = revision.current
      if (!gate.current) {
        try { const next = await adapter.status(); if (!disposed && version === revision.current) { setRuntime(next); setError(null) } }
        catch (failure) { if (!disposed && version === revision.current) { setRuntime(null); setError(String(failure instanceof Error ? failure.message : failure)) } }
      }
      if (!disposed) timer = setTimeout(() => void poll(), pollIntervalMs)
    }
     void poll()
    return () => { disposed = true; lifetime.active = false; clearTimeout(timer) }
  }, [adapter, pollIntervalMs])

  const action = async (kind: 'start' | 'stop' | 'reset' | 'open' | 'submitFlag' | 'status') => {
    const lifetime = mounted.current
    if (gate.current && !(kind === 'stop' && ['start', 'reset'].includes(gate.current))) return
    gate.current = kind; const version = ++revision.current; setBusy(true); setProvisioning(kind === 'start' || kind === 'reset'); setError(null); setNotice('')
    try {
       const next = kind === 'start' ? await adapter.start(selectedLab) : kind === 'submitFlag' ? await adapter.submitFlag(flag.trim()) : await adapter[kind]()
      if (lifetime.active && version === revision.current) {
        setRuntime(next)
        if (kind === 'submitFlag') setFlag('')
        if (kind === 'start' || kind === 'reset' || kind === 'stop') setCheckedSteps([])
      }
    } catch (failure) { if (lifetime.active && version === revision.current) setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { if (lifetime.active && version === revision.current) { gate.current = null; setBusy(false); setProvisioning(false) } }
  }
  const copy = async () => {
    if (!working || !runtime?.targetUrl) return
    const lifetime = mounted.current; const version = revision.current
    try { await navigator.clipboard.writeText(runtime.targetUrl); if (lifetime.active && version === revision.current) setNotice('Target URL copied.') } catch { if (lifetime.active && version === revision.current) setError('Could not copy the target URL.') }
  }
  const topics = LAB_TOPIC_CATALOG.filter(topic => (category === 'All categories' || topic.category === category) && (stage === 'All stages' || topic.stage === stage))

      const groupedTopics = ['Easy', 'Medium', 'Hard'].map(groupStage => ({ stage: groupStage, topics: topics.filter(topic => topic.stage === groupStage) })).filter(group => group.topics.length > 0)
       const selectedTopic = LAB_TOPIC_CATALOG.find(topic => topic.id === selectedLab)
       const activeTopic = LAB_TOPIC_CATALOG.find(topic => topic.id === runtime?.labId)
       const runtimeTopic = runtime?.labId ? activeTopic : selectedTopic
      const stageTone: Record<string, { accent: string; wash: string; mark: string; description: string }> = {
        Easy: { accent: 'border-slate-500/80 text-slate-200', wash: 'bg-slate-500/[.04]', mark: 'E1', description: 'Start with clear clues and a short, explainable trail.' },
        Medium: { accent: 'border-slate-400/80 text-slate-100', wash: 'bg-slate-400/[.05]', mark: 'M2', description: 'Connect evidence, then explain why it supports your answer.' },
        Hard: { accent: 'border-slate-300/80 text-white', wash: 'bg-white/[.04]', mark: 'H3', description: 'Correlate carefully, preserve order, and state uncertainty.' },
      }
      const availabilityLabel = (topic: (typeof LAB_TOPIC_CATALOG)[number]) => topic.status === 'planned' ? 'Planned' : runtime?.labId === topic.id && working ? 'Working' : 'Ready to provision'
      const beginnerRooms = LAB_TOPIC_CATALOG.filter(topic => topic.id === 'first-contact' || topic.id === 'service-signals')
      return <section aria-label="NET0ZE CTFs" className="space-y-6">
       <header className="relative overflow-hidden border border-slate-700 bg-[#0b0e13] p-5 shadow-[0_0_36px_rgba(0,0,0,.25)] sm:p-6"><div className="absolute right-0 top-0 h-24 w-24 border-l border-b border-slate-700/70 opacity-60" /><div className="absolute right-6 top-6 h-12 w-12 border border-dashed border-slate-700/70" /><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center border border-slate-500 bg-slate-800/60 text-sm font-black tracking-tighter text-slate-200">N0</div><div><p className="text-xs uppercase tracking-[.3em] text-slate-500">NET0ZE / SIGNAL BOARD</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Practical CTFs</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Original isolated challenges with a real target, a clear objective, and evidence you can explain. Pick a room, read its route map, then provision it locally when it is available.</p></div></div><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 pt-4 text-xs uppercase tracking-widest text-slate-500"><span><strong className="text-slate-200">{LAB_TOPIC_CATALOG.filter(topic => topic.status === 'available').length}</strong> available</span><span><strong className="text-slate-300">{LAB_TOPIC_CATALOG.filter(topic => topic.stage === 'Easy' && topic.status === 'available').length}</strong> beginner rooms</span><span><strong className="text-slate-300">{LAB_TOPIC_CATALOG.filter(topic => topic.status === 'planned').length}</strong> planned</span></div></header>
       <section aria-labelledby="ctf-catalog-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-4"><div><p className="text-xs font-semibold uppercase tracking-[.3em] text-slate-500">Room index / choose your next route</p><h2 id="ctf-catalog-heading" className="mt-1 text-2xl font-semibold tracking-tight text-white">CTF catalog</h2><p className="mt-1 text-sm text-slate-400">Every room is labeled by difficulty, category, and readiness.</p></div><div className="flex flex-wrap gap-3"><select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} className={button}><option>All categories</option>{['Web', 'Network', 'Linux', 'Forensics'].map(item => <option key={item}>{item}</option>)}</select><select aria-label="Stage" value={stage} onChange={event => setStage(event.target.value)} className={button}><option>All stages</option>{['Easy', 'Medium', 'Hard'].map(item => <option key={item}>{item}</option>)}</select></div></div>
        <div aria-label="New beginner rooms" className="border border-slate-600 bg-slate-800/20 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.25em] text-slate-300">New beginner rooms</p><p className="mt-1 text-sm text-slate-400">Two short Easy rooms are ready when you are.</p></div><span className="border border-slate-600 px-2 py-1 font-mono text-xs text-slate-300">EASY // 2 NEW</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{beginnerRooms.map(topic => <button key={topic.id} type="button" className="flex items-start justify-between gap-3 border border-slate-700 bg-slate-950/60 p-4 text-left transition-colors hover:border-slate-400" onClick={() => setSelectedLab(topic.id)}><span><span className="block font-mono text-[10px] uppercase tracking-[.2em] text-slate-500">ROOM // {topic.id}</span><span className="mt-1 block text-lg font-semibold text-white">{topic.title}</span><span className="mt-1 block text-xs text-slate-500">{topic.category} · Easy</span></span><span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-300">Select →</span></button>)}</div></div>
       </section>
       <aside aria-label="Selected room" className="sticky top-2 z-10 border border-slate-600 bg-[#0b0e13]/95 p-4 shadow-lg backdrop-blur sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-300" /><div><p className="text-[10px] font-semibold uppercase tracking-[.28em] text-slate-500">Selected room rail</p><h2 className="mt-1 text-xl font-semibold text-white">{selectedTopic?.title ?? 'Selected CTF'}</h2><p className="mt-1 font-mono text-xs text-slate-500">{selectedTopic?.id ?? 'none'} · {selectedTopic?.category ?? '—'} / {selectedTopic?.stage ?? '—'}</p></div></div><div className="flex flex-wrap items-center gap-2 text-xs"><span className={`border px-2 py-1 font-semibold uppercase tracking-wider ${selectedTopic?.status === 'planned' ? 'border-slate-700 text-slate-400' : 'border-slate-500 text-slate-200'}`}>{selectedTopic ? availabilityLabel(selectedTopic) : 'No room selected'}</span><span className="border border-slate-700 px-2 py-1 text-slate-400">{selectedTopic?.level ?? '—'} track</span></div></div>{selectedTopic?.objective && <p className="mt-3 border-l-2 border-slate-600 pl-3 text-sm leading-6 text-slate-300"><span className="font-semibold text-slate-200">Mission:</span> {selectedTopic.objective}</p>}</aside>
       <div aria-label="CTF rooms" className="space-y-8">{groupedTopics.map(group => { const tone = stageTone[group.stage]; return <section key={group.stage} aria-label={`${group.stage} CTFs`}><div className={`mb-3 flex flex-wrap items-center gap-3 border-b ${tone.accent.split(' ')[0]} pb-3 ${tone.wash}`}><span className={`border px-2 py-1 font-mono text-xs font-bold ${tone.accent}`}>{tone.mark}</span><h2 className="text-sm font-semibold uppercase tracking-[.2em] text-white">{group.stage} CTFs</h2><span className="text-xs text-slate-500">{tone.description}</span></div><div className="grid gap-4 md:grid-cols-2">{group.topics.map(topic => { const selected = selectedLab === topic.id; return <article key={topic.id} data-topic-id={topic.id} className={`relative flex h-full flex-col overflow-hidden border bg-[#0c121d] p-5 transition-colors ${selected ? 'border-slate-300 shadow-[0_0_24px_rgba(255,255,255,.06)]' : 'border-slate-800 hover:border-slate-600'} ${topic.status === 'planned' ? 'opacity-80' : ''}`}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-slate-500">ROOM // {topic.id}</p><p className="mt-2 text-xs font-semibold uppercase tracking-widest text-slate-300">{topic.category} · {topic.stage} · {topic.level}</p></div><span className={`shrink-0 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${topic.status === 'planned' ? 'border-slate-700 text-slate-500' : runtime?.labId === topic.id && working ? 'border-slate-400 text-slate-200' : 'border-slate-600 text-slate-300'}`}>{availabilityLabel(topic)}</span></div><h3 className="mt-4 text-xl font-semibold text-white">{topic.title}</h3><p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-slate-400">{topic.description}</p>{topic.stage === 'Easy' && <p className="mt-4 border border-slate-700 bg-slate-800/30 px-3 py-2 text-xs leading-5 text-slate-300"><strong>BEGINNER SIGNAL:</strong> {topic.id === 'web-exposure' ? 'Start with the target page and follow its own clues. No guessing required.' : 'Use the named routes in order; keep one note for each clue you confirm.'}</p>}<div className="mt-4 grid gap-3 border-t border-slate-800 pt-4"><div><h4 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Runbook</h4><ol className="mt-2 list-decimal space-y-1 pl-4 text-sm leading-6 text-slate-400">{topic.steps.map(step => <li key={step}>{step}</li>)}</ol></div>{topic.objective && <div><h4 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Objective</h4><p className="mt-1 text-sm leading-6 text-slate-400">{topic.objective}</p></div>}</div><div className="mt-auto pt-5"><button className={`${button} w-full ${topic.status === 'available' ? 'border-slate-500 text-slate-200' : 'border-slate-700 text-slate-400'}`} disabled={busy || (working && runtime?.labId !== topic.id)} onClick={() => setSelectedLab(topic.id)}>{selected ? 'Selected CTF' : topic.status === 'available' ? 'Select CTF' : 'View planned CTF'}</button></div></article> })}</div></section> })}</div>
     {topics.length === 0 && <p role="status">No CTFs match these filters.</p>}
      <section aria-label="Selected CTF runtime" className={panel}>
        <h2 className="text-lg font-semibold text-white">{runtimeTopic?.title ?? 'Selected CTF'} runtime</h2>
      <p className="mt-2 text-sm text-slate-400">{busy ? 'Request in progress…' : working ? 'Working — target confirmed by the runtime.' : runtime?.phase === 'starting' ? 'Provisioning — Stop cancels startup.' : runtime?.phase === 'stopping' ? 'Stopping and reconciling owned resources…' : runtime?.phase === 'setup-required' ? 'Setup required' : runtime?.phase === 'error' ? 'Runtime error' : runtime ? 'Stopped' : 'Checking runtime readiness…'}</p>
      <p className="mt-2 text-xs text-slate-500">Targets continue when you leave this view until Stop or app exit. After a process crash, earlier Docker resources are not automatically adopted or removed.</p>
      {runtime?.phase === 'setup-required' && <div className="mt-3 rounded border border-slate-600 bg-slate-800/20 p-3 text-sm text-slate-300"><h3 className="font-semibold text-slate-100">Docker setup</h3><p>Use native Linux Docker Engine version 28 or newer with host-reachable bridge networking. Start the engine and ensure your user can access it, then check readiness. Docker Desktop and rootless engines are not supported.</p><p className="mt-2">Verify with <code>docker version</code> and <code>docker info</code>. Provisioning requires the installed NET0ZE desktop app.</p></div>}
      <p role="status" className="mt-3 text-sm text-slate-400">{runtime?.message}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={busy || !runtime || working || ['starting', 'stopping', 'error'].includes(runtime.phase) || selectedTopic?.status !== 'available'} onClick={() => void action('start')}>Start selected CTF</button><button className={button} disabled={busy} onClick={() => void action('status')}>Check readiness</button><button className={button} disabled={busy || !working} onClick={() => void action('open')}>Open target</button><button className={button} disabled={busy || !working} onClick={() => void copy()}>Copy target</button><button className={button} disabled={(busy && !provisioning) || (!provisioning && !working && !['starting', 'error'].includes(runtime?.phase ?? ''))} onClick={() => void action('stop')}>Stop CTF</button><button className={button} disabled={busy || !working} onClick={() => void action('reset')}>Reset CTF</button></div>
        {working && runtime?.consoleAddr && <div className="mt-4"><label className="block text-sm">TCP console<input aria-label="TCP console" readOnly value={runtime.consoleAddr} className="mt-1 block w-full rounded border border-slate-700 bg-black p-2" /></label><code className="mt-2 block text-xs">nc {runtime.consoleAddr.replace(':', ' ')}</code><p className="mt-1 text-xs text-slate-400">This loopback endpoint forwards only to the owned target's fixed TCP port 9000.</p></div>}
        <CtfBriefing topic={runtimeTopic} evidenceNotes={evidenceNotes} setEvidenceNotes={setEvidenceNotes} checkedSteps={checkedSteps} setCheckedSteps={setCheckedSteps} />
        {working && runtime?.targetUrl && <div className="mt-5 space-y-3 border-t border-slate-800 pt-5"><h3 className="font-semibold text-white">Live target</h3><label className="block text-sm">Target URL<input aria-label="Target URL" readOnly value={runtime.targetUrl} className="mt-1 block w-full rounded border border-slate-700 bg-black p-2 text-slate-200" /></label><p className="text-sm text-slate-400">Use the target URL as the base for your requests. The answer is intentionally not shown here.</p><code className="block break-all text-xs text-slate-300">curl -i {runtime.targetUrl}</code><form onSubmit={event => { event.preventDefault(); if (!busy && flag.trim()) void action('submitFlag') }} className="flex flex-wrap gap-2"><label className="flex-1 text-sm">Discovered flag<input aria-label="Discovered flag" type="password" autoComplete="off" value={flag} onChange={event => setFlag(event.target.value)} disabled={busy} className="mt-1 block w-full rounded border border-slate-700 bg-black p-2" /></label><button className={button} disabled={busy || !flag.trim()}>Submit flag</button></form><p className="text-sm text-slate-300">{runtime.completed ? 'Completed — flag accepted by the runtime.' : 'Awaiting a correct flag.'}</p></div>}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </section>
  </section>
}

function CtfBriefing({ topic, evidenceNotes, setEvidenceNotes, checkedSteps, setCheckedSteps }: { topic: (typeof LAB_TOPIC_CATALOG)[number] | undefined; evidenceNotes: string; setEvidenceNotes: (value: string) => void; checkedSteps: boolean[]; setCheckedSteps: (value: boolean[]) => void }) {
  if (!topic?.objective || !topic.targetSurface || !topic.investigationSteps || !topic.challengeGuidance) return null
  return <section aria-label={`${topic.title} walkthrough`} className="mt-5 grid gap-4 border-t border-slate-800 pt-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div><div className="flex items-center gap-2"><span className="font-mono text-[10px] tracking-[.2em] text-slate-600">ROUTE MAP</span><span className="h-px flex-1 bg-slate-800" /></div><h3 className="mt-2 font-semibold text-white">Walkthrough prompts</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-400">{topic.walkthroughPrompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></div>
      <div><h3 className="font-semibold text-white">Investigation objective</h3><p className="mt-1 text-sm leading-6 text-slate-400">{topic.objective}</p></div>
       <div><h3 className="font-semibold text-white">Target surface</h3><ul className="mt-2 space-y-1 text-sm text-slate-300">{topic.targetSurface.map(route => <li key={route}><code className="text-slate-200">{route}</code></li>)}</ul></div>
      <div><h3 className="font-semibold text-white">Challenge guidance</h3><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-400">{topic.challengeGuidance.map(step => <li key={step}>{step}</li>)}</ol></div>
    </div>
    <div className="space-y-4">
       <div><h3 className="font-semibold text-white">Investigation checklist</h3><div className="mt-2 space-y-2">{topic.investigationSteps.map((step, index) => <label key={step} className="flex gap-3 text-sm leading-6 text-slate-300"><input type="checkbox" checked={checkedSteps[index] ?? false} onChange={event => { const next = [...checkedSteps]; next[index] = event.target.checked; setCheckedSteps(next) }} className="mt-1 accent-slate-400" />{step}</label>)}</div></div>
      <label className="block text-sm"><span className="font-semibold text-white">Evidence notes</span><textarea aria-label="Evidence notes" value={evidenceNotes} onChange={event => setEvidenceNotes(event.target.value)} placeholder="Record paths, response clues, and the evidence that led to your next step." rows={7} className="mt-2 block w-full resize-y rounded border border-slate-700 bg-black p-3 text-sm text-slate-200 placeholder:text-slate-600" /></label>
    </div>
  </section>
}
