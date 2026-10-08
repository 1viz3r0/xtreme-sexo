import { isTauriEnvironment } from './isTauri';

export type InspectionCheck = 'connect' | 'http-head' | 'http-preview' | 'ssh-banner';
export interface ScanInspection {
  target: string;
  port: number;
  check: InspectionCheck;
  status: string;
  protocol_evidence: string | null;
  os_assessment: string | null;
  observed_at: string;
  limitations: string[];
  response_headers?: Record<string, string>;
  content_preview?: string;
}

export const INSPECTION_CONTENT_PREVIEW_CAP = 4096;
export const INSPECTION_RESPONSE_HEADER_CAP = 64;
export const INSPECTION_RESPONSE_HEADER_NAME_CAP = 256;
export const INSPECTION_RESPONSE_HEADER_VALUE_CAP = 1024;

const checks = new Set<InspectionCheck>(['connect', 'http-head', 'http-preview', 'ssh-banner']);
function validate(value: unknown): ScanInspection {
  if (!value || typeof value !== 'object') throw new Error('Inspection returned an invalid result.');
  const row = value as Record<string, unknown>;
  const required = ['target', 'port', 'check', 'status', 'protocol_evidence', 'os_assessment', 'observed_at', 'limitations'];
  const optional = ['response_headers', 'content_preview'];
  if (Object.keys(row).some(key => !required.includes(key) && !optional.includes(key)) || required.some(key => !(key in row))) throw new Error('Inspection returned an invalid result shape.');
  const port = row.port;
  if (typeof row.target !== 'string' || !Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535 || typeof row.check !== 'string' || !checks.has(row.check as InspectionCheck) || typeof row.status !== 'string' || typeof row.observed_at !== 'string' || (row.protocol_evidence !== null && typeof row.protocol_evidence !== 'string') || (row.os_assessment !== null && typeof row.os_assessment !== 'string') || !Array.isArray(row.limitations) || row.limitations.some(item => typeof item !== 'string')) throw new Error('Inspection returned an invalid result.');
  if ('content_preview' in row && (typeof row.content_preview !== 'string' || row.content_preview.length > INSPECTION_CONTENT_PREVIEW_CAP)) throw new Error('Inspection returned an invalid content preview.');
  if ('response_headers' in row) {
    const headers = row.response_headers;
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Inspection returned invalid response headers.');
    const entries = Object.entries(headers);
    if (entries.length > INSPECTION_RESPONSE_HEADER_CAP || entries.some(([name, header]) => !name || name.length > INSPECTION_RESPONSE_HEADER_NAME_CAP || typeof header !== 'string' || header.length > INSPECTION_RESPONSE_HEADER_VALUE_CAP)) throw new Error('Inspection returned invalid response headers.');
  }
  return row as unknown as ScanInspection;
}

export const createScanInspectionAdapter = (invoke: (command: string, args: unknown) => Promise<unknown>, available = isTauriEnvironment) => async (target: string, port: number, authorized: boolean, check: InspectionCheck): Promise<ScanInspection> => {
  if (!available) throw new Error('Inspection is unavailable in browser mode.');
  if (!authorized) throw new Error('Acknowledge permission before inspection.');
  if (!checks.has(check)) throw new Error('Choose a supported built-in check.');
  return validate(await invoke('scan_buddy_inspect', { target, port, authorized, check }));
};

export const inspectScanResult = createScanInspectionAdapter(async (command, args) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<unknown>(command, args as Record<string, unknown>);
});
