import type { ScanJob, ScanRequest, ScanResult, ScanState } from '../services/tauri/scanBuddy';

export const SCAN_PRESETS = { common: '21,22,25,53,80,110,139,143,443,445,3389', web: '80,443,8000,8080,8443', dev: '3000,4200,5000,5173,5432,6379,8000,8080,9000' };
export const EXPORT_WARNING = 'Contains endpoint addresses and scan observations. Share only with authorized recipients. Service names are port-based hints, not verified identities. Latency is TCP connect time, not ping.';
export const requestKey = (request: ScanRequest) => JSON.stringify(request);
function ipv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
}
function literal(value: string): boolean {
  if (ipv4(value)) return true;
  if (!value.includes(':') || !/^[\da-f:.]+$/i.test(value)) return false;
  try { return new URL(`http://[${value}]/`).hostname.startsWith('['); } catch { return false; }
}
export function validateScanRequest(request: ScanRequest): string[] {
  const errors: string[] = [];
  if (request.targets.length > 8192 || request.ports.length > 4096) return ['Target or port input is too long.'];
  const targets = request.targets.trim().split(/[,\s]+/).filter(Boolean);
  const expanded = new Set<string>();
  if (!targets.length) errors.push('Enter at least one literal IP address. DNS names are not supported.');
  for (const target of new Set(targets)) {
    if (target.includes('/')) {
      const [address, prefix, extra] = target.split('/');
      if (extra !== undefined || !ipv4(address) || !/^\d+$/.test(prefix) || Number(prefix) < 27 || Number(prefix) > 32) errors.push(`Invalid small IPv4 CIDR: ${target} (use /27–/32).`);
      else {
        const size = 2 ** (32 - Number(prefix));
        const addressNumber = address.split('.').reduce((number, part) => number * 256 + Number(part), 0);
        const base = Math.floor(addressNumber / size) * size;
        const prefixNumber = Number(prefix);
        const first = prefixNumber <= 30 ? 1 : 0;
        const end = prefixNumber <= 30 ? size - 1 : size;
        for (let offset = first; offset < end; offset++) {
          const number = base + offset;
          expanded.add([24, 16, 8, 0].map(shift => Math.floor(number / 2 ** shift) % 256).join('.'));
        }
      }
    } else if (!literal(target)) errors.push(`Not a literal IP address: ${target}.`);
    else expanded.add(ipv4(target) ? target : new URL(`http://[${target}]/`).hostname);
  }
  const count = expanded.size;
  if (count > 32) errors.push('Use at most 32 targets.');
  const ports = new Set<number>();
  const tokens = request.ports.split(',').map(token => token.trim());
  for (const token of tokens) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    const low = Number(match?.[1]); const high = Number(match?.[2] ?? match?.[1]);
    if (!match || low < 1 || high > 65535 || low > high) { errors.push(`Invalid port or range: ${token || '(empty)'}. Use 1–65535.`); continue; }
    if (high - low + 1 > 256) { errors.push('Use at most 256 distinct ports.'); continue; }
    for (let port = low; port <= high; port++) ports.add(port);
  }
  if (ports.size > 256) errors.push('Use at most 256 distinct ports.');
  if (count * ports.size > 4096) errors.push('Use at most 4,096 target × port probes.');
  if (!Number.isInteger(request.timeout_ms) || request.timeout_ms < 100 || request.timeout_ms > 2000) errors.push('Timeout must be 100–2,000 ms.');
  if (!Number.isInteger(request.concurrency) || request.concurrency < 1 || request.concurrency > 16) errors.push('Concurrency must be 1–16.');
  if (!request.authorized) errors.push('Confirm authorization before previewing or starting a scan.');
  return [...new Set(errors)];
}
export type ResultSort = 'endpoint' | 'port' | 'state' | 'latency';
export function projectScanResults(results: ScanResult[], state: ScanState | 'ALL', search: string, sort: ResultSort, descending = false): ScanResult[] {
  const query = search.trim().toLowerCase();
  return results.filter(row => (state === 'ALL' || row.state === state) && `${row.target} ${row.port} ${row.service_hint} ${row.state}`.toLowerCase().includes(query)).sort((a, b) => {
    const primary = sort === 'port' ? a.port - b.port : sort === 'latency' ? a.latency_ms - b.latency_ms : sort === 'state' ? a.state.localeCompare(b.state) : a.target.localeCompare(b.target, undefined, { numeric: true });
    return (primary || a.target.localeCompare(b.target) || a.port - b.port) * (descending ? -1 : 1);
  });
}
export function scanProgress(job: ScanJob): number { return job.plan.total_probes > 0 ? Math.min(100, Math.max(0, job.completed_probes / job.plan.total_probes * 100)) : 0; }
export type ScanExport = 'json' | 'csv' | 'md';
function csv(value: unknown): string { const text = String(value ?? ''); return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; }
function markdown(value: unknown): string { return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\r', ' ').replaceAll('\n', ' '); }
export function exportScan(job: ScanJob, format: ScanExport): string {
  if (format === 'json') return JSON.stringify({ warning: EXPORT_WARNING, scan: job }, null, 2);
  const headers = ['Target', 'Port', 'State', 'Connection reason', 'Service hint (unverified)', 'TCP connect ms', 'Observed at'];
  const rows = job.results.map(row => [row.target, row.port, row.state, row.reason ?? 'Not recorded', row.service_hint, row.latency_ms, row.observed_at]);
  if (format === 'csv') return `${csv(EXPORT_WARNING)}\r\n${[headers, ...rows].map(row => row.map(csv).join(',')).join('\r\n')}\r\n`;
  return `# Scan Buddy report\n\n${EXPORT_WARNING}\n\nJob: ${markdown(job.id)} · ${job.state}\n\nStarted UTC: ${markdown(job.started_at)}\n\nFinished UTC: ${markdown(job.finished_at ?? 'Still running')}\n\nObserved: ${job.completed_probes}/${job.plan.total_probes} planned probes. Cancelled/in-progress jobs may be partial.\n\nTargets: ${job.plan.targets.map(markdown).join(', ')}\n\nTCP ports: ${job.plan.ports.join(', ')}\n\nTimeout: ${job.plan.timeout_ms} ms · concurrency: ${job.plan.concurrency} · native connection starts capped at 50/sec.\n\n| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.map(markdown).join(' | ')} |`).join('\n')}\n`;
}
