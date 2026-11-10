import React from 'react';
import { CircleAlert, Info, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useUpdateGate } from '../lib/useUpdateGate';

function timeOf(ms: number | null): string | null {
  if (ms == null) return null;
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Slender status strip above the workspace. It never gates: informational,
 * low, moderate and high notices stay dismissable-by-navigating philosophy —
 * the workspace itself is untouched. Blocked builds are handled exclusively
 * by the gate overlay.
 */
export const UpdateBanner: React.FC = () => {
  const { presentation, status, checkNow } = useUpdateGate();

  if (presentation.kind !== 'banner' && presentation.kind !== 'checking' && presentation.kind !== 'stale') {
    return null;
  }

  const lastCheck = timeOf(status?.last_check_at ?? null);

  if (presentation.kind === 'checking') {
    return (
      <div className="update-banner update-banner--stub" role="status">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        <span className="update-banner__message">Checking for updates…</span>
      </div>
    );
  }

  if (presentation.kind === 'stale') {
    return (
      <div className="update-banner update-banner--stub" role="status">
        <CircleAlert className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="update-banner__message">
          Last update check failed{lastCheck ? ` at ${lastCheck}` : ''} — the app stays fully usable; nothing is gated.
        </span>
        <button type="button" className="update-banner__button" onClick={checkNow}>
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
        </button>
      </div>
    );
  }

  const tone = presentation.tone;
  const advisory = status?.advisory_only ?? false;
  const Icon = tone === 'informational' || tone === 'low' ? Info : tone === 'moderate' ? CircleAlert : ShieldAlert;

  return (
    <div className={`update-banner update-banner--${tone}`} role="status">
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span className="update-banner__message" aria-live="polite">{presentation.message}</span>
      <span className="update-banner__meta">
        {advisory
          ? 'Unverified notice — this update was not enforced or installed'
          : `NET0ZE ${status?.channel ?? 'stable'} · ${presentation.tone} update`}
      </span>
      {!advisory && (
        <button type="button" className="update-banner__button" onClick={checkNow}>
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> Check
        </button>
      )}
    </div>
  );
};
