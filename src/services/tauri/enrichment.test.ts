import test from 'node:test';
import assert from 'node:assert/strict';
import type { GlobalIntelSnapshot } from './globalIntel';
import type { WatchtowerEnrichmentResult } from './intel';

test('Watchtower snapshot and explicit enrichment contracts preserve provenance fields', () => {
  const snapshot: Pick<GlobalIntelSnapshot, 'enrichment' | 'geoip'> = {
    enrichment: { state: 'CACHE_ONLY', detail: 'No external requests' }, geoip: [],
  };
  const refresh: WatchtowerEnrichmentResult = { requested_ips: 2, attempted_ips: 2, geoip: [], sources: [{ source: 'connectivity', state: 'ONLINE', refreshed_at: '2026-01-01T00:00:00Z', cache_timestamp: 1, detail: 'ok' }], errors: [] };
  assert.equal(snapshot.enrichment.state, 'CACHE_ONLY');
  assert.equal(refresh.geoip.every((entry) => typeof entry.stale === 'boolean'), true);
  assert.ok(refresh.sources[0].cache_timestamp !== null);
});
