import type { CareerPathId } from './fieldGuideCatalog';
import { ALL_CAREER_PATHS } from './fieldGuideCatalog';
const KEY = 'netoze_field_guide_preferences_v1';
const valid = new Set<CareerPathId>(ALL_CAREER_PATHS.map(path => path.id));
export function loadFieldGuideCareer(scope = 'guest'): CareerPathId { try { const raw = localStorage.getItem(`${KEY}:${scope}`); const value = raw ? JSON.parse(raw).careerId : null; return typeof value === 'string' && (valid.size === 0 || valid.has(value)) ? value : 'explorer'; } catch { return 'explorer'; } }
export function saveFieldGuideCareer(careerId: CareerPathId, scope = 'guest'): void { try { if (!valid.has(careerId)) return; localStorage.setItem(`${KEY}:${scope}`, JSON.stringify({ version: 1, careerId })); } catch { /* preferences are optional */ } }
