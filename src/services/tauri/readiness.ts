import { isTauriEnvironment } from './isTauri';

export interface BackendReadiness {
  checked_at: string;
  platform: string;
  architecture: string;
  platform_supported: boolean;
  storage: {
    initialized: boolean;
    path: string | null;
    schema_readable: boolean;
    read_write_open: boolean;
    writes_verified: boolean;
    detail: string;
  };
  native_tools: { name: string; available: boolean; path: string | null; purpose: string }[];
  capture: {
    library: string;
    enumeration: 'AVAILABLE' | 'UNAVAILABLE';
    interface_count: number | null;
    permission: 'NOT_TESTED';
    detail: string;
  };
  last_errors: { source: string; message: string }[];
  error_scope: string;
  guidance: string[];
}

/** Passive diagnostics; rejects unavailable IPC instead of inventing healthy defaults. */
export async function getBackendReadiness(): Promise<BackendReadiness> {
  if (!isTauriEnvironment()) {
    throw new Error('Native readiness unavailable in browser mode. Open the installed NET0ZE desktop app.');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<BackendReadiness>('get_backend_readiness');
}
