import React from 'react'
import { labRuntimeAdapter, type LabRuntimeAdapter } from '../services/tauri/labRuntime'
import { LabRuntimeWorkspace } from './LabRuntimeWorkspace'

export const ScenarioLabs: React.FC<{ runtimeAdapter?: LabRuntimeAdapter }> = ({ runtimeAdapter = labRuntimeAdapter }) => (
  <main className="flex-1 overflow-y-auto bg-[#070b12] p-4 text-slate-200 sm:p-6" aria-label="Practical labs">
    <div className="mx-auto max-w-[1480px]">
      <LabRuntimeWorkspace adapter={runtimeAdapter} />
    </div>
  </main>
)
