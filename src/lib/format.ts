/**
 * Shared display-formatting helpers for the Net0ze workspace.
 * Keeps timestamp / serial-number rendering consistent across every table.
 */

/** Format an epoch-seconds value (number | string) as a readable local timestamp. */
export function fmtEpoch(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!isFinite(n) || n <= 0) return '—';
  const d = new Date(n * 1000);
  if (isNaN(d.getTime())) return '—';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Render a 1-based serial number with zero-padding to a target width. */
export function sNo(idx: number, width: number = 2): string {
  return String(idx + 1).padStart(width, '0');
}
