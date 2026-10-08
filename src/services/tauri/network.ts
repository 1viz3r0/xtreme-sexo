import { isTauriEnvironment } from './isTauri';

export interface NetworkAdapterInfo {
  name: string;
  description: string;
  ip_addresses: string[];
  mac_address: string;
  is_up: boolean;
  is_loopback: boolean;
}

export interface DetailedAdapterInfo {
  name: string;
  friendly_name: string;
  description: string;
  mac_address: string;
  ipv4_addresses: string[];
  ipv6_addresses: string[];
  oper_status: string;
  interface_type: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
}

export interface TcpConnectionEntry {
  local_ip: string;
  local_port: number;
  remote_ip: string;
  remote_port: number;
  tcp_state: string;
  pid: number;
  process_name: string;
}

/**
 * Invokes native get_network_interfaces command or returns web fallback
 */
export async function getNetworkInterfaces(): Promise<NetworkAdapterInfo[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<NetworkAdapterInfo[]>('get_network_interfaces');
    } catch (err) {
      console.warn('Failed to invoke native get_network_interfaces:', err);
    }
  }

  return [];
}

/**
 * Invokes native get_detailed_network_interfaces command
 */
export async function getDetailedNetworkInterfaces(): Promise<DetailedAdapterInfo[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<DetailedAdapterInfo[]>('get_detailed_network_interfaces');
    } catch (err) {
      console.warn('Failed to invoke native get_detailed_network_interfaces:', err);
      throw new Error(String(err));
    }
  }

  return [];
}

/**
 * Invokes native get_active_tcp_connections command
 */
export async function getActiveTcpConnections(): Promise<TcpConnectionEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<TcpConnectionEntry[]>('get_active_tcp_connections');
    } catch (err) {
      console.warn('Failed to invoke native get_active_tcp_connections:', err);
      throw new Error(String(err));
    }
  }

  return [];
}
