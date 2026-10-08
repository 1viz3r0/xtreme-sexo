export interface LabTopic {
  readonly id: string
  readonly category: 'Web' | 'Network' | 'Linux' | 'Forensics'
  readonly level: 'Beginner' | 'Intermediate' | 'Advanced'
  readonly title: string
  readonly description: string
  readonly status: 'available' | 'planned'
}

export const LAB_TOPIC_CATALOG: readonly LabTopic[] = Object.freeze([
  { id: 'web-exposure', category: 'Web', level: 'Beginner', title: 'Web Exposure', description: 'An original NET0ZE HTTP discovery exercise. Explore a local web target with your browser or curl, follow response clues to an exposed resource, and submit the flag you discover.', status: 'available' },
  { id: 'network-enumeration', category: 'Network', level: 'Beginner', title: 'Service Enumeration', description: 'Planned: map services in an isolated network and document the evidence behind an asset inventory.', status: 'planned' },
  { id: 'linux-permissions', category: 'Linux', level: 'Intermediate', title: 'Linux Permission Review', description: 'Planned: inspect file and service permissions and verify a least-privilege correction.', status: 'planned' },
  { id: 'forensics-timeline', category: 'Forensics', level: 'Advanced', title: 'Evidence Timeline', description: 'Planned: correlate disk and network artifacts into an evidence-backed incident timeline.', status: 'planned' },
].map(topic => Object.freeze(topic as LabTopic)))
