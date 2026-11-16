import React, { useCallback, useEffect, useState } from 'react';
import {
  UserCircle,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Activity,
  Timer,
  Flag,
  RefreshCw,
  Loader2,
  Download,
  CheckCircle2,
  WifiOff,
  RotateCcw,
} from 'lucide-react';
import { useSharedUpdateGate } from '../lib/UpdateGateContext';
import {
  authSession,
  authMyActivity,
  formatAuthTimestamp,
} from '../services/tauri/auth';
import type { ActivityView, AuthUserView } from '../services/tauri/auth';
import type { TabType } from './Sidebar';
import { loadLabBadges, type LabBadge } from '../lib/labBadges';

interface UserProfileViewProps {
  user: { id?: string; name: string; email: string; role?: string; isVerified: boolean } | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  setActiveTab: (tab: TabType) => void;
}

const ACTION_LABELS: Record<string, string> = {
  REGISTER: 'Account registered',
  LOGIN: 'Logged in',
  LOGIN_FAILED: 'Failed login attempt',
  LOGOUT: 'Logged out',
};

/**
 * Settings → Updates. Mirrors the banner's honest semantics: an update is
 * only offered after a signature-verified manifest, nothing installs without
 * the explicit click, and failures degrade to a retry instead of blocking.
 */
const UpdatesCard: React.FC = () => {
  const { status, presentation, progress, installing, installError, checkNow, install } =
    useSharedUpdateGate();
  const [retryPending, setRetryPending] = useState(false);

  const checkVisible = useCallback(() => {
    setRetryPending(true);
    checkNow().finally(() => setRetryPending(false));
  }, [checkNow]);

  const checking =
    retryPending || status?.check_in_progress === true || presentation.kind === 'checking';
  const updateAvailable = presentation.kind === 'banner' || presentation.kind === 'gate';
  const upToDate =
    presentation.kind === 'idle' && status != null && status.last_check_ok === true;
  const checkFailed =
    presentation.kind === 'stale' || (!checking && status?.last_check_ok === false);
  const stage = progress?.stage ?? null;
  const downloadPct =
    stage === 'download' && progress?.total_bytes
      ? Math.min(100, Math.round(((progress.downloaded_bytes ?? 0) / progress.total_bytes) * 100))
      : null;

  return (
    <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-5 lg:col-span-3">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-slate-400">
          <RefreshCw className="h-4 w-4 text-cyan-500" /> UPDATES
        </h2>
        <span className="text-[11px] text-slate-600">
          auto-check on start + every 6 hours · signed manifests only
        </span>
      </div>

      {!status ? (
        <p className="text-xs text-slate-500">
          Update service unavailable — update checks run only inside the desktop runtime.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
            <span>
              Installed: <span className="font-mono text-slate-200">{status.app_version}</span>
            </span>
            <span>
              Latest: <span className="font-mono text-slate-200">{status.latest_version ?? '—'}</span>
            </span>
            <span className="flex items-center gap-1.5">
              {checking ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-cyan-400" /> Checking for updates…
                </>
              ) : updateAvailable ? (
                <>
                  <Download className="h-3 w-3 text-amber-400" /> Update available
                  {status.severity ? ` (${status.severity})` : ''}
                </>
              ) : upToDate ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" /> Up to date
                </>
              ) : checkFailed ? (
                <>
                  <WifiOff className="h-3 w-3 text-amber-400" /> Last check failed
                  {status.last_error ? ` — ${status.last_error}` : ' — the app stays fully usable.'}
                </>
              ) : (
                <>No update check yet</>
              )}
            </span>
            <button
              type="button"
              onClick={checkVisible}
              disabled={checking || installing}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 font-mono text-[11px] font-bold tracking-wider text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} /> CHECK FOR
              UPDATES
            </button>
          </div>

          {updateAvailable && !status.advisory_only && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={install}
                disabled={installing}
                className="flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 font-mono text-xs font-bold tracking-wider text-white transition hover:bg-cyan-600 disabled:opacity-50"
              >
                {installing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {installing ? 'INSTALLING…' : 'DOWNLOAD & INSTALL'}
              </button>
              <span className="text-[11px] text-slate-600">
                Nothing installs without this click; the manifest signature is verified first.
              </span>
            </div>
          )}
          {updateAvailable && status.advisory_only && (
            <p className="mt-3 text-[11px] text-amber-300/80">
              Unverified advisory notice — this update was not enforced or installed.
            </p>
          )}

          {installing && stage === 'download' && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all"
                  style={{ width: `${downloadPct ?? 10}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Downloading update{downloadPct != null ? ` — ${downloadPct}%` : '…'}
              </p>
            </div>
          )}
          {stage === 'installer_launched' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-300">
              <RotateCcw className="h-3.5 w-3.5 shrink-0" />
              RESTART TO UPDATE — the installer is running; it restarts NET0ZE when it finishes.
            </div>
          )}
          {stage === 'installed_restarting' && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-800/50 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Update installed — restarting into the new build…
            </div>
          )}

          {installError && <p className="mt-3 text-[11px] text-red-300">Install failed: {installError}</p>}

          <p className="mt-3 border-t border-slate-800 pt-3 text-[10px] text-slate-600">
            {status.last_check_at
              ? `Last check ${new Date(status.last_check_at).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}${status.last_check_ok === false ? ' (failed)' : ''} · `
              : 'Never checked · '}
            {status.endpoint} · key {status.signature_key_id}
          </p>
        </>
      )}
    </div>
  );
};

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  user,
  onOpenAuth,
  onLogout,
}) => {
  const [liveUser, setLiveUser] = useState<AuthUserView | null>(null);
  const [activity, setActivity] = useState<ActivityView[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [labBadges, setLabBadges] = useState<LabBadge[]>([]);

  useEffect(() => {
    if (!user) {
      setLiveUser(null);
      setActivity([]);
      setSessionError(null);
      setLabBadges([]);
      return;
    }
    setLabBadges(loadLabBadges(user.id || 'guest'));
    const token = localStorage.getItem('netoze_token');
    if (!token) {
      setSessionError('No local session token found. Please log in again.');
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const u = await authSession(token);
        if (cancelled) return;
        if (!u) {
          setSessionError('Session expired. Please log in again.');
          return;
        }
        setLiveUser(u);
        setSessionError(null);
        const acts = await authMyActivity(token, 50);
        if (!cancelled) setActivity(acts);
      } catch (err) {
        if (!cancelled) {
          setSessionError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) {
    return (
      <div className="enterprise-page enterprise-profile-empty flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border-2 border-slate-800 bg-slate-950 p-8 text-center">
          <ShieldAlert className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h2 className="font-mono text-lg font-bold tracking-widest text-slate-200">
            NO ACTIVE SESSION
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Log in or register a local desktop account to view your identity, role and
            account activity history.
          </p>
          <button
            onClick={onOpenAuth}
            className="mt-5 rounded-lg bg-cyan-700 px-5 py-2 font-mono text-sm font-bold tracking-wider text-white transition hover:bg-cyan-600"
          >
            LOG IN / REGISTER
          </button>
        </div>
      </div>
    );
  }

  const role = (liveUser?.role ?? user.role ?? 'user').toUpperCase();
  const isAdmin = role === 'ADMIN';

  return (
    <div className="enterprise-page enterprise-profile-page h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
         <h1 className="font-mono text-lg font-bold tracking-widest text-cyan-300">
           PROFILE / ACCOUNT
        </h1>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 rounded-lg border border-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40"
        >
          <LogOut className="h-3.5 w-3.5" /> SIGN OUT
        </button>
      </div>

      {sessionError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {sessionError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-5">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-3 ${isAdmin ? 'bg-cyan-950/60' : 'bg-slate-900'}`}>
              <UserCircle className={`h-8 w-8 ${isAdmin ? 'text-cyan-400' : 'text-slate-400'}`} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-200">
                {liveUser?.name ?? user.name}
              </div>
              <div className="text-xs text-slate-500">{liveUser?.email ?? user.email}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-1 font-mono text-[11px] font-bold tracking-wider ${
                isAdmin
                  ? 'bg-cyan-800/40 text-cyan-300'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              ROLE: {role}
            </span>
            <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] font-bold tracking-wider text-emerald-300">
              {((liveUser?.status ?? 'active') === 'active' ? 'ACTIVE' : 'LOCKED')}
            </span>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-800 pt-3 text-xs text-slate-500">
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5">
                <Flag className="h-3 w-3" /> Member since
              </span>
              <span className="text-slate-300">
                {formatAuthTimestamp(liveUser?.created_at ?? 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-1.5">
                <Timer className="h-3 w-3" /> Last login
              </span>
              <span className="text-slate-300">
                {formatAuthTimestamp(liveUser?.last_login_at ?? 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-slate-400">
              <Activity className="h-4 w-4 text-cyan-500" /> LOCAL ACCOUNT ACTIVITY
            </h2>
            <span className="text-[11px] text-slate-600">netoze_auth.json</span>
          </div>
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500">Loading activity…</div>
          ) : activity.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-600">
              No activity recorded yet for this account.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Event</th>
                    <th className="py-2">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activity.map((a) => (
                    <tr key={a.id} className="text-slate-400">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {formatAuthTimestamp(a.timestamp)}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-300">
                        {ACTION_LABELS[a.action] ?? a.action}
                      </td>
                      <td className="py-2 text-slate-500">{a.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <UpdatesCard />
        <div className="rounded-2xl border-2 border-amber-800/40 bg-slate-950 p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-mono text-xs font-bold tracking-widest text-amber-300">FREE LAB BADGES</h2><span className="text-[11px] text-slate-600">earned locally · no purchase required</span></div>
          {labBadges.length === 0 ? <p className="text-xs text-slate-500">Complete a mastery lesson or an authorized native challenge to earn your first badge.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{labBadges.map(badge => <article key={badge.id} className="rounded-lg border border-amber-700/40 bg-amber-950/10 p-3"><b className="text-sm text-amber-100">{badge.title}</b><p className="mt-1 text-xs text-slate-400">{badge.description}</p><p className="mt-2 text-[10px] text-slate-600">Earned {new Date(badge.earnedAt).toLocaleDateString()}</p></article>)}</div>}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-[11px] leading-relaxed text-slate-600">
        <ShieldCheck className="mb-1 h-4 w-4 text-cyan-700" />
        Local account administration is enforced by the Rust backend: sessions, roles and
        rate limiting are validated inside the desktop application, not in the UI.
      </div>
    </div>
  );
};
