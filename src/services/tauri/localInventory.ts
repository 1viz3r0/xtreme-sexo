import { isTauriEnvironment } from './isTauri';
import type { DetailedAdapterInfo } from './network';
import type { DeviceEntry } from './intel';

/** Strict, passive inventory commands used by Watchtower. */
function requireTauri(command: string): void {
  if (!isTauriEnvironment()) throw new Error(`${command} is unavailable outside the native app.`);
}

async function invokeInventory<T>(command: string): Promise<T> {
  requireTauri(command);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke<T>(command);
  } catch {
    // Do not expose IPC payloads (which may contain local paths or device data).
    throw new Error(`${command} failed.`);
  }
}

export function getDetailedNetworkInterfacesStrict(): Promise<DetailedAdapterInfo[]> {
  return invokeInventory<DetailedAdapterInfo[]>('get_detailed_network_interfaces');
}

export function getDevicesStrict(): Promise<DeviceEntry[]> {
  return invokeInventory<DeviceEntry[]>('get_devices');
}

export function refreshDevicesStrict(): Promise<DeviceEntry[]> {
  return invokeInventory<DeviceEntry[]>('refresh_devices');
}

export interface LocalInventorySources {
  getDetailedNetworkInterfaces: typeof getDetailedNetworkInterfacesStrict;
  getDevices: typeof getDevicesStrict;
  refreshDevices: typeof refreshDevicesStrict;
}

export const localInventorySources: LocalInventorySources = {
  getDetailedNetworkInterfaces: getDetailedNetworkInterfacesStrict,
  getDevices: getDevicesStrict,
  refreshDevices: refreshDevicesStrict,
};
