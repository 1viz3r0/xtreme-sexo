import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, X, Terminal, Code, Info, ShieldAlert, ArrowRight, Map, CheckCircle2 } from 'lucide-react';
import { getFieldExplanation, type EduExplanation } from '../services/tauri/edu';
import { ALL_CAREER_PATHS, CAREER_LEVELS, GUIDE_TOPICS, findCareerPath, searchCareerPaths, topicsForCareer, type CareerPathId } from '../lib/fieldGuideCatalog';
import { loadFieldGuideCareer, saveFieldGuideCareer } from '../lib/fieldGuidePreferences';

interface EduInspectorModalProps {
  selectedField: string | null;
  currentValue?: string;
  onClose: () => void;
  preferenceScope?: string;
}

export const EduInspectorModal: React.FC<EduInspectorModalProps> = ({
  selectedField,
  currentValue,
  onClose,
  preferenceScope = 'guest',
}) => {
  const [explanation, setExplanation] = useState<EduExplanation | null>(null);
  const [activeLevel, setActiveLevel] = useState<number>(1);
  const [fieldKey, setFieldKey] = useState<string>(selectedField || 'dst_port');
  const [fieldValue, setFieldValue] = useState<string>(currentValue ?? '');
  const [career, setCareer] = useState<CareerPathId>(() => loadFieldGuideCareer(preferenceScope));
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [levelFilter, setLevelFilter] = useState('all');
  const [section, setSection] = useState<'profile' | 'map' | 'skills' | 'projects' | 'toolkit'>('profile');
  const [completed, setCompleted] = useState<Set<number>>(new Set());
  const careerPath = findCareerPath(career);
  const searchResults = useMemo(() => searchCareerPaths(query, familyFilter, levelFilter), [query, familyFilter, levelFilter]);
  const recommendedTopics = useMemo(() => topicsForCareer(career), [career]);

  useEffect(() => {
    loadExplanation(fieldKey, fieldValue);
  }, [fieldKey, fieldValue]);

  const availableFields = recommendedTopics.length ? recommendedTopics : GUIDE_TOPICS;

  const loadExplanation = async (id: string, val: string) => {
    const data = await getFieldExplanation(id, val);
    if (data) {
      setExplanation(data);
    } else {
      // Fallback object for browser preview mode
      setExplanation({
        field_id: id,
        title: `Field: ${id}`,
        category: 'NETWORK',
        short_description: `Contextual inspection of ${id} field value: ${val}`,
        detailed_explanation: `In network analysis, ${id} represents traffic metadata evaluated against baseline standards.`,
        current_value: val,
        interpretation: `Observed value ${val} in current flow session.`,
        status_level: 'OBSERVED',
        evidence: [`Field ${id}: ${val}`],
        related_entities: ['source_ip', 'destination_ip'],
        analyst_next_steps: [
          'Review related flow duration and byte volume.',
          'Inspect correlated detection findings.',
        ],
      });
    }
  };

  const handleSelectField = (id: string, actualFieldId: string, val: string) => {
    setFieldKey(actualFieldId);
    setFieldValue(val);
  };
  const chooseCareer = (value: CareerPathId) => { setCareer(value); saveFieldGuideCareer(value, preferenceScope); const next = topicsForCareer(value)[0]; if (!selectedField && next) { setFieldKey(next.fieldId || next.id); setFieldValue(next.value); } };
  const toggleMilestone = (index: number) => setCompleted(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; });

  return (
    <div className="bg-[#050b18]/95 border border-[#142646] rounded-xl p-6 shadow-2xl space-y-6 backdrop-blur-xl font-mono text-xs max-w-3xl mx-auto max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain pb-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#142646] pb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
             FIELD GUIDE — PERSONALIZED CYBERSECURITY CAREER MAP
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-4 space-y-3">
          <div className="flex items-center gap-2 text-cyan-300"><Map className="h-4 w-4" /><h3 className="font-bold uppercase tracking-wider">Search every path</h3></div>
          <p className="text-slate-300 font-sans text-sm">Search career names, skills, tools, families, and work styles. Select a result to build your personalized map. This is guidance, not a job-readiness verdict.</p>
          <input aria-label="Search career paths" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search careers, skills, tools, or interests…" className="w-full rounded-lg border border-cyan-500/30 bg-black/50 p-2 text-cyan-100 placeholder:text-slate-600" />
          <div className="grid grid-cols-2 gap-2"><select aria-label="Filter career family" value={familyFilter} onChange={event => setFamilyFilter(event.target.value)} className="rounded-lg border border-[#142646] bg-black/50 p-2 text-slate-200"><option value="all">All families</option>{[...new Set(ALL_CAREER_PATHS.map(path => path.family))].map(value => <option key={value} value={value}>{value}</option>)}</select><select aria-label="Filter career level" value={levelFilter} onChange={event => setLevelFilter(event.target.value)} className="rounded-lg border border-[#142646] bg-black/50 p-2 text-slate-200"><option value="all">All levels</option>{CAREER_LEVELS.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1" aria-label="Career search results">{searchResults.map(path => <button type="button" key={path.id} onClick={() => chooseCareer(path.id)} className={`w-full rounded-lg border p-3 text-left ${career === path.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-[#142646] bg-black/30 hover:border-slate-500'}`}><div className="flex flex-wrap items-center justify-between gap-2"><b className="text-slate-100">{path.title}</b><span className="text-[10px] uppercase text-cyan-300">{path.level}</span></div><p className="mt-1 text-xs text-slate-400">{path.family}</p><p className="mt-1 text-xs text-slate-300 font-sans">{path.summary}</p></button>)}{searchResults.length === 0 && <p className="rounded border border-dashed border-[#142646] p-3 text-sm text-slate-500">No paths match. Try “network”, “cloud”, “detection”, “forensics”, or “coding”.</p>}</div>
           <div className="flex flex-wrap items-center gap-2"><p className="text-cyan-100 font-semibold">{careerPath.summary}</p><span className={`rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${careerPath.profileStatus === 'curated' ? 'border-emerald-500/40 text-emerald-300' : 'border-amber-500/40 text-amber-300'}`}>{careerPath.profileStatus === 'curated' ? 'Curated profile' : 'Directory profile'}</span></div><p className="text-slate-300 font-sans text-sm">{careerPath.overview}</p><p className="text-slate-400 font-sans text-xs">Best for: {careerPath.bestFor}</p>
        </section>
        <section className="rounded-xl border border-[#142646] bg-black/30 p-4"><h3 className="text-cyan-300 font-bold uppercase tracking-wider">Your customized map</h3><div className="mt-3 space-y-2">{careerPath.milestones.map((milestone, index) => <button type="button" key={milestone} onClick={() => toggleMilestone(index)} className="flex w-full gap-2 text-left text-sm text-slate-200 font-sans hover:bg-white/5 rounded p-1"><CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${completed.has(index) ? 'text-emerald-400' : 'text-slate-600'}`} /> <span className={completed.has(index) ? 'text-emerald-200 line-through' : ''}><b>0{index + 1}</b> · {milestone}</span></button>)}</div><p className="mt-3 text-xs text-slate-400 font-sans"><b className="text-slate-200">Portfolio missions:</b> {careerPath.projects.join(' · ')}</p><p className="mt-2 text-xs text-slate-500 font-sans"><b className="text-slate-300">Tool belt:</b> {careerPath.tools.join(' · ')}</p></section>
      </div>

       <nav aria-label="Field Guide sections" className="sticky top-0 z-10 flex flex-wrap gap-2 border-b border-[#142646] bg-[#050b18]/95 pb-3 pt-1 backdrop-blur-xl">
         {[['profile', 'Role profile'], ['map', 'Career map'], ['skills', 'Skill matrix'], ['projects', 'Project missions'], ['toolkit', 'Tool belt']].map(([id, label]) => <button type="button" key={id} onClick={() => setSection(id as typeof section)} className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wider ${section === id ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200' : 'border-[#142646] text-slate-400 hover:text-white'}`}>{label}</button>)}
       </nav>
       {section === 'profile' && <section className="space-y-4" aria-label="Integrated role profile"><div className="grid gap-3 md:grid-cols-2"><article className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4"><h3 className="font-bold uppercase tracking-wider text-cyan-200">Mission and responsibilities</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300 font-sans">{careerPath.responsibilities.map(item => <li key={item}>{item}</li>)}</ul></article><article className="rounded-xl border border-[#142646] p-4"><h3 className="font-bold uppercase tracking-wider text-slate-200">Recurring activities</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300 font-sans">{careerPath.activities.map(item => <li key={item}>{item}</li>)}</ul></article></div><article className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4"><h3 className="font-bold uppercase tracking-wider text-cyan-200">Workflow for {careerPath.title}</h3><div className="mt-3 grid gap-2 md:grid-cols-5">{careerPath.workflow.map((step, index) => <div key={step} className="rounded-lg border border-[#142646] bg-black/30 p-3"><span className="text-xs text-cyan-400">STEP {index + 1}</span><p className="mt-1 text-sm text-slate-200 font-sans">{step}</p></div>)}</div></article><article className="rounded-xl border border-[#142646] p-4"><h3 className="font-bold uppercase tracking-wider text-amber-200">Evidence and deliverables</h3><ul className="mt-3 grid gap-2 md:grid-cols-2 list-disc pl-5 text-sm text-slate-300 font-sans">{[...careerPath.deliverables, ...careerPath.evidence].map(item => <li key={item}>{item}</li>)}</ul></article><article className="rounded-xl border border-[#142646] p-4"><h3 className="font-bold uppercase tracking-wider text-emerald-200">Growth and sources</h3><p className="mt-3 text-sm text-slate-300 font-sans"><b>Next transitions:</b> {careerPath.transitions.join(' · ')}</p><p className="mt-3 text-xs text-slate-400 font-sans"><b>Certification guidance:</b> {careerPath.certifications.join(' · ')}</p><p className="mt-3 text-xs text-slate-500 font-sans"><b>Reference frameworks:</b> {careerPath.sources.join(' · ')}</p></article></section>}
      {section === 'map' && <section className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-[#142646] p-4"><b className="text-cyan-300">START HERE</b><p className="mt-2 text-sm text-slate-300 font-sans">Learn the network path: interface → IP → route → port → protocol → evidence.</p><button type="button" onClick={() => setSection('skills')} className="mt-3 rounded border border-cyan-500/40 px-3 py-2 text-xs text-cyan-200">Open skill matrix →</button></div><div className="rounded-xl border border-[#142646] p-4"><b className="text-amber-300">PROVE IT</b><p className="mt-2 text-sm text-slate-300 font-sans">A tool output is only a starting point. Record scope, evidence, confidence, and limitations.</p><button type="button" onClick={() => setSection('projects')} className="mt-3 rounded border border-amber-500/40 px-3 py-2 text-xs text-amber-200">Choose a mission →</button></div><div className="rounded-xl border border-[#142646] p-4"><b className="text-emerald-300">NEXT MOVE</b><p className="mt-2 text-sm text-slate-300 font-sans">Build a small authorized project, export the evidence, and review what you still cannot prove.</p><button type="button" onClick={() => setSection('toolkit')} className="mt-3 rounded border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200">Open toolkit →</button></div></section>}
      {section === 'skills' && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{careerPath.skills.map((skill, index) => <article key={skill} className="rounded-xl border border-[#142646] bg-black/30 p-4"><div className="flex justify-between gap-2"><b className="text-slate-200">{skill}</b><span className="text-xs text-cyan-300">{index < 2 ? 'Core' : 'Build'}</span></div><div className="mt-3 h-2 rounded bg-slate-900"><div className="h-2 rounded bg-cyan-400" style={{ width: `${35 + index * 9}%` }} /></div><p className="mt-2 text-xs text-slate-500 font-sans">Path-specific proof: explain it, observe it in a lab, document it, then test a boundary.</p></article>)}</section>}
      {section === 'projects' && <section className="space-y-3"><div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-4 text-sm text-amber-100 font-sans">Labs and CTF missions will be connected to this path later. For now, these are portfolio missions: complete them only with synthetic data, owned systems, or explicit authorization.</div><div className="grid gap-3 md:grid-cols-2">{careerPath.projects.map((project, index) => <article key={project} className="rounded-xl border border-[#142646] p-4"><span className="text-xs uppercase tracking-wider text-amber-300">Portfolio mission {index + 1}</span><h3 className="mt-2 font-bold text-white">{project}</h3><p className="mt-2 text-sm text-slate-400 font-sans">Deliver: scope note, observations, evidence, confidence, remediation, and a short lessons-learned section.</p><button type="button" onClick={() => toggleMilestone(index % careerPath.milestones.length)} className="mt-3 rounded border border-slate-700 px-3 py-2 text-xs text-slate-200">Mark related milestone</button></article>)}</div></section>}
      {section === 'toolkit' && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{careerPath.tools.map(tool => <article key={tool} className="rounded-xl border border-[#142646] p-4"><b className="text-white">{tool}</b><p className="mt-2 text-xs text-slate-400 font-sans">Use it to answer a specific question in an owned or explicitly authorized environment. Record what it can and cannot observe.</p><span className="mt-3 inline-block rounded border border-emerald-500/30 px-2 py-1 text-xs text-emerald-300">Learn with evidence</span></article>)}</div><div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4"><h3 className="font-bold uppercase tracking-wider text-cyan-200">Roadmap sequence</h3><div className="mt-3 grid gap-2 md:grid-cols-4">{careerPath.roadmap.map((step, index) => <div key={step} className="rounded-lg border border-[#142646] bg-black/30 p-3"><span className="text-xs text-cyan-400">PHASE {index + 1}</span><p className="mt-1 text-sm text-slate-200 font-sans">{step}</p></div>)}</div></div></section>}

      <div className="text-[10px] uppercase tracking-wider text-slate-500">Recommended evidence topics for {careerPath.title}</div>
      {selectedField && <>
      {/* Field Selector Pill Bar */}
      <div className="flex flex-wrap gap-2">
        {availableFields.map((item) => {
            const actualId = item.fieldId || item.id;
            const isActive = fieldKey === actualId && fieldValue === item.value;
          return (
            <button
              key={item.id}
              onClick={() => handleSelectField(item.id, actualId, item.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                isActive
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500 shadow-md shadow-cyan-500/20'
                  : 'bg-black/60 text-slate-400 border-[#142646] hover:border-slate-500'
              }`}
            >
              {item.label} ({item.value})
            </button>
          );
        })}
      </div>

      {/* Progressive Disclosure Level Tabs */}
      <div className="flex items-center gap-2 border-b border-[#142646] pb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">
          PROGRESSIVE DISCLOSURE:
        </span>
        {[
          { level: 1, label: 'L1: Overview' },
          { level: 2, label: 'L2: Technical Details' },
          { level: 3, label: 'L3: Evidence & Interpretation' },
          { level: 4, label: 'L4: Analyst Next Steps' },
        ].map((lvl) => (
          <button
            key={lvl.level}
            onClick={() => setActiveLevel(lvl.level)}
            className={`px-3 py-1 rounded font-mono text-xs font-bold border transition-all cursor-pointer ${
              activeLevel === lvl.level
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                : 'bg-slate-900/60 text-slate-400 border-[#142646] hover:text-slate-200'
            }`}
          >
            {lvl.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {explanation && (
        <div className="bg-[#030712] border border-[#142646] rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#142646] pb-3">
            <div>
              <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider">
                CATEGORY: {explanation.category}
              </span>
              <h3 className="text-lg font-bold text-white mt-0.5">{explanation.title}</h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-3 py-1 rounded font-mono text-xs font-bold border ${
                  explanation.status_level === 'SUSPICIOUS'
                    ? 'bg-amber-950/40 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                }`}
              >
                STATUS: {explanation.status_level}
              </span>
            </div>
          </div>

          {/* Level 1: Overview */}
          {activeLevel === 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-bold">
                <Info className="w-4 h-4" />
                <span>SUMMARY &amp; PURPOSE</span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">{explanation.short_description}</p>
              <div className="bg-slate-900/80 border border-[#142646] rounded-lg p-3 mt-3">
                <span className="text-[11px] font-mono text-slate-400 block mb-1">OBSERVED VALUE:</span>
                <code className="text-cyan-300 font-mono font-bold text-sm">{explanation.current_value}</code>
              </div>
            </div>
          )}

          {/* Level 2: Technical Details */}
          {activeLevel === 2 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-bold">
                <Code className="w-4 h-4" />
                <span>TECHNICAL DEEP-DIVE &amp; RFC BACKGROUND</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed font-sans">{explanation.detailed_explanation}</p>
            </div>
          )}

          {/* Level 3: Evidence & Interpretation */}
          {activeLevel === 3 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-amber-400 font-bold">
                <ShieldAlert className="w-4 h-4" />
                <span>EVIDENCE-GROUNDED INTERPRETATION</span>
              </div>
              <p className="text-amber-200 text-xs font-sans bg-amber-950/20 border border-amber-500/30 rounded-lg p-3">
                {explanation.interpretation}
              </p>

              <div className="space-y-1">
                <span className="text-[11px] font-mono text-slate-400 block">OBSERVED EVIDENCE:</span>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-xs">
                  {explanation.evidence.map((ev, idx) => (
                    <li key={idx} className="font-mono">{ev}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Level 4: Analyst Next Steps */}
          {activeLevel === 4 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 font-bold">
                <Terminal className="w-4 h-4" />
                <span>RECOMMENDED ANALYST INVESTIGATION STEPS</span>
              </div>
              <div className="space-y-2">
                {explanation.analyst_next_steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-black/60 border border-[#142646] p-2.5 rounded-lg text-slate-200 text-xs"
                  >
                    <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}</>}
    </div>
  );
};
