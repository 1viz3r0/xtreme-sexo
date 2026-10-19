export type LabBadgeId = 'scan-buddy-master' | 'scan-buddy-challenge' | 'capture-buddy-master' | 'capture-buddy-challenge'

export interface LabBadge { id: LabBadgeId; title: string; description: string; earnedAt: string }

const KEY = 'netoze:lab-badges:v1'

export function loadLabBadges(scope = 'guest'): LabBadge[] {
  try {
    const value = JSON.parse(localStorage.getItem(`${KEY}:${scope}`) ?? '[]')
    return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string') as LabBadge[] : []
  } catch { return [] }
}

export function awardLabBadge(id: LabBadgeId, scope = 'guest'): LabBadge {
  const definitions: Record<LabBadgeId, Omit<LabBadge, 'earnedAt'>> = {
    'scan-buddy-master': { id, title: 'Scan Buddy Learner', description: 'Completed the Scan Buddy guided lessons.' },
    'scan-buddy-challenge': { id, title: 'Scan Buddy Practitioner', description: 'Completed a native, authorized Scan Buddy challenge.' },
    'capture-buddy-master': { id, title: 'Capture Buddy Learner', description: 'Completed the Capture Buddy guided lessons.' },
    'capture-buddy-challenge': { id, title: 'Capture Buddy Practitioner', description: 'Completed a native, authorized Capture Buddy evidence challenge.' },
  }
  const existing = loadLabBadges(scope).find(item => item.id === id)
  if (existing) return existing
  const badge = { ...definitions[id], earnedAt: new Date().toISOString() }
  try { localStorage.setItem(`${KEY}:${scope}`, JSON.stringify([...loadLabBadges(scope), badge])) } catch { /* optional local progress */ }
  return badge
}
