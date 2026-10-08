import React, { useState } from 'react';
import { X, Info, Loader2, KeyRound } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import {
  authLogin,
  authRegister,
  formatAuthError,
} from '../services/tauri/auth';
import type { AuthUserView } from '../services/tauri/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (
    user: { id?: string; name: string; email: string; role?: string; isVerified: boolean },
    token: string
  ) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setMode('login');
    setName('');
    setEmail('');
    setPassword('');
    setConfirm('');
    setError(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirm) {
        setError('Passwords do not match.');
        return;
      }
      if (name.trim().length < 2) {
        setError('Name must be at least 2 characters.');
        return;
      }
    }
    if (email.trim().length === 0) {
      setError('Email is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const session =
        mode === 'register'
          ? await authRegister(name.trim(), email.trim(), password)
          : await authLogin(email.trim(), password);
      localStorage.setItem('netoze_token', session.token);
      const u: AuthUserView = session.user;
      onLoginSuccess(
        { id: u.id, name: u.name, email: u.email, role: u.role, isVerified: true },
        session.token
      );
      reset();
      onClose();
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      try {
        const parsed = JSON.parse(raw);
        setError(formatAuthError(parsed.message ?? ''));
      } catch {
        setError(raw.startsWith('AUTH_') ? formatAuthError(raw) : raw);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border-2 border-cyan-800/60 bg-slate-950 p-6 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo compact />
            <div>
              <h2 className="font-mono text-sm font-bold tracking-widest text-cyan-300">
                NETOZE AUTHENTICATION
              </h2>
              <p className="text-xs text-slate-500">Local desktop account — no cloud</p>
            </div>
          </div>
          <button onClick={close} disabled={busy} className="text-slate-500 hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              disabled={busy}
              className={`flex-1 rounded-md py-1.5 font-mono text-xs font-semibold transition ${
                mode === m
                  ? 'bg-cyan-700/60 text-cyan-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'login' ? 'LOG IN' : 'REGISTER'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              maxLength={64}
              disabled={busy}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-600"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            maxLength={254}
            disabled={busy}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-600"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            maxLength={128}
            disabled={busy}
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-600"
          />
          {mode === 'register' && (
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              maxLength={128}
              disabled={busy}
              className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-600"
            />
          )}

          {error && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-700 py-2 font-mono text-sm font-bold tracking-wider text-white transition hover:bg-cyan-600 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> PROCESSING…
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                {mode === 'login' ? 'AUTHENTICATE' : 'CREATE LOCAL ACCOUNT'}
              </>
            )}
          </button>
        </form>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700" />
          <span>
            Passwords are hashed locally with PBKDF2-HMAC-SHA256 and never leave this machine.
            The first registered local account becomes the ADMINISTRATOR; later accounts have
            the USER role. 5 failed logins lock an account for 15 minutes.
          </span>
        </div>
      </div>
    </div>
  );
};
