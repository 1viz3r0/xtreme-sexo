import { isTauriEnvironment } from './isTauri';

export interface InvestigationConversation { id: string; source: string; destination: string; source_port: number | null; destination_port: number | null; protocol: string; packets: number; bytes: number; first_time: number | null; last_time: number | null; packet_numbers: number[] }
export interface InvestigationTimelineEntry { packet_number: number; time: number | null; kind: string; summary: string; severity: string }
export interface InvestigationAnomaly { id: string; kind: string; severity: string; confidence: string; summary: string; evidence_packets: number[]; reason: string }
export interface CaptureInvestigation { conversations: InvestigationConversation[]; timeline: InvestigationTimelineEntry[]; anomalies: InvestigationAnomaly[]; generated_from_packets: number; limitations: string[] }

export const CAPTURE_INVESTIGATION_DEADLINE_MS = 8_000;
export class CaptureInvestigationTimeoutError extends Error { constructor() { super('Capture Buddy investigation timed out. The native app did not respond; do not retry automatically.'); this.name = 'CaptureInvestigationTimeoutError'; } }

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const keys = (v: Record<string, unknown>, expected: string) => { const names = expected.split(' '); return Object.keys(v).length === names.length && names.every(name => Object.hasOwn(v, name)); };
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= 16_384;
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const numbers = (v: unknown): v is number[] => Array.isArray(v) && v.length <= 500 && v.every(count);
const port = (v: unknown): v is number | null => v === null || (count(v) && v <= 65535);
const optionalNumber = (v: unknown): v is number | null => v === null || number(v);
const conversation = (v: unknown): v is InvestigationConversation => object(v) && keys(v, 'id source destination source_port destination_port protocol packets bytes first_time last_time packet_numbers') && text(v.id) && text(v.source) && text(v.destination) && port(v.source_port) && port(v.destination_port) && text(v.protocol) && count(v.packets) && count(v.bytes) && optionalNumber(v.first_time) && optionalNumber(v.last_time) && numbers(v.packet_numbers);
const timeline = (v: unknown): v is InvestigationTimelineEntry => object(v) && keys(v, 'packet_number time kind summary severity') && count(v.packet_number) && optionalNumber(v.time) && text(v.kind) && text(v.summary) && text(v.severity);
const anomaly = (v: unknown): v is InvestigationAnomaly => object(v) && keys(v, 'id kind severity confidence summary evidence_packets reason') && text(v.id) && text(v.kind) && text(v.severity) && text(v.confidence) && text(v.summary) && numbers(v.evidence_packets) && text(v.reason);
export function isCaptureInvestigation(value: unknown): value is CaptureInvestigation {
  return object(value) && keys(value, 'conversations timeline anomalies generated_from_packets limitations') && Array.isArray(value.conversations) && value.conversations.length <= 100 && value.conversations.every(conversation) && Array.isArray(value.timeline) && value.timeline.length <= 500 && value.timeline.every(timeline) && Array.isArray(value.anomalies) && value.anomalies.length <= 100 && value.anomalies.every(anomaly) && count(value.generated_from_packets) && Array.isArray(value.limitations) && value.limitations.length <= 100 && value.limitations.every(text);
}

export async function generateCaptureInvestigation(sessionId: string): Promise<CaptureInvestigation> {
  if (!isTauriEnvironment()) throw new Error('Capture Buddy investigation is desktop-only. Open the native app; browser mode has no capture data.');
  if (!sessionId.trim()) throw new Error('A capture session is required.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const value = await Promise.race([
      import('@tauri-apps/api/core').then(({ invoke }) => invoke<unknown>('buddy_investigation_model', { sessionId })),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CaptureInvestigationTimeoutError()), CAPTURE_INVESTIGATION_DEADLINE_MS); }),
    ]);
    if (!isCaptureInvestigation(value)) throw new Error('Capture Buddy returned an incompatible investigation response. Rebuild the native app so frontend and backend match.');
    return value;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
