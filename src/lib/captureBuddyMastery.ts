export interface CaptureBuddyMasteryStep {
  id: 'purpose' | 'authorization' | 'readiness' | 'workflow' | 'evidence' | 'boundaries'
  title: string
  summary: string
  lesson: string
  theory: string
  practice: string[]
  observe: string[]
  realWorldNote: string
}

export const CAPTURE_BUDDY_MASTERY_STEPS: readonly CaptureBuddyMasteryStep[] = [
   { id: 'purpose', title: 'Purpose', summary: 'Learn what Capture Buddy can actually observe.', lesson: 'Capture Buddy records packets delivered to one selected local interface and builds a native evidence brief. It does not provide universal visibility, decrypt content, or create a safety verdict.', theory: 'Visibility depends on the selected interface and capture mechanism. “Not observed” does not mean “did not happen.”', practice: ['Choose the interface carrying the authorized activity.', 'Write one visibility limit before recording.', 'Keep collection filters distinct from later display/search filters.'], observe: ['Verify native scope and visibility note before Start.', 'If readiness is unavailable, use the honest unavailable state.'], realWorldNote: 'SOC triage starts by documenting collection scope so another analyst can challenge it.' },
   { id: 'authorization', title: 'Capture authorization', summary: 'Make consent explicit before recording.', lesson: 'Record only traffic you are authorized to observe. The panel binds authorization to the selected interface and duration.', theory: 'Captures may contain credentials, identifiers, personal data, and proprietary content. Authority must cover purpose, duration, storage, and reviewers.', practice: ['Match interface and duration to the approved scope.', 'Decide storage and access before Start.'], observe: ['The checkbox is required for the current scope.', 'Changing scope clears authorization.'], realWorldNote: 'DFIR notes record collection authority before acquiring volatile evidence.' },
   { id: 'readiness', title: 'Interface & readiness', summary: 'Check the native recorder before pressing Start.', lesson: 'Readiness comes from the native engine and interface list. Browser mode never simulates packets or permissions.', theory: 'Headers and metadata can show endpoints, ports, timing, flags, and sizes; encryption may hide payload content. The recorder also needs OS permission.', practice: ['Distinguish a listed interface from a capture-ready interface.', 'Predict metadata that may remain visible with TLS without claiming plaintext.'], observe: ['Read engine availability, blocked state, interface list, and scope note.', 'Browser mode must remain visibly unavailable.'], realWorldNote: 'DFIR notes separate permission/source failures from an empty result.' },
   { id: 'workflow', title: 'Bounded capture', summary: 'Prepare → record briefly → finish.', lesson: 'Choose a real interface, use a bounded duration, review visibility, then Start. Finish before reviewing; native status is authoritative.', theory: 'Short duration windows clarify timelines but may miss retries, delayed DNS, long sessions, or periodic traffic. Filters reduce volume but can remove context.', practice: ['Choose a 1–300 second window for one question.', 'Trigger one authorized low-risk action, then finish.', 'State what any filter excludes.'], observe: ['Watch recording become ready for review.', 'Treat bytes and state as acquisition indicators, not verdicts.'], realWorldNote: 'SOC playbooks use short, question-driven captures to reduce exposure.' },
   { id: 'evidence', title: 'Evidence review', summary: 'Separate observations from conclusions.', lesson: 'Build a brief only after a native session exists. Counts, protocols, endpoints, and observations are evidence—not proof of intent or compromise.', theory: 'Interpret protocol layers: link, IP, transport, then application indicators. A header can support “a connection was observed,” not “the host was compromised.”', practice: ['Record the exact field, timing, and alternative explanation.', 'Compare packet, captured-byte, wire-byte, and protocol totals.'], observe: ['Build a brief only from a stopped session with bytes.', 'Do not infer payload that was not decoded.'], realWorldNote: 'DFIR summaries should trace back to the original artifact and separate fact from interpretation.' },
   { id: 'boundaries', title: 'Export & report boundaries', summary: 'Share only what you have reviewed.', lesson: 'A capture may be sensitive. A brief is bounded metadata, not PCAP or hash proof. Review recipients, filenames, endpoints, and observations before reporting.', theory: 'Evidence handling requires provenance, integrity, access control, and retention. Never claim a hash, payload, or chain of custody the tool did not produce.', practice: ['Label facts, interpretations, and unknowns.', 'Remove unnecessary sensitive detail and record recipient, purpose, and location.'], observe: ['The panel identifies metadata only.', 'Without a native session, report unavailable collection—not an empty conclusion.'], realWorldNote: 'A good handoff lets the next analyst reproduce scope and see uncertainty.' },
]

export function captureBuddyMasteryStepAt(index: number): CaptureBuddyMasteryStep {
  return CAPTURE_BUDDY_MASTERY_STEPS[Math.min(Math.max(index, 0), CAPTURE_BUDDY_MASTERY_STEPS.length - 1)]
}

export function captureDurationError(value: string): string | null {
  if (!/^\d+$/.test(value)) return 'Duration must be a whole number of seconds.'
  const seconds = Number(value)
  return seconds >= 1 && seconds <= 300 ? null : 'Tutorial captures are limited to 1–300 seconds.'
}
