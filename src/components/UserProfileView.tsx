import React, { useEffect, useState } from 'react';
import {
  UserCircle,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  Activity,
  Timer,
  Flag,
} from 'lucide-react';
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
