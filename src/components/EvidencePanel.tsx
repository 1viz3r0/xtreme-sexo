import React from 'react';
import { Shield, Calculator, CheckCircle2 } from 'lucide-react';

interface EvidencePanelProps {
  flow: any | null;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ flow }) => {
  if (!flow) {
    return (
      <div className="cyber-card p-6 text-center text-slate-400 font-mono text-xs">
        <Shield className="w-10 h-10 text-slate-600 mx-auto mb-2" />
        <p className="font-bold text-white">No Flow Selected</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Select any conversation from the table to view its explainable threat score breakdown and mathematical evidence trace.
        </p>
      </div>
    );
  }

  const breakdown = flow.score_breakdown || [];

  return (
    <div className="cyber-card p-5 space-y-4 font-mono text-xs">
      {/* Title / Overall Score Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-[#142646] pb-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <Calculator className="w-4 h-4" />
            <span>EXPLAINABLE SECURITY SCORE BREAKDOWN (ADR D-007)</span>
          </div>
          <h2 className="text-base font-bold text-white mt-1">
            Why this score? <span className="text-cyan-400">{flow.threat_score} / 100</span> (
            {flow.severity})
          </h2>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5">
            Flow ID: <span className="text-slate-200">{flow.flow_id}</span> | Confidence:{' '}
            <span className="text-slate-200">{Math.round(flow.confidence * 100)}%</span>
          </p>
        </div>

        {/* Mandatory math badge */}
        <div className="bg-[#050b18] border border-cyan-500/30 rounded-lg p-2.5 text-xs font-mono">
          <span className="text-slate-400 block text-[9px]">THREAT SCORING FORMULA</span>
          <span className="text-cyan-400 font-bold text-[11px]">
            threat_score = round(100 × &Sigma;(w<sub>i</sub> × s<sub>i</sub>))
          </span>
        </div>
      </div>

      {/* Component breakdown bar charts */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
          Evidence Components &amp; Weighted Contribution
        </h3>

        {breakdown.map((item: any, idx: number) => {
          const weightedScore = Math.round(item.weight * item.score * 100);
          const percentVal = Math.round(item.score * 100);
          return (
            <div
              key={idx}
              className="bg-[#050b18] border border-[#142646] rounded-lg p-3 space-y-1.5 font-mono text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-cyan-400 uppercase">{item.component}</span>
                  <span className="text-slate-400">
                    (Weight: <strong className="text-slate-200">{item.weight}</strong>)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-[11px]">
                    Signal s<sub>i</sub>: <strong className="text-white">{item.score}</strong>
                  </span>
                  <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-bold text-[11px]">
                    +{weightedScore} pts
                  </span>
                </div>
              </div>

              {/* Bar chart progress */}
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${percentVal}%` }}
                />
              </div>

              {/* Attached evidence strings */}
              <div className="pt-0.5">
                <span className="text-slate-400 text-[10px]">EVIDENCE REFERENCES:</span>
                <ul className="list-disc list-inside text-slate-200 space-y-0.5 mt-0.5">
                  {item.evidence && item.evidence.map((ev: string, idx2: number) => (
                    <li key={idx2} className="text-[11px] font-sans">
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Interactive Mathematical Verification Footer */}
      <div className="bg-slate-950 border border-[#142646] rounded-lg p-3 space-y-1 font-mono text-xs">
        <div className="flex items-center gap-2 text-cyan-400 font-bold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>VERIFIED MATHEMATICAL EVIDENCE CALCULATION</span>
        </div>
        <p className="text-slate-300 text-[11px]">
          {breakdown
            .map((b: any) => `${b.weight}×${b.score} (${(b.weight * b.score).toFixed(4)})`)
            .join(' + ')}{' '}
          ={' '}
          <strong className="text-cyan-400">
            {breakdown.reduce((acc: number, b: any) => acc + b.weight * b.score, 0).toFixed(4)}
          </strong>{' '}
          &rarr; <strong className="text-white">{flow.threat_score}</strong> &rarr;{' '}
          <strong className="text-orange-400">{flow.severity}</strong>
        </p>
      </div>
    </div>
  );
};
