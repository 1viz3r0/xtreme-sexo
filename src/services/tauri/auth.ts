import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

export interface AuthUserView {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  created_at: number;
  last_login_at: number | null;
}

export interface ActivityView {
  id: number;
  timestamp: number;
  actor_email: string;
  action: string;
  detail: string;
}

export interface AuthSessionView {
  user: AuthUserView;
  token: string;
}

async function invokeAuth<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnvironment()) {
    throw new Error('AUTH_UNAVAILABLE_WEB_MODE');
  }
  return invoke<T>(cmd, args);
}

export const authRegister = (name: string, email: string, password: string) =>
  invokeAuth<AuthSessionView>('auth_register', { name, email, password });

export const authLogin = (email: string, password: string) =>
  invokeAuth<AuthSessionView>('auth_login', { email, password });

export const authLogout = (token: string) => invokeAuth<void>('auth_logout', { token });

export const authSession = (token: string) =>
  invokeAuth<AuthUserView | null>('auth_session', { token });

export const authMyActivity = (token: string, limit = 50) =>
  invokeAuth<ActivityView[]>('auth_my_activity', { token, limit });

export const adminListUsers = (token: string) =>
  invokeAuth<AuthUserView[]>('admin_list_users', { token });

export const adminListActivity = (token: string, limit = 100) =>
  invokeAuth<ActivityView[]>('admin_list_activity', { token, limit });

// Human-readable error messages for auth failures (no secrets leaked).
export function formatAuthError(code: string): string {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password.';
    case 'ACCOUNT_LOCKED_TRY_LATER':
      return 'Account temporarily locked after 5 failed attempts. Try again in 15 minutes.';
    case 'EMAIL_ALREADY_REGISTERED':
      return 'An account with this email already exists locally.';
    case 'EMAIL_INVALID':
      return 'That email address is not valid.';
    case 'NAME_INVALID':
      return 'Name must be 2-64 characters (letters, digits, spaces, - _ .).';
    case 'PASSWORD_INVALID_MIN_8_MAX_128':
      return 'Password must be 8-128 characters.';
    case 'EMPTY_CREDENTIALS':
      return 'Email and password are required.';
    case 'AUTH_REQUIRED_SESSION_INVALID_OR_EXPIRED':
      return 'Session expired. Please log in again.';
    case 'FORBIDDEN_ADMIN_ROLE_REQUIRED':
      return 'Admin role required for this operation.';
    case 'AUTH_UNAVAILABLE_WEB_MODE':
      return 'Authentication is only available in the desktop build.';
    default:
      return code || 'Unknown authentication error.';
  }
}

export function formatAuthTimestamp(unixSecs: number): string {
  if (!unixSecs) return '—';
  const d = new Date(unixSecs * 1000);
  return d.toLocaleString();
}
