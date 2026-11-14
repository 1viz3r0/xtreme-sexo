/**
 * Pure presentation helpers for the Watchtower IP intelligence workspace.
 * No runtime dependencies — unit-testable without a native runtime.
 */

export interface IntelPacketRowLike {
  number: number;
  time: string;
  source: string;
  destination: string;
  protocol: string;
  length: string;
  info: string;
}

/** BPF capture filter that restricts a capture to one host's traffic. */
export function captureFilterForIp(ip: string): string {
  const trimmed = ip.trim();
  // Bare addresses are safe as BPF operands; defensive quoting for exotic inputs.
  return /^[0-9a-fA-F.:]+$/.test(trimmed) ? `host ${trimmed}` : '';
}

export type PacketDirectionFilter = 'both' | 'src' | 'dst';

export function filterPacketsForIp(
  rows: IntelPacketRowLike[],
  ip: string,
  mode: PacketDirectionFilter,
): IntelPacketRowLike[] {
  const target = ip.trim().toLowerCase();
  if (!target) return rows;
  return rows.filter((row) => {
    if (mode === 'src') return row.source.toLowerCase() === target;
    if (mode === 'dst') return row.destination.toLowerCase() === target;
    return row.source.toLowerCase() === target || row.destination.toLowerCase() === target;
  });
}

export interface PacketStats {
  count: number;
  bytes: number;
  protocols: Array<{ protocol: string; count: number }>;
  peers: Array<{ address: string; count: number }>;
}

export function packetStats(rows: IntelPacketRowLike[]): PacketStats {
  let bytes = 0;
  const protocols = new Map<string, number>();
  const peers = new Map<string, number>();
  for (const row of rows) {
    const parsed = Number.parseInt(row.length, 10);
    if (Number.isFinite(parsed)) bytes += parsed;
    protocols.set(row.protocol, (protocols.get(row.protocol) ?? 0) + 1);
    const peer = row.source && row.destination ? `${row.source} ⇄ ${row.destination}` : row.source || row.destination;
    if (peer) peers.set(peer, (peers.get(peer) ?? 0) + 1);
  }
  const rank = (map: Map<string, number>) =>
    [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  return {
    count: rows.length,
    bytes,
    protocols: rank(protocols).map((entry) => ({ protocol: entry.key, count: entry.count })),
    peers: rank(peers).map((entry) => ({ address: entry.key, count: entry.count })),
  };
}

/** Compact open-port list from the persisted JSON string. */
export function portSummary(openPortsJson: string | null): string {
  if (!openPortsJson) return 'None observed';
  try {
    const ports = JSON.parse(openPortsJson) as number[];
    if (!Array.isArray(ports) || ports.length === 0) return 'None observed';
    return ports.slice(0, 12).map((port) => String(port)).join(', ') + (ports.length > 12 ? ` +${ports.length - 12}` : '');
  } catch {
    return 'Recorded';
  }
}

export type ScanStateTone = 'ok' | 'warn' | 'error' | 'idle';

export function scanStateLabel(state: string | null | undefined): { label: string; tone: ScanStateTone } {
  switch (state) {
    case 'completed':
      return { label: 'Completed', tone: 'ok' };
    case 'partial':
      return { label: 'Partial', tone: 'warn' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'warn' };
    case 'skipped-busy':
      return { label: 'Deferred (engine busy)', tone: 'warn' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    case 'RUNNING':
      return { label: 'Running', tone: 'warn' };
    case 'COMPLETED':
      return { label: 'Completed', tone: 'ok' };
    default:
      return { label: state && state.length > 0 ? state : 'Not scanned yet', tone: 'idle' };
  }
}

/** OS confidence badge: honest detected / inferred / unknown distinction. */
export function osBadge(confidence: string | null | undefined, guess: string | null | undefined): {
  text: string;
  kind: 'medium' | 'low' | 'unknown';
} {
  const text = confidence ?? '';
  if (text.includes('medium')) return { text: guess ? `Inferred · medium: ${guess}` : 'Inferred · medium', kind: 'medium' };
  if (text.includes('low')) return { text: guess ? `Inferred · low: ${guess}` : 'Inferred · low', kind: 'low' };
  if (guess) return { text: `Inferred: ${guess}`, kind: 'low' };
  return { text: 'Unknown — no fingerprint evidence', kind: 'unknown' };
}

export function nextDueLabel(nextDueAt: string | null): string {
  if (!nextDueAt) return 'Nothing scheduled';
  const time = Date.parse(nextDueAt);
  if (!Number.isFinite(time)) return 'Nothing scheduled';
  return `Next due ${new Date(time).toLocaleTimeString()}`;
}

/** Unix-ms → readable timestamp; null-safe. */
export function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleString();
}

/** Compact relative age for last-seen columns. */
export function relativeAge(ms: number | null | undefined, now: number = Date.now()): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return '—';
  const delta = Math.max(0, now - ms);
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export interface IntelNoteLike {
  id: number;
  ip: string | null;
  body: string;
  created_at: number;
  updated_at: number;
}

/** Case-insensitive note search across body and attached IP; newest first. */
export function searchNotes<T extends IntelNoteLike>(notes: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  const sorted = [...notes].sort((a, b) => b.updated_at - a.updated_at);
  if (!needle) return sorted;
  return sorted.filter((note) =>
    note.body.toLowerCase().includes(needle) || (note.ip ?? '').toLowerCase().includes(needle),
  );
}

/** PCAP export requires an explicit .pcap/.pcapng destination. */
export function isPcapDestination(destination: string): boolean {
  return /\.pcap(ng)?$/i.test(destination.trim());
}

export const INTENSITY_OPTIONS = [
  { value: 'light', label: 'Light · 5 ports (22, 80, 443, 445, 3389)' },
  { value: 'common', label: 'Common · 11 well-known ports' },
  { value: 'registered', label: 'Registered · 1–1024' },
] as const;

export const INTERVAL_OPTIONS = [
  { value: 900, label: 'Every 15 minutes' },
  { value: 1800, label: 'Every 30 minutes' },
  { value: 3600, label: 'Every hour' },
  { value: 21600, label: 'Every 6 hours' },
  { value: 43200, label: 'Every 12 hours' },
  { value: 86400, label: 'Every 24 hours' },
] as const;

export function sourceBadge(source: string, origin: string): { label: string; tone: 'manual' | 'passive' | 'traffic' } {
  if (origin === 'manual' || source === 'manual') return { label: 'Manual', tone: 'manual' };
  if (source === 'traffic') return { label: 'Traffic', tone: 'traffic' };
  return { label: 'Passive', tone: 'passive' };
}
