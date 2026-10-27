import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Check, Compass, Search, ShieldCheck } from 'lucide-react';
import { ALL_CAREER_PATHS, CAREER_LEVELS, GUIDE_TOPICS, findCareerPath, searchCareerPaths, topicsForCareer, type CareerPathId } from '../lib/fieldGuideCatalog';
import { loadFieldGuideCareer, saveFieldGuideCareer } from '../lib/fieldGuidePreferences';

type GuideView = 'start' | 'paths' | 'signals';

const foundationSteps = [
  ['01', 'Orient', 'Name the device, interface, IP, port, and protocol involved.'],
  ['02', 'Observe', 'Use only owned or explicitly authorized systems and record the source.'],
  ['03', 'Explain', 'Separate the raw observation from your interpretation or hypothesis.'],
  ['04', 'Prove', 'Repeat the check, keep the evidence, and state what remains unknown.'],
] as const;

export function FieldGuideView({ preferenceScope = 'guest' }: { preferenceScope?: string }) {
  const [career, setCareer] = useState<CareerPathId>(() => loadFieldGuideCareer(preferenceScope));
  const [view, setView] = useState<GuideView>('start');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [level, setLevel] = useState('all');
  const [activeTopic, setActiveTopic] = useState(GUIDE_TOPICS[0]);
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const careerPath = findCareerPath(career);
  const results = useMemo(() => searchCareerPaths(query, family, level).slice(0, 12), [family, level, query]);
  const topics = topicsForCareer(career);
  const families = [...new Set(ALL_CAREER_PATHS.map((item) => item.family))].sort();

  const chooseCareer = (next: CareerPathId) => {
    setCareer(next);
    saveFieldGuideCareer(next, preferenceScope);
    const firstTopic = topicsForCareer(next)[0];
    if (firstTopic) setActiveTopic(firstTopic);
  };

  const toggleStep = (index: number) => setCompleted((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  return (
    <main className="enterprise-page enterprise-field-guide" aria-label="Field Guide">
      <div className="enterprise-page-header">
        <div>
          <p className="enterprise-kicker">NET0ZE / LEARNING SYSTEM</p>
          <h1>Field Guide</h1>
          <p className="enterprise-lede">A beginner-first guide for turning observations into defensible security work. Start with the habit, choose a direction, then practice one signal at a time.</p>
        </div>
        <div className="enterprise-status-chip"><BookOpen size={16} /> <span>Local · guided</span></div>
      </div>

      <nav className="enterprise-section-tabs" aria-label="Field Guide sections">
        {([['start', 'Start here'], ['paths', 'Choose a path'], ['signals', 'Practice signals']] as const).map(([id, label]) => (
          <button key={id} type="button" className={view === id ? 'is-active' : ''} onClick={() => setView(id)}>{label}</button>
        ))}
      </nav>

      <section className="enterprise-hero-grid" aria-label="Current learning path">
        <article className="enterprise-hero-card enterprise-hero-card-accent">
          <div className="enterprise-icon-badge"><Compass size={20} /></div>
          <p className="enterprise-kicker">START HERE</p>
          <h2>Build the habit before the tool belt.</h2>
          <p>NET0ZE teaches a repeatable workflow instead of pretending that a single scan, packet, or alert is a conclusion.</p>
          <div className="enterprise-step-grid">
            {foundationSteps.map(([number, title, detail]) => <div key={number} className="enterprise-step-card"><span>{number}</span><strong>{title}</strong><p>{detail}</p></div>)}
          </div>
        </article>
        <article className="enterprise-hero-card enterprise-profile-card">
          <div className="enterprise-kicker-row"><span className="enterprise-kicker">CURRENT PATH</span><span className="enterprise-muted">{careerPath.profileStatus === 'curated' ? 'Curated' : 'Directory'}</span></div>
          <h2>{careerPath.title}</h2>
          <p>{careerPath.summary}</p>
          <div className="enterprise-progress-line"><span style={{ width: `${Math.max(12, Math.round((completed.size / Math.max(careerPath.milestones.length, 1)) * 100))}%` }} /></div>
          <div className="enterprise-inline-metrics"><span><strong>{completed.size}</strong> milestones</span><span><strong>{careerPath.skills.length}</strong> skills</span><span><strong>{careerPath.projects.length}</strong> missions</span></div>
          <div className="enterprise-chip-row">{careerPath.skills.slice(0, 4).map((skill) => <span key={skill} className="enterprise-chip">{skill}</span>)}</div>
        </article>
      </section>

      {view === 'start' && <section className="enterprise-guide-grid" aria-label="Beginner roadmap">
        <section className="enterprise-panel enterprise-roadmap-panel">
          <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">01 · NEXT MILESTONES</p><h2>Make progress visible</h2></div><span className="enterprise-muted">No score, just evidence</span></div>
          <div className="enterprise-roadmap">{careerPath.milestones.slice(0, 4).map((milestone, index) => <button type="button" key={milestone} onClick={() => toggleStep(index)} className={`enterprise-roadmap-item ${completed.has(index) ? 'is-complete' : ''}`}><span className="enterprise-check">{completed.has(index) ? <Check size={14} /> : `0${index + 1}`}</span><span><strong>{milestone}</strong><small>Write what you observed, how you verified it, and what remains unknown.</small></span></button>)}</div>
          <div className="enterprise-callout"><ShieldCheck size={16} /><span>Practice only on owned or explicitly authorized systems. A good note includes scope, source, evidence, confidence, and limitations.</span></div>
        </section>
        <aside className="enterprise-panel enterprise-path-panel">
          <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">02 · WHEN READY</p><h2>Choose a direction</h2></div></div>
          <p className="enterprise-lede">Use the path directory only after the foundation is clear. It is a starting point, not a promise about a job or certification.</p>
          <button type="button" className="enterprise-primary-button" onClick={() => setView('paths')}>Browse paths <ArrowRight size={14} /></button>
        </aside>
      </section>}

      {view === 'paths' && <section className="enterprise-panel" aria-label="Career path search">
        <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">PATH DIRECTORY</p><h2>Choose a direction</h2></div><span className="enterprise-muted">{results.length} shown · search is local</span></div>
        <label className="enterprise-search-field"><Search size={16} /><input aria-label="Search career paths" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skills, tools, roles…" /></label>
        <div className="enterprise-filter-row"><select aria-label="Filter career family" value={family} onChange={(event) => setFamily(event.target.value)}><option value="all">All families</option>{families.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Filter career level" value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All levels</option>{CAREER_LEVELS.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
        <div className="enterprise-path-list">{results.map((item) => <button type="button" key={item.id} className={`enterprise-path-option ${item.id === career ? 'is-selected' : ''}`} onClick={() => chooseCareer(item.id)}><span><strong>{item.title}</strong><small>{item.family} · {item.level}</small></span><ArrowRight size={15} /></button>)}{results.length === 0 && <p className="enterprise-empty">No path matches that search.</p>}</div>
      </section>}

      {view === 'signals' && <section className="enterprise-panel enterprise-topic-panel" aria-label="Evidence topics">
        <div className="enterprise-panel-heading"><div><p className="enterprise-kicker">PRACTICE SIGNALS</p><h2>Learn the signal, not just the label</h2></div><span className="enterprise-muted">Progressive, beginner-friendly guidance</span></div>
        <div className="enterprise-topic-layout"><div className="enterprise-topic-list">{(topics.length ? topics : GUIDE_TOPICS).map((topic) => <button type="button" key={`${topic.id}-${topic.value}`} className={`enterprise-topic-option ${activeTopic.id === topic.id && activeTopic.value === topic.value ? 'is-selected' : ''}`} onClick={() => setActiveTopic(topic)}><span>{topic.label}</span><code>{topic.value}</code></button>)}</div><article className="enterprise-topic-detail"><p className="enterprise-kicker">OBSERVATION CARD</p><h3>{activeTopic.label}</h3><code className="enterprise-value">{activeTopic.value}</code><div className="enterprise-topic-columns"><div><span>What it is</span><p>{activeTopic.label} is one observable part of a network or security record. Start by naming exactly what the source reported.</p></div><div><span>Why it matters</span><p>It becomes useful only in context: source, destination, time, protocol, and the question you are trying to answer.</p></div><div><span>Next move</span><p>Record the value, find one independent corroborating signal, then write the smallest defensible conclusion.</p></div></div></article></div>
      </section>}
    </main>
  );
}
