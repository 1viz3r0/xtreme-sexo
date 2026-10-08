import { isTauriEnvironment } from './isTauri';

export interface WindowsEventEntry {
  timestamp: string;
  provider: string;
  event_id: number;
  level: string;
  message: string;
  channel: string;
}

export interface TelemetryPayload {
  rx_kbps: number;
  tx_kbps: number;
  rx_packets_delta: number;
  tx_packets_delta: number;
  rtt_avg_ms: number;
  active_tcp_count: number;
  timestamp: string;
}

/**
 * Invokes native get_windows_events command
 */
export async function getWindowsEvents(limit = 20): Promise<WindowsEventEntry[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<WindowsEventEntry[]>('get_windows_events', { limit });
    } catch (err) {
      console.warn('Failed to invoke native get_windows_events:', err);
      throw new Error(String(err));
    }
  }

  return [];
}

/**
 * Subscribes to real-time system-telemetry events from native Rust worker
 */
export async function subscribeToTelemetry(
  callback: (payload: TelemetryPayload) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<TelemetryPayload>('system-telemetry', (event) => {
        callback(event.payload);
      });
      return unlisten;
    } catch (err) {
      console.warn('Failed to subscribe to system.telemetry event:', err);
    }
  }

  return () => {};
}
