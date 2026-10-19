import React, { useState } from 'react'
import { labRuntimeAdapter, type LabRuntimeAdapter } from '../services/tauri/labRuntime'
import { LabRuntimeWorkspace } from './LabRuntimeWorkspace'
import { ScanBuddyMasteryLab } from './ScanBuddyMasteryLab'
import { CaptureBuddyMasteryLab } from './CaptureBuddyMasteryLab'

export const ScenarioLabs: React.FC<{ runtimeAdapter?: LabRuntimeAdapter; profileScope?: string }> = ({ runtimeAdapter = labRuntimeAdapter, profileScope = 'guest' }) => {
  const [selected, setSelected] = useState<'scan-buddy' | 'capture-buddy' | null>(null)
  return <main className="flex-1 overflow-y-auto bg-[#070b12] p-4 text-slate-200 sm:p-6" aria-label="Practical labs">
    <div className="mx-auto max-w-[1480px] space-y-6">
      <section aria-label="Tool mastery labs" className="rounded-2xl border border-slate-800 bg-[#0c121d] p-5">
        <p className="text-xs uppercase tracking-widest text-cyan-400">Tool mastery</p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Tool tutorials</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Optional guided panels explain the real Scan Buddy and Capture Buddy controls. The panels keep authorization, scope, and evidence boundaries visible; they do not invent findings.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-xs text-cyan-300">NETWORK · BEGINNER</p><h2 className="mt-2 text-lg font-semibold text-white">Mastering Scan Buddy</h2><p className="mt-2 text-sm text-slate-400">Learn authorization, scope, preview, bounded TCP checks, progress, cancellation, and history.</p><button className="mt-4 rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm font-medium text-slate-950" onClick={() => setSelected('scan-buddy')}>Start tutorial</button></article>
          <article className="rounded-xl border border-slate-700 bg-slate-950/60 p-4"><p className="text-xs text-cyan-300">TRAFFIC · BEGINNER</p><h2 className="mt-2 text-lg font-semibold text-white">Mastering Capture Buddy</h2><p className="mt-2 text-sm text-slate-400">Learn interface readiness, explicit capture authorization, bounded recording, evidence review, and reporting boundaries.</p><button className="mt-4 rounded-lg border border-slate-600 bg-white px-3 py-2 text-sm font-medium text-slate-950" onClick={() => setSelected('capture-buddy')}>Start tutorial</button></article>
        </div>
      </section>
      {selected === 'scan-buddy' && <ScanBuddyMasteryLab profileScope={profileScope} />}
      {selected === 'capture-buddy' && <CaptureBuddyMasteryLab profileScope={profileScope} />}
      {!selected && <LabRuntimeWorkspace adapter={runtimeAdapter} />}
      {selected && <button className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-white/10" onClick={() => setSelected(null)}>Back to practical lab catalog</button>}
    </div>
  </main>
}
