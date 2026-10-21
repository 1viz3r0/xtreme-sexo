import React, { useState } from 'react'
import { labRuntimeAdapter, type LabRuntimeAdapter } from '../services/tauri/labRuntime'
import { LabRuntimeWorkspace } from './LabRuntimeWorkspace'
import { ScanBuddyMasteryLab } from './ScanBuddyMasteryLab'
import { CaptureBuddyMasteryLab } from './CaptureBuddyMasteryLab'

export const ScenarioLabs: React.FC<{ runtimeAdapter?: LabRuntimeAdapter; profileScope?: string }> = ({ runtimeAdapter = labRuntimeAdapter, profileScope = 'guest' }) => {
  const [selected, setSelected] = useState<'scan-buddy' | 'capture-buddy' | null>(null)
  return <main className="flex-1 overflow-y-auto bg-[#070b12] p-4 text-slate-200 sm:p-6" aria-label="Practical CTFs">
    <div className="mx-auto max-w-[1480px] space-y-6">
      <section aria-label="Labs introduction" className="overflow-hidden rounded-2xl border border-slate-700 bg-[#0c121d]">
        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.22em] text-slate-500">NET0ZE / LABS</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">Practice the investigation, one room at a time.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">Start with a practical CTF room, provision its local target, and build an evidence trail as you investigate. The CTF catalog is the place to choose a room; the tutorials below are separate tool lessons.</p>
            <nav aria-label="Labs navigation" className="mt-6 flex flex-wrap gap-3">
              <a href="#ctf-catalog" className="rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-white">Browse CTF catalog</a>
              <a href="#learning-tutorials" className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10">Open tool tutorials</a>
            </nav>
          </div>
          <aside aria-label="Beginner onboarding" className="border-l-2 border-slate-600 bg-slate-950/50 p-5 lg:mt-0">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-400">Beginner onboarding</p>
            <h2 className="mt-2 text-xl font-semibold text-white">New to practical CTFs?</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <li><span className="mr-2 font-mono font-semibold text-slate-500">01</span>Choose an Easy room in the catalog.</li>
              <li><span className="mr-2 font-mono font-semibold text-slate-500">02</span>Start the local target when it is ready to provision.</li>
              <li><span className="mr-2 font-mono font-semibold text-slate-500">03</span>Follow the clues, record evidence, and submit your flag.</li>
            </ol>
          </aside>
        </div>
        <div className="border-t border-slate-800 px-6 py-3 text-xs text-slate-500 lg:px-8">Catalog rooms are practical exercises. Tutorials explain controls and boundaries without creating findings.</div>
      </section>

      {!selected && <div id="ctf-catalog"><LabRuntimeWorkspace adapter={runtimeAdapter} /></div>}

      <section id="learning-tutorials" aria-label="Learning tutorials" className="rounded-2xl border border-slate-800 bg-[#0c121d] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-4">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-slate-500">Separate learning track · tool mastery</p><h2 className="mt-2 text-2xl font-semibold text-white">Learn the tools before the room</h2></div>
          <p className="max-w-md text-sm leading-6 text-slate-400">Guided tutorials for Scan Buddy and Capture Buddy. They keep authorization, scope, and evidence boundaries visible; they do not invent findings.</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="border-l-2 border-slate-500 bg-slate-950/60 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-400">01 · Network · Beginner</p><h3 className="mt-3 text-lg font-semibold text-white">Mastering Scan Buddy</h3><p className="mt-2 text-sm leading-6 text-slate-400">Learn authorization, scope, preview, bounded TCP checks, progress, cancellation, and history.</p><button className="mt-5 rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200" onClick={() => setSelected('scan-buddy')}>Start tutorial</button></article>
          <article className="border-l-2 border-slate-700 bg-slate-950/60 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-slate-500">02 · Traffic · Beginner</p><h3 className="mt-3 text-lg font-semibold text-white">Mastering Capture Buddy</h3><p className="mt-2 text-sm leading-6 text-slate-400">Learn interface readiness, explicit capture authorization, bounded recording, evidence review, and reporting boundaries.</p><button className="mt-5 rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm font-medium text-slate-950 hover:bg-slate-200" onClick={() => setSelected('capture-buddy')}>Start tutorial</button></article>
        </div>
      </section>

      {selected === 'scan-buddy' && <ScanBuddyMasteryLab profileScope={profileScope} />}
      {selected === 'capture-buddy' && <CaptureBuddyMasteryLab profileScope={profileScope} />}
      {selected && <button className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-white/10" onClick={() => setSelected(null)}>Back to practical CTF catalog</button>}
    </div>
  </main>
}
