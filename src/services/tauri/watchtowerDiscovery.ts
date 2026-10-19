import { isTauriEnvironment } from './isTauri';

export interface ActiveLocalDevice {
  ip: string;
  mac: string | null;
  state: string;
  last_seen: string;
  seen_count: number;
  present: boolean;
  gateway: boolean;
  method: string;
  observed_at: string;
}

export interface ActiveLocalDiscovery {
  interface: string;
  local_ip: string;
  cidr: string;
  gateway: string | null;
  devices: ActiveLocalDevice[];
  warnings: string[];
}

export async function discoverLocalNetwork(): Promise<ActiveLocalDiscovery> {
  if (!isTauriEnvironment()) throw new Error('Active local discovery requires the native desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<ActiveLocalDiscovery>('watchtower_discover_local');
}
