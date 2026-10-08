import { isTauriEnvironment } from './isTauri';

export interface SystemInfo {
  os_name: string;
  os_version: string;
  hostname: string;
  architecture: string;
  user_name: string;
  is_admin: boolean;
}

export interface DetailedSystemInfo {
  hostname: string;
  os_name: string;
  os_version: string;
  architecture: string;
  cpu_model: string;
  cpu_core_count: number;
  ram_total_bytes: number;
  ram_available_bytes: number;
  ram_usage_percent: number;
  uptime_seconds: number;
  user_name: string;
  is_admin: boolean;
}

/**
 * Invokes native get_system_info command or returns web dev fallback
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SystemInfo>('get_system_info');
    } catch (err) {
      console.warn('Failed to invoke native get_system_info:', err);
    }
  }

  return {
    os_name: 'Unavailable',
    os_version: 'Native desktop required',
    hostname: 'Unavailable',
    architecture: 'Browser sandbox',
    user_name: 'Unavailable',
    is_admin: false,
  };
}

/**
 * Invokes native get_detailed_system_info command or returns web dev fallback
 */
export async function getDetailedSystemInfo(): Promise<DetailedSystemInfo> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DetailedSystemInfo>('get_detailed_system_info');
    } catch (err) {
      console.warn('Failed to invoke native get_detailed_system_info:', err);
      throw new Error(String(err));
    }
  }

  return {
    hostname: 'Unavailable',
    os_name: 'Unavailable',
    os_version: 'Native desktop required',
    architecture: 'Browser sandbox',
    cpu_model: 'Unavailable',
    cpu_core_count: 0,
    ram_total_bytes: 0,
    ram_available_bytes: 0,
    ram_usage_percent: 0,
    uptime_seconds: 0,
    user_name: 'Unavailable',
    is_admin: false,
  };
}
