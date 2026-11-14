import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

/**
 * Typed client for the signed-manifest update gate (native commands +
 * events). All enforcement logic lives in the Rust service
 * (`services/update_gate.rs`); this layer only frames what the UI shows.
 *
 * Hard UI rules inherited from the gate:
 * - `gate_active` (critical/mandatory or security floor) renders the block
 *   overlay, but only ever over the workspace — navigation, recovery,
 *   diagnostics and data export stay reachable.
 * - An unsigned/unverifyable manifest is informational: `advisory_only`
 *   never enables install and never drives enforcement colours.
 * - Network failure never disables the app: the UI degrades to a stale
 *   note with the last check time.
 */

export interface UpdateGateStatus {
  app_version: string;
  channel: string;
  latest_version: string | null;
  severity: string | null;
  mandatory: boolean;
  advisory_only: boolean;
  gate_active: boolean;
  gate_kind: string | null;
  gate_required_version: string | null;
  gate_reason: string | null;
  notes_url: string | null;
  last_check_at: number | null;
  last_check_ok: boolean | null;
  last_authenticated_at: number | null;
  min_supported_version: string | null;
  last_error: string | null;
  endpoint: string;
  signature_key_id: string;
  check_in_progress: boolean;
  install_in_progress: boolean;
}

export interface InstallProgress {
  stage: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  format?: string;
  [key: string]: unknown;
}

export type BannerTone = 'informational' | 'low' | 'moderate' | 'high';

export type UpdatePresentation =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'stale' }
  | { kind: 'gate'; tone: 'high'; message: string; required: string }
  | { kind: 'banner'; tone: BannerTone; message: string };

/**
 * Snapshot of the gate status (null outside the Tauri runtime or when the
 * backend is unavailable — the UI renders nothing in that case).
 */
export async function updateGateStatus(): Promise<UpdateGateStatus | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<UpdateGateStatus>('update_gate_status');
    } catch (err) {
      console.warn('Failed to read update gate status:', err);
    }
  }
  return null;
}

/** Manual refresh (the gate throttles to one network check per minute). */
export async function updateGateCheckNow(): Promise<UpdateGateStatus | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<UpdateGateStatus>('update_gate_check_now');
    } catch (err) {
      console.warn('Failed to run the update check:', err);
    }
  }
  return null;
}

/** Explicit user-consented install of a verified, strictly newer update. */
export async function updateGateInstall(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      await invoke<void>('update_gate_install');
      return;
    } catch (err) {
      console.warn('Update install refused:', err);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
}

/**
 * Gate-never-blocked recovery surface: open the app data folder so the user
 * can export databases and logs by hand regardless of gate state.
 */
export async function updateGateOpenDataFolder(): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<string>('update_gate_open_data_folder');
    } catch (err) {
      console.warn('Failed to open the data folder:', err);
    }
  }
  return null;
}

/** Live status updates emitted by the gate worker and command wrappers. */
export async function subscribeToUpdateStatus(
  callback: (status: UpdateGateStatus) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<UpdateGateStatus>('netoze-update://status', (event) => {
        callback(event.payload);
      });
    } catch (err) {
      console.warn('Failed to subscribe to update status:', err);
    }
  }
  return () => {};
}

/** Install progress (download percentages and installer hand-off). */
export async function subscribeToInstallProgress(
  callback: (progress: InstallProgress) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<InstallProgress>('netoze-update://install-progress', (event) => {
        callback(event.payload);
      });
    } catch (err) {
      console.warn('Failed to subscribe to install progress:', err);
    }
  }
  return () => {};
}

/**
 * Pure decision frame the UI renders from. An unsigned manifest is always
 * `informational`-toned regardless of the severity string it claims, so a
 * fake "critical" cannot borrow enforcement colours.
 */
export function updatePresentation(
  status: UpdateGateStatus | null,
  checkingTimedOut: boolean
): UpdatePresentation {
  if (!status) {
    return { kind: 'idle' };
  }
  if (status.gate_active) {
    return {
      kind: 'gate',
      tone: 'high',
      message:
        status.gate_reason ??
        'This build is blocked by the signed update policy.',
      required: status.gate_required_version ?? '',
    };
  }
  // An in-flight check reports "checking" only until the boot timeout; after
  // that the UI stops waiting and shows whatever real frame it has. Explicit
  // Retry clicks are given their own pending feedback at the banner level.
  if (status.check_in_progress) {
    if (status.latest_version != null || status.gate_reason != null || checkingTimedOut) {
      // A previous or in-flight result already exists; fall through.
    } else {
      return { kind: 'checking' };
    }
  }
  if (status.latest_version == null) {
    return checkingTimedOut && status.last_error != null ? { kind: 'stale' } : { kind: 'idle' };
  }
  if (status.gate_reason == null) {
    return { kind: 'idle' };
  }
  return {
    kind: 'banner',
    tone: status.advisory_only ? 'informational' : bannerToneOf(status.severity),
    message: status.gate_reason,
  };
}

/** Recognized severity ladder; unknown or absent strings stay moderate. */
export function bannerToneOf(severity: string | null): BannerTone {
  switch (severity) {
    case 'informational':
      return 'informational';
    case 'low':
      return 'low';
    case 'high':
      return 'high';
    case 'critical':
      return 'high';
    case 'moderate':
      return 'moderate';
    default:
      return 'moderate';
  }
}
