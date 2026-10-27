import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadCountryVector, loadAdmin1, hasAdmin1, geometryBBox, fitProjection, loadRegionsIndex, ADMIN1_COUNTRIES } from './geoMap.ts';
import { searchGeo, searchGeoCached } from './geoSearch.ts';

const admin1MetaJson = JSON.parse(readFileSync(new URL('../assets/geodata/admin1-meta.json', import.meta.url), 'utf8'));

// Node's fetch cannot read file:// URLs; shim it for the bundled-dataset loads.
const origFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (href.startsWith('file://')) {
    const data = readFileSync(fileURLToPath(new URL(href)));
    return Promise.resolve(new Response(data, { status: 200, headers: { 'content-type': 'application/json' } }));
  }
  return origFetch(input as RequestInfo, init);
}) as typeof fetch;

test('failed metadata and region loads reject honestly and permit a later retry', async () => {
  const bundledFetch = globalThis.fetch;
  globalThis.fetch = (async input => {
    const url = String(input);
    if (url.includes('/world-countries/') || url.endsWith('/regions-index.json')) return new Response('', { status: 503 });
    return bundledFetch(input);
  }) as typeof fetch;
  try {
    await assert.rejects(loadCountryVector('IN'), /country metadata 503/);
    await assert.rejects(loadRegionsIndex(), /regions index 503/);
  } finally {
    globalThis.fetch = bundledFetch;
  }
  assert.equal((await loadCountryVector('IN'))?.name, 'India');
  assert.ok((await loadRegionsIndex()).some(region => region.code === 'IN-UT'));
});

test('loadCountryVector resolves IN to India with real geometry', async () => {
  const v = await loadCountryVector('IN');
  assert.ok(v, 'India vector should load');
  assert.equal(v!.name, 'India');
  assert.equal(v!.iso2, 'IN');
  assert.ok(v!.capital);
  const coords = v!.geometry.coordinates as unknown[];
  assert.ok(Array.isArray(coords) && coords.length > 0, 'geometry has rings');
});

test('loadCountryVector returns null for unknown ISO2', async () => {
  const v = await loadCountryVector('ZZ');
  assert.equal(v, null);
});

test('hasAdmin1 only lists supported countries', () => {
  assert.ok(hasAdmin1('IN'));
  assert.ok(hasAdmin1('US'));
  assert.ok(hasAdmin1('DE'));
  assert.ok(!hasAdmin1('ZZ'));
  assert.ok(!hasAdmin1('AQ'));
  assert.equal(ADMIN1_COUNTRIES.length, 24);
});

test('loadAdmin1 IN contains Uttarakhand and Uttar Pradesh with codes', async () => {
  const regions = await loadAdmin1('IN');
  assert.ok(regions.length >= 30, `expected 30+ Indian states, got ${regions.length}`);
  const byCode = new Map(regions.map((r) => [r.code, r]));
  assert.ok(byCode.has('IN-UT'), 'IN-UT Uttarakhand present');
  assert.equal(byCode.get('IN-UT')!.name, 'Uttarakhand');
  assert.ok(byCode.has('IN-UP'), 'IN-UP Uttar Pradesh present');
  for (const r of regions) {
    assert.ok(r.name, 'region has name');
    assert.ok(r.geometry, 'region has geometry');
    assert.ok(Array.isArray(r.geometry.coordinates) && r.geometry.coordinates.length > 0);
  }
});

test('loadAdmin1 returns [] for unsupported countries', async () => {
  const regions = await loadAdmin1('ZZ');
  assert.deepEqual(regions, []);
});

test('geometryBBox + fitProjection produce finite results', () => {
  const b = { minLng: 68, maxLng: 98, minLat: 6, maxLat: 37 };
  const p = fitProjection(b, 600, 460, 0.08);
  assert.ok(Number.isFinite(p.k) && p.k > 0);
  assert.ok(Math.abs(p.cx - 83) < 1e-9);
  const b2 = geometryBBox({ type: 'Polygon', coordinates: [[[[10, 10], [20, 10], [20, 20], [10, 20], [10, 10]]]] });
  assert.equal(b2.minLng, 10);
  assert.equal(b2.maxLat, 20);
});

test('searchGeo: Utt matches Uttarakhand and Uttar Pradesh', async () => {
  const res = await searchGeo('Utt', 12);
  const names = res.map((r) => r.name);
  assert.ok(names.includes('Uttarakhand'), `missing Uttarakhand in ${names}`);
  assert.ok(names.includes('Uttar Pradesh'), `missing Uttar Pradesh in ${names}`);
  const ut = res.find((r) => r.name === 'Uttarakhand')!;
  if (ut.kind !== 'region') throw new Error('Uttarakhand should be a region');
  assert.equal(ut.code, 'IN-UT');
});

test('searchGeo: India returns the country first', async () => {
  const res = await searchGeo('India', 8);
  assert.ok(res.length > 0);
  const first = res[0];
  if (first.kind !== 'country') throw new Error('India should be a country result');
  assert.equal(first.name, 'India');
  assert.equal(first.iso2, 'IN');
  assert.ok(first.flag);
});

test('searchGeo: Delhi resolves', async () => {
  const res = await searchGeo('Delhi', 8);
  const d = res.find((r) => r.name === 'Delhi');
  assert.ok(d, 'Delhi found');
  assert.ok(d!.kind === 'city' || d!.kind === 'region', 'Delhi is a real city/region entry');
});

test('searchGeo: short queries and gibberish are safe', async () => {
  assert.deepEqual(await searchGeo('a'), []);
  assert.deepEqual(await searchGeo('zzzzqqqq'), []);
});

test('searchGeoCached caches results', async () => {
  const a = await searchGeoCached('Karnataka', 6);
  const b = await searchGeoCached('Karnataka', 6);
  assert.equal(a, b, 'cached results are the same array instance');
});

test('regions-index is complete and well-formed', async () => {
  const index = await loadRegionsIndex();
  assert.equal(index.length, 1119);
  for (const e of index) {
    assert.ok(e.name && e.country && e.type !== undefined);
    assert.ok(Number.isFinite(e.la) && Number.isFinite(e.lo));
    assert.ok(e.code === null || /^[A-Z]{2}-[A-Z0-9~]+$/.test(e.code), `bad code ${e.code}`);
  }
  const dupNames = index
    .map((e) => `${e.country}:${e.name}`)
    .filter((k, i, a) => a.indexOf(k) !== i);
  assert.deepEqual(dupNames, ['GB:Halton'], 'only known NE duplicate feature (GB Halton)');
});

test('admin1-meta keys are valid ISO 3166-2 codes', async () => {
  const meta = admin1MetaJson as Record<string, { cap?: string; lang?: string }>;
  assert.ok(meta['IN-UT'], 'Uttarakhand meta present');
  assert.ok(meta['IN-UT']!.cap && meta['IN-UT']!.lang);
  const index = await loadRegionsIndex();
  const codes = new Set(index.map((e) => e.code).filter((c): c is string => c !== null));
  for (const key of Object.keys(meta)) {
    assert.ok(codes.has(key), `meta key ${key} not in regions index`);
  }
});
