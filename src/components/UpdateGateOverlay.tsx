import React from 'react';
import { Download, ExternalLink, FolderDown, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { useSharedUpdateGate } from '../lib/UpdateGateContext';

/**
 * Block screen for a verified mandatory update or a security floor.
 *
 * Deliberately NOT a full-window trap: it covers the workspace only, so
 * navigation, recovery, diagnostics and every other tool remain reachable
 * while the gate is up — the safest possible reading of "the update gate
 * never blocks recovery". Data export is a first-class button here and the
 * same window is openable from anywhere via the data-folder command.
 */
export const UpdateGateOverlay: React.FC = () => {
  const { presentation, progress, installing, installError, install, checkNow, openDataFolder, status } = useSharedUpdateGate();

  if (presentation.kind !== 'gate') {
    return null;
  }

  let progressLine: React.ReactNode = null;
  if (progress?.stage === 'download' && progress.total_bytes && progress.total_bytes > 0) {
    const percent = Math.min(
      100,
      Math.round(((progress.downloaded_bytes ?? 0) / progress.total_bytes) * 100)
    );
    progressLine = (
      <span className="update-gate__progress" aria-live="polite">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        Downloading verified update… {percent}%
      </span>
    );
  } else if (progress?.stage === 'installed_restarting') {
    progressLine = <span className="update-gate__progress">Installed — restarting NET0ZE…</span>;
  } else if (progress?.stage === 'installer_launched') {
    progressLine = (
      <span className="update-gate__progress">Installer opened — finish it to complete the update.</span>
    );
  }

  const lastCheck = status?.last_check_at != null
    ? new Date(status.last_check_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="update-gate"
      role="dialog"
      aria-modal="false"
      aria-label="Update required"
    >
      <div className="update-gate__panel">
        <div className="update-gate__head">
          <ShieldAlert className="w-5 h-5" aria-hidden="true" />
          <h2>Update required</h2>
          {presentation.required && (
            <span className="update-gate__version">v{presentation.required}</span>
          )}
        </div>
        <p className="update-gate__reason">{presentation.message}</p>
        {progressLine}
        {installError && (
          <p className="update-gate__error" role="alert">{installError}</p>
        )}
        <div className="update-gate__actions">
          <button
            type="button"
            className="update-gate__primary"
            onClick={install}
            disabled={installing}
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            {installing ? 'Working…' : 'Update now'}
          </button>
          <button type="button" className="update-gate__secondary" onClick={checkNow} disabled={installing}>
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check again
          </button>
          <button type="button" className="update-gate__secondary" onClick={openDataFolder}>
            <FolderDown className="w-3.5 h-3.5" aria-hidden="true" /> Open data folder
          </button>
        </div>
        <p className="update-gate__note">
          Recovery, diagnostics and every other tool stay reachable from the navigation sidebar; user data can be
          exported at any time.
          {status?.notes_url && !status.advisory_only && (
            <>
              {' '}
              <a href={status.notes_url} target="_blank" rel="noreferrer" className="update-gate__link">
                Release notes <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </a>
            </>
          )}
          {lastCheck && ` Last check ${lastCheck}.`}
        </p>
      </div>
    </div>
  );
};
