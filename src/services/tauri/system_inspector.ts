import { isTauriEnvironment } from './isTauri';

export interface HostIdentity {
  hostname: string;
  os_family: string;
  os_version: string;
  architecture: string;
  app_version: string;
}

export interface TcpSocketEntry {
  local_ip: string;
  local_port: number;
  remote_ip: string;
  remote_port: number;
  state: string;
  pid: number;
  process_name: string;
  executable_path: string;
  address_family: string;
  timestamp: number;
}

export interface ProcessEntry {
  pid: number;
  process_name: string;
  executable_path: string;
  cpu_usage: number;
  memory_bytes: number;
  start_time: number;
}

export interface NetworkInterfaceEntry {
  interface_id: string;
  name: string;
  mac_address: string;
  ipv4_addresses: string[];
  ipv6_addresses: string[];
  operational_state: string;
  link_speed_mbps: number;
}

export interface WindowsServiceEntry {
  service_name: string;
  display_name: string;
  state: string;
  start_type: string;
}

export interface SocketProcessCorrelation {
  correlation_id: string;
  flow_id: string;
  local_endpoint: string;
  remote_endpoint: string;
  pid: number;
  process_name: string;
  confidence: string;
  timestamp: number;
}

export interface SystemSnapshot {
  timestamp: number;
  host_identity: HostIdentity;
  tcp_sockets: TcpSocketEntry[];
  processes: ProcessEntry[];
  interfaces: NetworkInterfaceEntry[];
  services: WindowsServiceEntry[];
  correlations: SocketProcessCorrelation[];
}

/**
 * Gets host identity info
 */
export async function getHostIdentity(): Promise<HostIdentity> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<HostIdentity>('get_host_identity');
    } catch (err) {
      console.warn('Failed to get host identity:', err);
    }
  }
  return {
    hostname: 'Unavailable',
    os_family: 'unknown',
    os_version: 'Native desktop required',
    architecture: 'Browser sandbox',
    app_version: 'unknown',
  };
}

/**
 * Gets active system snapshot
 */
export async function getSystemSnapshot(): Promise<SystemSnapshot | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SystemSnapshot>('get_system_snapshot');
    } catch (err) {
      console.warn('Failed to get system snapshot:', err);
    }
  }
  return null;
}

/**
 * Gets active TCP sockets
 */
export async function getTcpSockets(): Promise<TcpSocketEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<TcpSocketEntry[]>('get_tcp_sockets');
    } catch (err) {
      console.warn('Failed to get TCP sockets:', err);
    }
  }
  return [];
}

/**
 * Gets process inventory
 */
export async function getProcessInventory(): Promise<ProcessEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ProcessEntry[]>('get_process_inventory');
    } catch (err) {
      console.warn('Failed to get process inventory:', err);
    }
  }
  return [];
}

/**
 * Gets socket process correlations
 */
export async function getSocketCorrelations(): Promise<SocketProcessCorrelation[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SocketProcessCorrelation[]>('get_socket_correlations');
    } catch (err) {
      console.warn('Failed to get socket correlations:', err);
    }
  }
  return [];
}
