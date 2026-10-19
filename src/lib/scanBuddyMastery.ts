export interface ScanBuddyMasteryStep {
  id: 'purpose' | 'authorize' | 'workflow' | 'preview' | 'bounded-run' | 'history'
  title: string
  summary: string
  lesson: string
  theory: string
  practice: string
  observe: string
  realWorldNote: string
  exercises: readonly string[]
}

export const SCAN_BUDDY_MASTERY_STEPS: readonly ScanBuddyMasteryStep[] = [
  {
    id: 'purpose', title: 'Purpose', summary: 'Learn what Scan Buddy observes.',
    lesson: 'Scan Buddy performs bounded TCP connection checks against an explicit IP scope. An OPEN result means a connection succeeded; it does not prove a service identity or vulnerability.',
    theory: 'A TCP connect probe completes the three-way handshake. OPEN means this machine connected at that moment; it is not ping, service identification, or vulnerability testing.',
    practice: 'Use one authorized host and a few relevant ports. Record source, time, scope, state, and latency.',
    observe: 'Compare state, port, latency, reason, and timestamp. Treat the service hint as unverified context.',
    realWorldNote: 'SOC teams corroborate exposure with inventory, flow logs, and service telemetry.',
    exercises: ['Explain what OPEN proves and what it cannot prove.', 'Identify which fields make an observation reproducible.'],
  },
  {
    id: 'authorize', title: 'Authorization', summary: 'Confirm permission before any probe.',
    lesson: 'Only scan systems you own or have explicit permission to test. The authorization confirmation belongs to the current scope and must be reviewed again after changing targets.',
    theory: 'Authorization is a scope decision, not an assumption. A private IP may belong to another tenant or team. Record targets, ports, time, source, and operator.',
    practice: 'Review the literal scope before checking authorization. Any scope edit requires a fresh review.',
    observe: 'Start stays gated until preview and authorization are current. Browser mode never substitutes native results.',
    realWorldNote: 'Rules of engagement define exclusions, rate limits, and contacts; exceeding them is an incident even when the probe succeeds.',
    exercises: ['Write a one-line scope statement including source, targets, ports, and time window.', 'Name one reason a local address may not be yours to scan.'],
  },
  {
    id: 'workflow', title: 'Workflow', summary: 'Scope → preview → start → observe.',
    lesson: 'Define literal IPs or bounded CIDRs and TCP ports, preview the exact plan, then explicitly start. Editing scope invalidates the preview so stale plans cannot be started.',
    theory: 'The Cartesian product is targets × unique ports. Ranges are inclusive: 2 hosts × ports 22,80,443 = 6 attempts.',
    practice: 'Calculate impact before preview. Start small, interpret, then repeat with an approved change.',
    observe: 'Preview expands scope without traffic; only Start begins native work.',
    realWorldNote: 'Network teams compare scheduled scan deltas instead of treating one scan as a complete inventory.',
    exercises: ['Calculate probes for 4 hosts and ports 22,80,443.', 'Explain why changing 443 to 443,8443 requires a new preview.'],
  },
  {
    id: 'preview', title: 'Preview', summary: 'Understand impact before traffic.',
    lesson: 'Preview is read-only: it expands targets and ports, reports probe count and warnings, and sends no network traffic. Use it to catch an overly broad scope.',
    theory: 'Preview reveals CIDR expansion, deduplicated ports, bounds, warnings, and impact. A budget limits work; it does not guarantee responses.',
    practice: 'Confirm targets, count, timeout, and warnings match the authorization before Start.',
    observe: 'After Preview, verify “no probes sent.” A validation error is a planning issue, not a scan result.',
    realWorldNote: 'Change previews catch accidental production ranges and unrealistic completion windows.',
    exercises: ['Given 10 hosts × 100 ports, decide whether the plan is suitable for a first pass.', 'List two warnings worth recording in a change ticket.'],
  },
  {
    id: 'bounded-run', title: 'Bounded run', summary: 'Track progress and cancel safely.',
    lesson: 'The native engine applies target, probe, concurrency, rate, and deadline bounds. While running, progress is refreshed from native status and Cancel preserves completed observations.',
    theory: 'CLOSED usually means a reset/no listener. TIMEOUT is inconclusive: filtering, congestion, or a slow path are possible. UNREACHABLE/ERROR need context.',
    practice: 'Use progress to judge coverage. Cancel safely when scope or conditions change, and label results partial.',
    observe: 'Compare states without calling a host “safe” or “down.” Reason and latency add context.',
    realWorldNote: 'SOC teams correlate timeouts with firewall changes and packet loss; one timeout is not proof of filtering.',
    exercises: ['Contrast CLOSED with TIMEOUT in one sentence each.', 'Why must a cancelled job not be reported as a complete negative scan?'],
  },
  {
    id: 'history', title: 'History', summary: 'Review evidence without guessing.',
    lesson: 'History contains native jobs and their observed outcomes. Refresh after reconnecting or an uncertain start; never retry automatically when the start result is unclear.',
    theory: 'Useful provenance includes job ID, scope fingerprint, planned/completed probes, timestamps, state, and reasons. A service hint is not identification evidence.',
    practice: 'Compare plan and results, report gaps, and preserve completed/cancelled/failed state.',
    observe: 'History loads native jobs only. An uncertain start requires refresh, never a silent retry.',
    realWorldNote: 'Case evidence should include operator, source vantage point, authorization, and collection time.',
    exercises: ['Name three provenance fields you would include in a ticket.', 'Explain why an empty browser history is not evidence that no scan occurred.'],
  },
]

export function masteryStepAt(index: number): ScanBuddyMasteryStep {
  return SCAN_BUDDY_MASTERY_STEPS[Math.min(Math.max(index, 0), SCAN_BUDDY_MASTERY_STEPS.length - 1)]
}
