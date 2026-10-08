import { isTauriEnvironment } from './isTauri';

export interface RuntimeLogStatus {
  available: boolean;
  reason: string | null;
  generated_at: string;
  timezone: string;
  initialized_at: string | null;
  last_write_at: string | null;
  file_count: number;
  retained_bytes: number;
  max_file_bytes: number;
  max_files: number;
  max_read_bytes: number;
}
export interface RecentRuntimeLogs {
  status: RuntimeLogStatus;
  byte_limit: number;
  bytes_read: number;
  truncated: boolean;
  chunks: { file_id: string; modified_at: string | null; text: string; bytes_read: number }[];
}

export async function getRecentRuntimeLogs(): Promise<RecentRuntimeLogs> {
  if (!isTauriEnvironment()) throw new Error('Application logs require the native desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<RecentRuntimeLogs>('get_recent_runtime_logs', { maxBytes: 65536 });
}
