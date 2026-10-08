import type { DetailedAdapterInfo } from '../services/tauri/network';

export const SPEED_HISTORY_LIMIT = 120;
export const SPEED_INTERFACE_LIMIT = 32;
export type SpeedStatus = 'warmup' | 'live' | 'reset' | 'stale' | 'invalid' | 'down' | 'missing';
export interface SpeedSample {
  timestamp: string;
  elapsedSeconds: number;
  rxBytes: number;
  txBytes: number;
  rxMbps: number;
  txMbps: number;
  rxKibps: number;
  txKibps: number;
  gapBefore: boolean;
}
export interface InterfaceSpeed {
  id: string;
  label: string;
  status: SpeedStatus;
  baseline: { time: number; rx: number; tx: number } | null;
  history: SpeedSample[];
  sessionRx: number;
  sessionTx: number;
  peakRxMbps: number;
  peakTxMbps: number;
  gapPending: boolean;
}
export interface SpeedSnapshot {
  interfaces: InterfaceSpeed[];
  lastSuccess: number | null;
  error: boolean;
}
export const emptySpeedSnapshot = (): SpeedSnapshot => ({ interfaces: [], lastSuccess: null, error: false });
export const interfaceSpeedId = (a: DetailedAdapterInfo) => JSON.stringify([a.name, a.mac_address.toLowerCase()]);
export const isSpeedLoopback = (a: DetailedAdapterInfo) => /loopback/i.test(a.interface_type) || /^(lo|lo\d*)$/i.test(a.name);
export const speedStaleAfter = (refreshMs: number) => Math.max(10_000, refreshMs * 3);
const safeCounter = (n: number) => Number.isSafeInteger(n) && n >= 0;
const interfaceLabel = (a: DetailedAdapterInfo) => a.friendly_name && a.friendly_name !== a.name ? `${a.friendly_name} (${a.name})` : a.name;

/** Counters are cumulative. Never sum virtual/physical interfaces: traffic can be counted twice. */
export function measureInterfaceSpeed(previous: SpeedSnapshot, adapters: DetailedAdapterInfo[], time: number, timestamp: string, maxGapMs: number): SpeedSnapshot {
  if (!Number.isFinite(time)) return failInterfaceSpeed(previous);
  const old = new Map(previous.interfaces.map(i => [i.id, i]));
  const seen = new Set<string>();
  const interfaces: InterfaceSpeed[] = [];
  for (const a of adapters) {
    if (isSpeedLoopback(a) || !a.name || interfaces.length >= SPEED_INTERFACE_LIMIT) continue;
    const id = interfaceSpeedId(a);
    if (seen.has(id)) continue;
    seen.add(id);
    const prior = old.get(id);
    const next: InterfaceSpeed = prior ? { ...prior, history: [...prior.history] } : {
      id, label: interfaceLabel(a), status: 'warmup', baseline: null, history: [],
      sessionRx: 0, sessionTx: 0, peakRxMbps: 0, peakTxMbps: 0, gapPending: false,
    };
    next.label = interfaceLabel(a);
    if (!safeCounter(a.rx_bytes) || !safeCounter(a.tx_bytes)) {
      next.status = 'invalid'; next.baseline = null; next.gapPending = true;
    } else if (/^down$/i.test(a.oper_status)) {
      next.status = 'down'; next.baseline = null; next.gapPending = true;
    } else {
      const baseline = next.baseline;
      const elapsed = baseline ? time - baseline.time : 0;
      next.baseline = { time, rx: a.rx_bytes, tx: a.tx_bytes };
      if (!baseline) next.status = 'warmup';
      else if (elapsed <= 0 || elapsed > maxGapMs) { next.status = 'stale'; next.gapPending = true; }
      else if (a.rx_bytes < baseline.rx || a.tx_bytes < baseline.tx) { next.status = 'reset'; next.gapPending = true; }
      else {
        const rxBytes = a.rx_bytes - baseline.rx;
        const txBytes = a.tx_bytes - baseline.tx;
        if (!safeCounter(next.sessionRx + rxBytes) || !safeCounter(next.sessionTx + txBytes)) {
          next.status = 'invalid'; next.gapPending = true;
        } else {
          const seconds = elapsed / 1000;
          const rxMbps = rxBytes * 8 / seconds / 1_000_000;
          const txMbps = txBytes * 8 / seconds / 1_000_000;
          const rxKibps = rxBytes / seconds / 1024;
          const txKibps = txBytes / seconds / 1024;
          if (![rxMbps, txMbps, rxKibps, txKibps].every(Number.isFinite)) {
            next.status = 'invalid'; next.baseline = null; next.gapPending = true;
            interfaces.push(next);
            continue;
          }
          next.history.push({ timestamp, elapsedSeconds: seconds, rxBytes, txBytes, rxMbps, txMbps,
            rxKibps, txKibps, gapBefore: next.gapPending });
          next.history = next.history.slice(-SPEED_HISTORY_LIMIT);
          next.sessionRx += rxBytes; next.sessionTx += txBytes;
          next.peakRxMbps = Math.max(next.peakRxMbps, rxMbps);
          next.peakTxMbps = Math.max(next.peakTxMbps, txMbps);
          next.status = 'live'; next.gapPending = false;
        }
      }
    }
    interfaces.push(next);
  }
  // Retain recent session history for disappeared interfaces, but never bridge their counters.
  for (const i of previous.interfaces) {
    if (!seen.has(i.id) && interfaces.length < SPEED_INTERFACE_LIMIT) {
      interfaces.push({ ...i, status: 'missing', baseline: null, gapPending: true });
    }
  }
  return { interfaces, lastSuccess: time, error: false };
}

export function failInterfaceSpeed(previous: SpeedSnapshot): SpeedSnapshot {
  return { ...previous, error: true, interfaces: previous.interfaces.map(i => ({ ...i, baseline: null, gapPending: true })) };
}

const csvCell = (value: string) => `"${(/^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`;
export function interfaceSpeedCsv(i: InterfaceSpeed): string {
  const header = 'interface,timestamp_utc,interval_seconds,rx_bytes,tx_bytes,rx_mbps,tx_mbps,rx_kib_per_second,tx_kib_per_second,gap_before';
  return [header, ...i.history.map(s => [csvCell(i.label), csvCell(s.timestamp), s.elapsedSeconds,
    s.rxBytes, s.txBytes, s.rxMbps, s.txMbps, s.rxKibps, s.txKibps, s.gapBefore].join(','))].join('\r\n') + '\r\n';
}
