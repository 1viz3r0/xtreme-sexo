import { isTauriEnvironment } from './isTauri';
export interface WatchtowerInterface { name: string; addresses: string[]; mac_address: string | null; oper_state: string | null; counters: { receive_bytes: number | null; transmit_bytes: number | null; receive_packets: number | null; transmit_packets: number | null }; wifi_ssid: string | null; wifi_bssid: string | null; wifi_association: string | null; warnings: string[] }
export interface WatchtowerRoute { interface: string; destination: string; gateway: string | null; metric: number | null; active: boolean }
export interface WatchtowerNeighbor { interface: string; address: string; mac_address: string; state: string }
export interface WatchtowerSnapshot { captured_at: string; captured_at_unix_ms: number; interfaces: WatchtowerInterface[]; routes: WatchtowerRoute[]; default_gateway: string | null; neighbors: WatchtowerNeighbor[]; stale: boolean; warnings: string[] }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isString(value: unknown): value is string { return typeof value === 'string'; }
function isNullableString(value: unknown): value is string | null { return value === null || isString(value); }
function isNullableSafeInteger(value: unknown): value is number | null { return value === null || (typeof value === 'number' && Number.isSafeInteger(value)); }

/** Validate native IPC before rendering; malformed data must never become invented UI. */
export function validateWatchtowerSnapshot(value: unknown): WatchtowerSnapshot {
   if (!isRecord(value) || !isString(value.captured_at) || !isNullableSafeInteger(value.captured_at_unix_ms) || value.captured_at_unix_ms === null || typeof value.stale !== 'boolean' || !Array.isArray(value.interfaces) || !Array.isArray(value.routes) || !Array.isArray(value.neighbors) || !Array.isArray(value.warnings)) throw new Error('Watchtower returned an invalid native snapshot.');
   if (!value.interfaces.every((item) => isRecord(item) && isString(item.name) && Array.isArray(item.addresses) && item.addresses.every(isString) && isNullableString(item.mac_address) && isNullableString(item.oper_state) && isRecord(item.counters) && isNullableSafeInteger(item.counters.receive_bytes) && isNullableSafeInteger(item.counters.transmit_bytes) && isNullableSafeInteger(item.counters.receive_packets) && isNullableSafeInteger(item.counters.transmit_packets) && isNullableString(item.wifi_ssid) && isNullableString(item.wifi_bssid) && isNullableString(item.wifi_association) && Array.isArray(item.warnings) && item.warnings.every(isString))) throw new Error('Watchtower returned invalid interface data.');
   if (!value.routes.every((item) => isRecord(item) && isString(item.interface) && isString(item.destination) && isNullableString(item.gateway) && isNullableSafeInteger(item.metric) && typeof item.active === 'boolean')) throw new Error('Watchtower returned invalid route data.');
  if (!value.neighbors.every((item) => isRecord(item) && isString(item.interface) && isString(item.address) && isString(item.mac_address) && isString(item.state))) throw new Error('Watchtower returned invalid neighbor data.');
  if (!value.warnings.every(isString) || !isNullableString(value.default_gateway)) throw new Error('Watchtower returned invalid warning data.');
  return value as unknown as WatchtowerSnapshot;
}
export async function getWatchtowerSnapshot(refresh = false): Promise<WatchtowerSnapshot> {
  if (!isTauriEnvironment()) throw new Error('Watchtower native snapshot is unavailable outside the desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  const value: unknown = await invoke(refresh ? 'refresh_watchtower_snapshot' : 'get_watchtower_snapshot');
  return validateWatchtowerSnapshot(value);
}
