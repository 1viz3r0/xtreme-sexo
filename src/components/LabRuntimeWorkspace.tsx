import React, { useEffect, useRef, useState } from 'react'
import { type LabRuntimeAdapter, type LabRuntimeStatus } from '../services/tauri/labRuntime'
import { LAB_TOPIC_CATALOG } from '../lib/labTopicCatalog'

const panel = 'rounded-xl border border-slate-800 bg-[#0c121d] p-5'
const button = 'rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
export function LabRuntimeWorkspace({ adapter, pollIntervalMs = 5000 }: { adapter: LabRuntimeAdapter; pollIntervalMs?: number }) {
  const [category, setCategory] = useState('All categories')
  const [level, setLevel] = useState('All levels')
  const [runtime, setRuntime] = useState<LabRuntimeStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [flag, setFlag] = useState('')
  const gate = useRef(false)
  const mounted = useRef(false)
  const revision = useRef(0)
  const working = !!(runtime?.running && runtime.phase === 'running' && runtime.labId === 'web-exposure' && runtime.targetUrl)

  useEffect(() => {
    mounted.current = true
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
    return () => { disposed = true; mounted.current = false; clearTimeout(timer) }
  }, [adapter, pollIntervalMs])

  const action = async (kind: 'start' | 'stop' | 'reset' | 'open' | 'submitFlag' | 'status') => {
    if (gate.current) return
    gate.current = true; revision.current++; setBusy(true); setError(null); setNotice('')
    try {
      const next = kind === 'start' ? await adapter.start('web-exposure') : kind === 'submitFlag' ? await adapter.submitFlag(flag.trim()) : await adapter[kind]()
      if (mounted.current) { setRuntime(next); if (kind === 'submitFlag') setFlag('') }
    } catch (failure) { if (mounted.current) { setRuntime(null); setError(failure instanceof Error ? failure.message : String(failure)) } }
    finally { gate.current = false; if (mounted.current) setBusy(false) }
  }
  const copy = async () => {
    if (!working || !runtime?.targetUrl) return
    try { await navigator.clipboard.writeText(runtime.targetUrl); setNotice('Target URL copied.') } catch { setError('Could not copy the target URL.') }
  }
  const topics = LAB_TOPIC_CATALOG.filter(topic => (category === 'All categories' || topic.category === category) && (level === 'All levels' || topic.level === level))

  return <section aria-label="NET0ZE Labs" className="space-y-5">
    <header><p className="text-xs uppercase tracking-widest text-cyan-400">NET0ZE Labs</p><h1 className="mt-2 text-3xl font-semibold text-white">Practical labs</h1><p className="mt-2 text-sm text-slate-400">Original exercises, real local targets. Provision Web Exposure with Docker; the other labs are planned.</p></header>
    <div className="flex flex-wrap gap-3">
      <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)} className={button}><option>All categories</option>{['Web', 'Network', 'Linux', 'Forensics'].map(item => <option key={item}>{item}</option>)}</select>
      <select aria-label="Level" value={level} onChange={event => setLevel(event.target.value)} className={button}><option>All levels</option>{['Beginner', 'Intermediate', 'Advanced'].map(item => <option key={item}>{item}</option>)}</select>
    </div>
    <div aria-label="Lab catalog" className="grid gap-3 md:grid-cols-2">{topics.map(topic => <article key={topic.id} data-topic-id={topic.id} className={panel}><div className="flex justify-between text-xs"><span className="text-cyan-300">{topic.category} · {topic.level}</span><strong className={topic.status === 'planned' ? 'text-slate-500' : 'text-emerald-300'}>{topic.status === 'planned' ? 'Planned' : working ? 'Working' : 'Ready to provision'}</strong></div><h2 className="mt-3 text-lg font-semibold text-white">{topic.title}</h2><p className="mt-2 text-sm text-slate-400">{topic.description}</p></article>)}</div>
    {topics.length === 0 && <p role="status">No labs match these filters.</p>}
    <section aria-label="Web Exposure runtime" className={panel}>
      <h2 className="text-lg font-semibold text-white">Web Exposure runtime</h2>
      <p className="mt-2 text-sm text-slate-400">{busy ? 'Request in progress…' : working ? 'Working — target confirmed by the runtime.' : runtime?.phase === 'setup-required' ? 'Setup required' : runtime?.phase === 'error' ? 'Runtime error' : runtime ? 'Stopped' : 'Checking runtime readiness…'}</p>
      {runtime?.phase === 'setup-required' && <div className="mt-3 rounded border border-amber-700 p-3 text-sm text-amber-200"><h3 className="font-semibold">Docker setup</h3><p>Install Docker Engine or Docker Desktop with Engine version 28 or newer. Start the engine and ensure your user can access it, then check readiness.</p><p className="mt-2">Verify with <code>docker version</code> and <code>docker info</code>. Provisioning requires the installed NET0ZE desktop app.</p></div>}
      <p role="status" className="mt-3 text-sm text-slate-400">{runtime?.message}</p>
      <div className="mt-4 flex flex-wrap gap-2"><button className={button} disabled={busy || !runtime || working || runtime.phase === 'error'} onClick={() => void action('start')}>Start</button><button className={button} disabled={busy} onClick={() => void action('status')}>Check readiness</button><button className={button} disabled={busy || !working} onClick={() => void action('open')}>Open target</button><button className={button} disabled={busy || !working} onClick={() => void copy()}>Copy target</button><button className={button} disabled={busy || (!working && runtime?.phase !== 'error')} onClick={() => void action('stop')}>Stop</button><button className={button} disabled={busy || !working} onClick={() => void action('reset')}>Reset</button></div>
      {working && runtime?.targetUrl && <div className="mt-5 space-y-3"><label className="block text-sm">Target URL<input aria-label="Target URL" readOnly value={runtime.targetUrl} className="mt-1 block w-full rounded border border-slate-700 bg-black p-2 text-cyan-300" /></label><h3 className="font-semibold text-white">Discover the HTTP exposure</h3><p className="text-sm text-slate-400">Open the target in your browser or inspect it with curl. Follow clues in HTTP headers, page source, and linked resources. Find the exposed resource and submit the flag from the target; no answer is included in this catalog.</p><code className="block break-all text-xs text-cyan-300">curl -i {runtime.targetUrl}</code><form onSubmit={event => { event.preventDefault(); if (!busy && flag.trim()) void action('submitFlag') }} className="flex flex-wrap gap-2"><label className="flex-1 text-sm">Discovered flag<input aria-label="Discovered flag" type="password" autoComplete="off" value={flag} onChange={event => setFlag(event.target.value)} disabled={busy} className="mt-1 block w-full rounded border border-slate-700 bg-black p-2" /></label><button className={button} disabled={busy || !flag.trim()}>Submit flag</button></form><p className="text-sm text-emerald-300">{runtime.completed ? 'Completed — flag accepted by the runtime.' : 'Awaiting a correct flag.'}</p></div>}
      {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
    </section>
  </section>
}
