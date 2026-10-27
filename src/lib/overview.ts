import type { GlobalIntelSnapshot } from '../services/tauri/globalIntel';
import type { TabType } from '../components/Sidebar';

export type OverviewDataState = 'unavailable' | 'stale' | 'loaded' | 'awaiting';

export const isValidNumber = (number: number | null | undefined): number is number => (
  number !== null && number !== undefined && Number.isFinite(number) && number >= 0
);

export const count = (number: number | null | undefined) => isValidNumber(number) ? number.toLocaleString() : 'Unavailable';

const bytes = (number: number | null | undefined) => {
  if (!isValidNumber(number)) return 'Unavailable';
  if (number >= 1024 ** 3) return `${(number / 1024 ** 3).toFixed(1)} GB`;
  if (number >= 1024 ** 2) return `${(number / 1024 ** 2).toFixed(0)} MB`;
  if (number >= 1024) return `${(number / 1024).toFixed(1)} KB`;
  return `${number} B`;
};

export function getOverviewDataState(snapshot: GlobalIntelSnapshot | null, unavailable?: string | null): OverviewDataState {
  if (unavailable && !snapshot) return 'unavailable';
  if (unavailable && snapshot) return 'stale';
  if (snapshot) return 'loaded';
  return 'awaiting';
}

export function formatSnapshotAge(collectedAt: string | undefined, now = Date.now()): string {
  if (!collectedAt) return 'timestamp unavailable';
  const timestamp = Date.parse(collectedAt);
  if (!Number.isFinite(timestamp)) return 'timestamp unavailable';
  if (timestamp > now) return 'timestamp in future';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatObservedThroughput(bytesPerSecond: number | null | undefined, packetsPerSecond: number | null | undefined, available: boolean): string {
  if (!available || !isValidNumber(bytesPerSecond) || !isValidNumber(packetsPerSecond)) return 'Unavailable';
  return `${bytes(bytesPerSecond)}/s · ${count(packetsPerSecond)} pkt/s`;
}

export type OverviewActionPriority = 'P1' | 'P2' | 'P3';

export interface OverviewAction {
  id: string;
  priority: OverviewActionPriority;
  label: string;
  detail: string;
  tab: TabType | null;
}

const nonNegative = (value: number | null | undefined): number | null => (
  value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null
);

const highFindingCount = (snapshot: GlobalIntelSnapshot | null): number | null => {
  const critical = nonNegative(snapshot?.detection_summary?.critical_count);
  const high = nonNegative(snapshot?.detection_summary?.high_count);
  return critical !== null && high !== null ? critical + high : null;
};

/**
 * Produces a short review queue from loaded evidence. Priorities describe
 * workflow order only; they are not risk, threat, or compliance scores.
 */
export function getOverviewActionQueue(snapshot: GlobalIntelSnapshot | null, unavailable?: string | null): OverviewAction[] {
  const actions: OverviewAction[] = [];
  const high = highFindingCount(snapshot);
  const active = nonNegative(snapshot?.detection_summary?.active_count);
  const activeFlows = nonNegative(snapshot?.flow_summary?.active_flows_count);
  const captureAvailable = snapshot?.capture_availability?.state?.toUpperCase() === 'AVAILABLE';

  if (unavailable && !snapshot) {
    actions.push({
      id: 'native-telemetry',
      priority: 'P1',
      label: 'Open native desktop telemetry',
      detail: 'Launch the installed app to collect host and capture evidence.',
      tab: null,
    });
  } else if (!snapshot) {
    actions.push({
      id: 'load-snapshot',
      priority: 'P1',
      label: 'Load a native snapshot',
      detail: 'Open Watchtower to begin a desktop evidence read.',
      tab: 'watchtower',
    });
  } else if (high !== null && high > 0) {
    actions.push({
      id: 'review-high',
      priority: 'P1',
      label: 'Review high-priority evidence',
      detail: `${high.toLocaleString()} critical/high finding${high === 1 ? '' : 's'} are present in the loaded snapshot.`,
      tab: 'conversations',
    });
  } else if (active !== null && active > 0) {
    actions.push({
      id: 'review-active',
      priority: 'P1',
      label: 'Review active evidence',
      detail: `${active.toLocaleString()} active finding${active === 1 ? '' : 's'} remain in the loaded snapshot.`,
      tab: 'conversations',
    });
  } else {
    actions.push({
      id: 'confirm-observations',
      priority: 'P1',
      label: 'Review loaded observations',
      detail: 'Confirm the current Watchtower scope before drawing conclusions.',
      tab: 'watchtower',
    });
  }

  if (snapshot && (captureAvailable || (activeFlows !== null && activeFlows > 0))) {
    actions.push({
      id: 'inspect-capture',
      priority: 'P2',
      label: 'Review capture observations',
      detail: captureAvailable ? 'Inspect the observed session traffic and source details.' : 'Inspect the loaded flow records; capture availability is not confirmed.',
      tab: 'conversations',
    });
  } else if (snapshot) {
    actions.push({
      id: 'inspect-watchtower',
      priority: 'P2',
      label: 'Inspect Watchtower evidence',
      detail: 'Review device and flow records without assuming complete network coverage.',
      tab: 'watchtower',
    });
  } else {
    actions.push({
      id: 'inspect-scope',
      priority: 'P2',
      label: 'Inspect local network scope',
      detail: 'Use Scan Buddy for the native interface and scope view when available.',
      tab: 'network_engine',
    });
  }

  actions.push({
    id: 'open-dashboard',
    priority: 'P3',
    label: 'Open operational dashboard',
    detail: 'Move to the broader session dashboard for supporting context.',
    tab: 'system_logs',
  });

  return actions;
}

export function getOverviewNextStep(snapshot: GlobalIntelSnapshot | null, unavailable?: string | null): { label: string; tab: TabType | null } {
  if (unavailable && !snapshot) return { label: 'Open the native desktop app', tab: null };
  if (!snapshot) return { label: 'Load a native snapshot', tab: 'watchtower' };
  const high = highFindingCount(snapshot);
  if (high !== null && high > 0) return { label: 'Review high-priority evidence', tab: 'conversations' };
  const devicesObserved = Array.isArray(snapshot.devices) && snapshot.devices.length > 0;
  const activeFlows = nonNegative(snapshot.flow_summary?.active_flows_count);
  if (devicesObserved || (activeFlows !== null && activeFlows > 0)) return { label: 'Review local observations', tab: 'watchtower' };
  return { label: 'Start a capture or load a snapshot', tab: 'watchtower' };
}
