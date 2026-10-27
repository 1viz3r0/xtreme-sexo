import React, { useState } from 'react';
import { FileText, CheckCircle, Sparkles, Zap, ExternalLink, BookOpen } from 'lucide-react';

interface StorylineInspectorProps {
  event: any | null;
}

export const StorylineInspector: React.FC<StorylineInspectorProps> = ({
  event,
}) => {
  const [showAiDraft, setShowAiDraft] = useState<boolean>(false);

  if (!event) {
    return (
      <div className="cyber-card p-6 text-center text-slate-400 font-mono text-xs">
        <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
        <p className="font-bold text-white">No Event Selected</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Select any conversation from the table to inspect its plain-language storyline and educational insight.
        </p>
      </div>
    );
  }

  const getSeverityBadge = (sev: string) => {
    const map: Record<string, string> = {
      CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/40',
      HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      LOW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
      INFO: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    };
    const cls = map[sev] || 'bg-slate-500/20 text-slate-400 border-slate-500/40';
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${cls}`}>
        {sev} SEVERITY
      </span>
    );
  };

  return (
    <div className="cyber-card p-5 space-y-4 font-mono text-xs">
      {/* Header and badges */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-[#142646] pb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {getSeverityBadge(event.severity)}
            <span className="text-xs font-mono text-slate-400">
              Confidence: {Math.round(event.confidence * 100)}%
            </span>
          </div>
          <h2 className="text-base font-bold text-white mt-1">{event.title}</h2>
        </div>

        {/* AI Narrator toggle */}
        <button
          onClick={() => setShowAiDraft(!showAiDraft)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
            showAiDraft
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-md shadow-purple-500/20'
              : 'bg-slate-800 text-slate-300 border-[#142646] hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          {showAiDraft ? 'Hide AI Executive Draft' : 'AI Narrator Draft'}
        </button>
      </div>

      {/* AI Draft Panel */}
      {showAiDraft && (
        <div className="bg-purple-950/30 border border-purple-500/40 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-mono text-purple-300">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span className="font-bold">LOCAL LLM EXECUTIVE DRAFT (DRAFT-ONLY)</span>
          </div>
          <p className="text-xs text-purple-100 font-sans leading-relaxed">
            [EXECUTIVE DRAFT - NOT AUTHORITATIVE] A {event.severity}-severity security event ('
            {event.title}') was detected with {Math.round(event.confidence * 100)}% confidence.{' '}
            {event.storyline_summary} Immediate defensive isolation and EDR telemetry review are advised.
          </p>
        </div>
      )}

      {/* Main Narrative Storyline */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          What Happened (Plain-Language Storyline)
        </h3>
        <div className="bg-[#050b18] border border-[#142646] rounded-lg p-3.5 text-slate-200 leading-relaxed font-sans text-xs">
          {event.storyline_summary}
        </div>
      </div>

      {/* Technical Explanation */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-amber-400" />
          Technical Explanation
        </h3>
        <div className="bg-[#050b18] border border-[#142646] rounded-lg p-3.5 text-slate-300 leading-relaxed text-xs">
          {event.technical_explanation}
        </div>
      </div>

      {/* MITRE ATT&CK Mapping */}
      {event.mitre_attack && event.mitre_attack.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider font-mono">
            MITRE ATT&amp;CK v19 Taxonomy
          </h3>
          <div className="flex flex-wrap gap-2">
            {event.mitre_attack.map((m: any, idx: number) => (
              <div
                key={idx}
                className="bg-slate-900 border border-[#142646] rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-xs font-mono"
              >
                <span className="text-cyan-400 font-bold">
                  {m.tactic_id} / {m.technique_id}
                </span>
                <span className="text-slate-300">
                  {m.tactic_name}: <span className="font-semibold text-white">{m.technique_name}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Actions */}
      {event.suggested_actions && event.suggested_actions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            Suggested Defensive Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {event.suggested_actions.map((act: string, idx: number) => (
              <div
                key={idx}
                className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg px-3 py-2 text-xs text-emerald-200 flex items-center gap-2 font-mono"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {act}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Educational Insight Card */}
      {event.educational_insight && (
        <div className="bg-gradient-to-r from-cyan-950/30 to-blue-950/30 border border-cyan-500/40 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-cyan-400 font-mono font-bold text-xs">
              <BookOpen className="w-4 h-4" />
              <span>TEACHES LIKE A PROFESSOR — {event.educational_insight.concept_name}</span>
            </div>
            {event.educational_insight.documentation_link && (
              <a
                href={event.educational_insight.documentation_link}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-mono text-cyan-400 hover:underline flex items-center gap-1"
              >
                <span>RFC Spec / Docs</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-sans">
            <div className="bg-[#050b18] rounded-lg p-3 border border-cyan-500/20">
              <span className="text-[10px] font-mono text-cyan-300 font-bold block mb-1">
                WHAT IT IS:
              </span>
              <p className="text-slate-200 leading-relaxed text-xs">
                {event.educational_insight.what_it_is}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
