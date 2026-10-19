export interface LabTopic {
  readonly id: string
  readonly category: 'Web' | 'Network' | 'Linux' | 'Forensics'
  readonly level: 'Beginner' | 'Intermediate' | 'Advanced'
  readonly title: string
  readonly description: string
  readonly status: 'available' | 'planned'
  readonly objective?: string
  readonly targetSurface?: readonly string[]
  readonly investigationSteps?: readonly string[]
  readonly challengeGuidance?: readonly string[]
}

export const LAB_TOPIC_CATALOG: readonly LabTopic[] = Object.freeze([
  { id: 'web-exposure', category: 'Web', level: 'Beginner', title: 'Web Exposure', description: 'An original NET0ZE HTTP discovery exercise. Explore a local web target with its browser-facing pages and read-only challenge API, follow response clues to an exposed resource, and submit the flag you discover.', status: 'available', objective: 'Trace public HTTP information until you can explain how an exposed deployment resource was reached, then submit the value recovered during your investigation.', targetSurface: ['Local Harborline Dispatch HTTP target', '/', '/dashboard', '/shipments/lookup', '/operations/status', '/help', '/changes', '/api/room', '/api/challenge', '/robots.txt', '/site-map.txt', '/api/releases', '/support/exports/'], investigationSteps: ['Record the initial response status, headers, and links.', 'Read the room manifest and challenge stages without expecting the answer to be present.', 'Compare crawler guidance with the routes actually advertised by the site.', 'Follow release and support references and preserve the relevant response or file as evidence.', 'Submit only the value you recovered from the target.'], challengeGuidance: ['Start with low-noise requests: browser navigation or curl -i.', 'Use the application’s own links, metadata, and response bodies to choose the next request.', 'Use /api/challenge as a map of learning stages, not as an answer source.', 'When you reach a downloadable artifact, inspect it locally and document its path and contents.', 'The room validates your submission; it does not reveal the expected answer.'] },
  { id: 'network-enumeration', category: 'Network', level: 'Beginner', title: 'Service Enumeration', description: 'Planned: map services in an isolated network and document the evidence behind an asset inventory.', status: 'planned' },
  { id: 'linux-permissions', category: 'Linux', level: 'Intermediate', title: 'Linux Permission Review', description: 'Planned: inspect file and service permissions and verify a least-privilege correction.', status: 'planned' },
  { id: 'forensics-timeline', category: 'Forensics', level: 'Advanced', title: 'Evidence Timeline', description: 'Planned: correlate disk and network artifacts into an evidence-backed incident timeline.', status: 'planned' },
].map(topic => Object.freeze(topic as LabTopic)))
