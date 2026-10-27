import React from 'react'
import { Flag, Route } from 'lucide-react'
import { labRuntimeAdapter, type LabRuntimeAdapter } from '../services/tauri/labRuntime'
import { LabRuntimeWorkspace } from './LabRuntimeWorkspace'

export const ScenarioLabs: React.FC<{ runtimeAdapter?: LabRuntimeAdapter; profileScope?: string }> = ({ runtimeAdapter = labRuntimeAdapter }) => (
  <main className="enterprise-page enterprise-ctf-page" aria-label="Practical CTFs">
    <div className="enterprise-page-header">
      <div>
        <p className="enterprise-kicker">NET0ZE / CHALLENGE ARENA</p>
        <h1>CTF Arena</h1>
        <p className="enterprise-lede">Solve original, isolated challenge rooms with a real objective, honest runtime state, and answer validation. Guided Learning Labs are intentionally separate from this challenge catalog.</p>
        <div className="enterprise-quick-links"><a href="#ctf-catalog">Browse CTF catalog</a><a href="#ctf-runtime">Open selected room</a></div>
      </div>
      <div className="enterprise-status-chip"><Route size={16} /> <span>Challenge rooms · local-first</span></div>
    </div>

    <nav className="enterprise-section-tabs" aria-label="CTF sections">
      <a className="is-active" href="#ctf-catalog"><Flag size={15} /> CTF catalog</a>
      <a href="#ctf-runtime">Selected room</a>
    </nav>

    <section className="enterprise-labs-hero" aria-label="CTF introduction">
      <div><p className="enterprise-kicker">CHALLENGE WORKFLOW</p><h2>Learn the question, then earn the answer.</h2><p>Every room shows its category, level, and real runtime state. Planned work stays planned. A challenge answer is validated by the native runtime and is not exposed in the catalog.</p></div>
      <ol className="enterprise-onboarding-list"><li><span>01</span><strong>Read the objective</strong><small>Understand what the room is asking.</small></li><li><span>02</span><strong>Follow the route map</strong><small>Use the smallest authorized action.</small></li><li><span>03</span><strong>Submit recovered evidence</strong><small>Keep the discovery path reproducible.</small></li></ol>
    </section>

    <section id="ctf-catalog" className="enterprise-panel enterprise-ctf-panel">
      <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">PRACTICAL ROOMS</p><h2>CTF catalog</h2></div><span className="enterprise-muted">Provision only what the runtime can actually run</span></div>
      <div className="enterprise-ctf-intro"><span>Room index</span><p>Choose a room, review the route map, and start only when the local runtime reports it is ready.</p></div>
      <LabRuntimeWorkspace adapter={runtimeAdapter} />
    </section>

    <section id="ctf-runtime" className="enterprise-panel enterprise-ctf-runtime-note" aria-label="CTF runtime guidance">
      <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">EVIDENCE-FIRST PLAY</p><h2>Play the room, keep the evidence</h2></div><span className="enterprise-muted">No answer leaks</span></div>
      <p className="enterprise-ctf-runtime-copy">Select a room above, read its route map, start only when the native runtime is ready, and submit the value recovered from the target. Learning Labs contain the beginner lessons; this page contains challenge execution and validation.</p>
    </section>
  </main>
)
