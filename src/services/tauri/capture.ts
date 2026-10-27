import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

export interface NpcapInterface {
  id: string;
  name: string;
  description: string;
  ipv4_addresses: string[];
  ipv6_addresses: string[];
  mac_address: string;
  is_loopback: boolean;
}

export interface CaptureMetrics {
  status: string;
  selected_interface: string;
  packets_captured: number;
  bytes_captured: number;
  packets_per_sec: number;
  bytes_per_sec: number;
  dropped_packets: number;
  duration_secs: number;
}

/**
 * Diagnostics for the capture engine state
 */
export interface CaptureEngineDiagnostics {
  status: string;
  selected_interface: string;
  packets_captured: number;
  bytes_captured: number;
  duration_secs: number;
  capture_handle_open: boolean;
}

export interface PacketMetadata {
  timestamp: string;
  captured_len: number;
  orig_len: number;
  eth_type: string;
  src_mac: string;
  dst_mac: string;
  src_ip: string;
  dst_ip: string;
  protocol: string;
  src_port: number;
  dst_port: number;
  tcp_flags: number;
  arp_sender_ip: string;
  arp_sender_mac: string;
  dns_qname: string | null;
  dns_qtype: string;
  dns_rcode: number;
  dns_answers: number;
}

/**
 * Checks Npcap driver availability
 */
export async function inspectNpcapAvailability(): Promise<[string, string]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<[string, string]>('inspect_npcap_availability');
    } catch (err: any) {
      return ['ERROR', err?.message || 'Failed to inspect Npcap driver'];
    }
  }
  return [
    'UNAVAILABLE',
    'Desktop capability unavailable in browser mode. Run inside native Tauri desktop runtime.',
  ];
}

/**
 * Retrieves list of Npcap capture interfaces
 */
export async function getPcapInterfaces(): Promise<NpcapInterface[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<NpcapInterface[]>('get_pcap_interfaces');
    } catch (err) {
      console.warn('Failed to get Npcap interfaces:', err);
    }
  }
  return [];
}

/**
 * Starts packet capture on selected interface
 */
export async function startPacketCapture(interfaceId: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke('start_packet_capture', { interfaceId });
  }
}

/**
 * Stops active packet capture
 */
export async function stopPacketCapture(): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke('stop_packet_capture');
  }
}

/**
 * Gets live capture metrics
 */
export async function getCaptureMetrics(): Promise<CaptureMetrics> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<CaptureMetrics>('get_capture_metrics');
    } catch (err) {
      console.warn('Failed to get capture metrics:', err);
    }
  }
  return {
    status: 'STOPPED',
    selected_interface: 'eth0',
    packets_captured: 0,
    bytes_captured: 0,
    packets_per_sec: 0,
    bytes_per_sec: 0,
    dropped_packets: 0,
    duration_secs: 0,
  };
}

/**
 * Subscribes to capture.status events
 */
export async function subscribeToCaptureStats(
  callback: (metrics: CaptureMetrics) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<CaptureMetrics>('capture-stats', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to capture.stats:', err);
    }
  }
  return () => {};
}

/**
 * Gets capture engine diagnostics (state, interface, packet counts, handle status)
 */
export async function getCaptureEngineState(): Promise<CaptureEngineDiagnostics> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<CaptureEngineDiagnostics>('get_capture_engine_state');
    } catch (err) {
      console.warn('Failed to get capture engine state:', err);
    }
  }
  return {
    status: 'UNAVAILABLE',
    selected_interface: '',
    packets_captured: 0,
    bytes_captured: 0,
    duration_secs: 0,
    capture_handle_open: false,
  };
}

/**
 * Subscribes to capture.status events
 */
export async function subscribeToCaptureStatus(
  callback: (status: string) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<string>('capture-status', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to capture.status:', err);
    }
  }
  return () => {};
}
