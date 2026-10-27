import React, { useMemo, useState } from 'react';
import { BookOpen, Check, ChevronRight, CircleHelp, FlaskConical, ShieldCheck } from 'lucide-react';
import type { TabType } from './Sidebar';

type LearningLab = {
  id: string;
  level: string;
  title: string;
  summary: string;
  prerequisites: string[];
  objective: string;
  steps: string[];
  expected: string[];
  hint: string;
  next: 'ctfs' | 'network_engine' | 'complete';
};

const LEARNING_LABS: readonly LearningLab[] = [
  {
    id: 'lab-interface-basics',
    level: 'Level 0 · Foundations',
    title: 'Read your local interface',
    summary: 'Learn the difference between a host, an interface, an address, and a link state before touching a network action.',
    prerequisites: ['NET0ZE desktop app or browser preview', 'No special permissions required for the lesson'],
    objective: 'Write one evidence note that identifies an interface and clearly separates observed values from assumptions.',
    steps: ['Open Dashboard and locate the Network identity section.', 'Record one interface name, one address, and its reported link state.', 'Mark any unavailable field as unknown instead of filling it from memory.', 'Write one sentence describing what this evidence proves and one thing it does not prove.'],
    expected: ['A real interface record or an honest browser-mode unavailable state', 'A bounded evidence note with source and limitation'],
    hint: 'An interface address identifies the host on one network; it does not reveal every device on that network.',
    next: 'ctfs',
  },
  {
    id: 'lab-request-path',
    level: 'Level 1 · Networking',
    title: 'Trace an HTTP request',
    summary: 'Follow the path from a client to a service using method, status, headers, and body as separate observations.',
    prerequisites: ['Complete Read your local interface', 'A local or explicitly authorized HTTP target'],
    objective: 'Explain how an HTTP response gives you evidence without turning one response into a security verdict.',
    steps: ['Open a known local target or the Web Exposure lab after it is running.', 'Record the request path and response status.', 'Identify one header and one body clue that changes your next action.', 'Write the smallest conclusion supported by those observations.'],
    expected: ['A request/response pair', 'A next action justified by a visible clue', 'A note that distinguishes fact from interpretation'],
    hint: 'Start with the target’s own links and metadata. Do not guess routes when the application already provides a route map.',
    next: 'ctfs',
  },
  {
    id: 'lab-evidence-note',
    level: 'Level 2 · Evidence',
    title: 'Build a reproducible evidence note',
    summary: 'Turn an observation into a compact note another analyst can reproduce.',
    prerequisites: ['One observation from Dashboard, Watchtower, Capture Buddy, Scan Buddy, or a Lab'],
    objective: 'Produce a report fragment with scope, source, observation, confidence, limitation, and next action.',
    steps: ['State the authorized scope and time of observation.', 'Name the source that produced the value.', 'Copy the observed value without changing its meaning.', 'Add confidence and one limitation.', 'Write the next action that would confirm or falsify the interpretation.'],
    expected: ['A bounded, reproducible note', 'A clear distinction between observation and conclusion'],
    hint: 'If another analyst cannot repeat the path from your note, the note is incomplete.',
    next: 'complete',
  },
  {
    id: 'lab-safe-scan',
    level: 'Level 3 · Service discovery',
    title: 'Preview an authorized TCP check',
    summary: 'Use Scan Buddy’s preview-first workflow to understand scope, impact, and the meaning of an open TCP connection.',
    prerequisites: ['An owned or explicitly authorized literal IP target', 'Desktop runtime for native Scan Buddy actions'],
    objective: 'Preview a bounded scan, understand its probe count, and avoid treating an open TCP connection as proof of a vulnerable service.',
    steps: ['Open Scan Buddy and enter only an authorized literal IP or bounded CIDR.', 'Review the exact target and TCP-port expansion in Preview.', 'Confirm authorization and start the scan only after reviewing the impact estimate.', 'Inspect one OPEN result manually and record what the check actually observed.', 'Export or preserve the result as evidence.'],
    expected: ['A preview with exact targets and ports', 'A result classified from a real TCP connection attempt', 'No unsupported vulnerability claim'],
    hint: 'OPEN means the TCP connection succeeded. It does not identify a product version or prove a vulnerability.',
    next: 'network_engine',
  },
];

function loadProgress(scope: string): Record<string, number[]> {
  try {
    const raw = localStorage.getItem(`netoze-learning-labs:${scope}`);
    const parsed = raw ? JSON.parse(raw) as Record<string, number[]> : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function LearningLabsView({ profileScope = 'guest', setActiveTab }: { profileScope?: string; setActiveTab?: (tab: TabType) => void }) {
  const [selectedId, setSelectedId] = useState(LEARNING_LABS[0].id);
  const [progress, setProgress] = useState<Record<string, number[]>>(() => loadProgress(profileScope));
  const selected = useMemo(() => LEARNING_LABS.find((lab) => lab.id === selectedId) ?? LEARNING_LABS[0], [selectedId]);
  const completed = new Set(progress[selected.id] ?? []);
  const toggle = (index: number) => {
    const next = new Set(completed);
    if (next.has(index)) next.delete(index); else next.add(index);
    const updated = { ...progress, [selected.id]: [...next].sort((a, b) => a - b) };
    setProgress(updated);
    try { localStorage.setItem(`netoze-learning-labs:${profileScope}`, JSON.stringify(updated)); } catch { /* session progress remains usable */ }
  };
  const finished = completed.size === selected.steps.length;

  return (
    <main className="enterprise-page enterprise-learning-page" aria-label="Learning Labs">
      <div className="enterprise-page-header">
        <div>
          <p className="enterprise-kicker">NET0ZE / GUIDED PRACTICE</p>
          <h1>Learning Labs</h1>
          <p className="enterprise-lede">Start from first principles, practice one bounded skill at a time, and keep evidence of what you actually learned. Learning Labs are guided exercises; CTFs are separate challenge rooms.</p>
        </div>
        <div className="enterprise-status-chip"><FlaskConical size={16} /> <span>{LEARNING_LABS.length} guided exercises</span></div>
      </div>

      <section className="enterprise-labs-hero" aria-label="Learning Labs workflow">
        <div><p className="enterprise-kicker">HOW TO USE THIS SPACE</p><h2>Question → observe → explain → prove.</h2><p>These lessons do not fabricate packets, scans, or targets. They point you to real NET0ZE surfaces and clearly state when the desktop runtime is required.</p></div>
        <ol className="enterprise-onboarding-list"><li><span>01</span><strong>Choose one exercise</strong><small>Complete the steps in order.</small></li><li><span>02</span><strong>Record evidence</strong><small>Keep facts separate from assumptions.</small></li><li><span>03</span><strong>Continue deliberately</strong><small>Use the next recommended exercise.</small></li></ol>
      </section>

      <div className="enterprise-learning-layout">
        <aside className="enterprise-panel enterprise-learning-index" aria-label="Learning Lab index">
          <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">01 · INDEX</p><h2>Beginner path</h2></div><BookOpen size={18} /></div>
          <div className="enterprise-learning-list">{LEARNING_LABS.map((lab, index) => {
            const done = (progress[lab.id]?.length ?? 0) === lab.steps.length;
            return <button key={lab.id} type="button" className={`enterprise-learning-option ${lab.id === selected.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(lab.id)}><span className="enterprise-learning-number">{done ? <Check size={14} /> : `0${index + 1}`}</span><span><strong>{lab.title}</strong><small>{lab.level}</small></span><ChevronRight size={15} /></button>;
          })}</div>
        </aside>

        <section className="enterprise-panel enterprise-learning-detail" aria-label="Selected Learning Lab">
          <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">02 · WORK THROUGH THE EXERCISE</p><h2>{selected.title}</h2><p>{selected.summary}</p></div><span className="enterprise-status-chip">{finished ? 'Complete' : `${completed.size}/${selected.steps.length} steps`}</span></div>
          <div className="enterprise-learning-meta"><div><span>Prerequisites</span><ul>{selected.prerequisites.map(item => <li key={item}>{item}</li>)}</ul></div><div><span>Objective</span><p>{selected.objective}</p></div></div>
          <div className="enterprise-learning-steps"><h3>Checklist</h3>{selected.steps.map((step, index) => <label key={step} className={`enterprise-learning-step ${completed.has(index) ? 'is-complete' : ''}`}><input type="checkbox" checked={completed.has(index)} onChange={() => toggle(index)} /><span><strong>{index + 1}. {step}</strong><small>Mark this only after you can explain the evidence.</small></span></label>)}</div>
          <div className="enterprise-learning-outcomes"><div><span>Expected outcome</span><ul>{selected.expected.map(item => <li key={item}>{item}</li>)}</ul></div><div><span><CircleHelp size={14} /> Hint</span><p>{selected.hint}</p></div></div>
          <div className="enterprise-learning-footer"><p>{finished ? 'Exercise complete. Review your note, then continue to the recommended next step.' : 'Complete the checklist as you work. Progress is saved locally for this profile scope.'}</p>{selected.next === 'network_engine' && setActiveTab && <button type="button" className="enterprise-primary-button" onClick={() => setActiveTab('network_engine')}><ShieldCheck size={14} /> Open Scan Buddy</button>}{selected.next === 'ctfs' && setActiveTab && <button type="button" className="enterprise-secondary-button" onClick={() => setActiveTab('ctfs')}>Browse CTF rooms</button>}</div>
        </section>
      </div>
    </main>
  );
}
