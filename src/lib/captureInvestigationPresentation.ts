import type { CaptureInvestigation, InvestigationAnomaly, InvestigationConversation, InvestigationTimelineEntry } from '../services/tauri/captureInvestigation';

export const MAX_PREVIEW_ITEMS = 50;
const cap = (value: unknown, max = 500) => { const text = String(value ?? 'unknown'); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };
export type InvestigationFilters = { severity?: string; kind?: string; search?: string; conversationSort?: 'bytes' | 'packets'; timelineSort?: 'newest' | 'oldest'; page?: number };
export interface InvestigationProjection { conversations: InvestigationConversation[]; timeline: InvestigationTimelineEntry[]; anomalies: InvestigationAnomaly[]; generated_from_packets: number; limitations: string[]; truncated: boolean; totals: { conversations: number; timeline: number; anomalies: number } }

export function projectCaptureInvestigation(value: CaptureInvestigation, filters: InvestigationFilters = {}, limit = MAX_PREVIEW_ITEMS): InvestigationProjection {
  const bounded = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, MAX_PREVIEW_ITEMS) : MAX_PREVIEW_ITEMS;
  const page = Number.isSafeInteger(filters.page) && filters.page! >= 0 ? Math.min(filters.page!, 9) : 0;
  const query = (filters.search ?? '').trim().toLowerCase();
  const search = (parts: unknown[]) => !query || parts.map(part => String(part ?? '')).join(' ').toLowerCase().includes(query);
  const matches = (item: { severity: string; kind: string }) => (!filters.severity || filters.severity === 'all' || item.severity.toLowerCase() === filters.severity.toLowerCase()) && (!filters.kind || filters.kind === 'all' || item.kind.toLowerCase() === filters.kind.toLowerCase());
  const conversations = value.conversations.slice(0, 100).filter(c => search([c.source, c.destination, c.source_port, c.destination_port, c.protocol, ...c.packet_numbers])).sort((a, b) => b[filters.conversationSort ?? 'bytes'] - a[filters.conversationSort ?? 'bytes']);
  const timeline = value.timeline.slice(0, 500).filter(t => matches(t) && search([t.packet_number, t.kind, t.severity, t.summary, t.time])).sort((a, b) => a.time === null ? (b.time === null ? 0 : 1) : b.time === null ? -1 : filters.timelineSort === 'oldest' ? a.time - b.time : b.time - a.time);
  const anomalies = value.anomalies.slice(0, 100).filter(a => matches(a) && search([a.kind, a.severity, a.summary, a.reason, a.confidence, ...a.evidence_packets]));
  const slice = <T,>(items: T[]) => items.slice(page * bounded, (page + 1) * bounded);
  return { conversations: slice(conversations), timeline: slice(timeline), anomalies: slice(anomalies), generated_from_packets: value.generated_from_packets, limitations: value.limitations.slice(0, 100).map(s => cap(s)), totals: { conversations: conversations.length, timeline: timeline.length, anomalies: anomalies.length }, truncated: page > 0 || [conversations, timeline, anomalies].some(items => items.length > bounded) };
}
export const filterCaptureInvestigation = projectCaptureInvestigation;
export function boundedPreview(value: string, max = 240) { return cap(value, Math.max(1, max)); }
export function exportCaptureInvestigationJson(value: CaptureInvestigation, filters: InvestigationFilters = {}) { return JSON.stringify(projectCaptureInvestigation(value, filters), null, 2); }
export function exportCaptureInvestigationBundle(value: CaptureInvestigation, filters: InvestigationFilters = {}) {
  return JSON.stringify({ bundle_schema: 'netoze.capture-investigation.v1', generated_at_utc: new Date().toISOString(), metadata_only: true, source_bytes_included: false, filters, note: 'Filtered, bounded metadata projection; may be truncated. No PCAP, payload, hash, integrity or chain-of-custody proof is included. Original capture remains separate.', investigation: projectCaptureInvestigation(value, filters) }, null, 2);
}
// Single-line text, never HTML, links, headings, code blocks or injected list items.
const markdown = (value: unknown) => cap(value).replace(/[\r\n\u2028\u2029]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}[\]()#+.!|~-]/g, '\\$&');
export function exportCaptureInvestigationMarkdown(value: CaptureInvestigation, filters: InvestigationFilters = {}) {
  const p = projectCaptureInvestigation(value, filters);
  const lines = ['# Capture investigation', '', '> Evidence, not verdict. Filtered metadata only; no PCAP or hash proof. Endpoint metadata may be sensitive.', '', `Generated from packets: ${p.generated_from_packets}`, `Projection truncated: ${p.truncated}`, '', '## Conversations'];
  p.conversations.forEach(c => lines.push(`- **${markdown(c.source)}:${markdown(c.source_port)} → ${markdown(c.destination)}:${markdown(c.destination_port)}** · ${markdown(c.protocol)} · ${c.packets} packets · ${c.bytes} bytes · evidence packets: ${c.packet_numbers.join(', ')}`));
  lines.push('', '## Timeline'); p.timeline.forEach(t => lines.push(`- Packet ${t.packet_number} · ${markdown(t.time)} · ${markdown(t.kind)} · ${markdown(t.severity)} — ${markdown(t.summary)}`));
  lines.push('', '## Review'); p.anomalies.forEach(a => lines.push(`- **${markdown(a.kind)} / ${markdown(a.severity)}** (${markdown(a.confidence)} confidence): ${markdown(a.summary)} — ${markdown(a.reason)} [packets: ${a.evidence_packets.join(', ')}]`));
  if (p.limitations.length) lines.push('', '## Limitations', ...p.limitations.map(l => `- ${markdown(l)}`));
  return lines.join('\n');
}
