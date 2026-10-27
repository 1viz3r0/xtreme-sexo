import { loadRegionsIndex, type RegionIndexEntry } from './geoMap.ts';

type CountryPolyLite = { n: string; iso: string; la: number; lo: number; fl?: string };

type CityEntry = [string, string, number, number]; // [name, iso2, lat, lng]

const COUNTRIES_URL = new URL('../assets/geodata/countries.json', import.meta.url).href;
const CITIES_URL = new URL('../assets/geodata/cities.json', import.meta.url).href;

let countriesPromise: Promise<CountryPolyLite[]> | null = null;
let citiesPromise: Promise<CityEntry[]> | null = null;

function loadJson<T>(url: string): Promise<T> {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`geo data ${res.status}`);
    return res.json() as Promise<T>;
  });
}

export type GeoSearchResult =
  | { kind: 'country'; name: string; iso2: string; flag: string | null; lat: number; lng: number }
  | { kind: 'region'; name: string; code: string | null; country: string; type: string | null; lat: number; lng: number }
  | { kind: 'city'; name: string; country: string; lat: number; lng: number };

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function score(name: string, code: string | null, q: string): number {
  const n = normalize(name);
  if (code && (normalize(code) === q || normalize(code).endsWith(`-${q}`))) return 6;
  if (n === q) return 5;
  if (n.startsWith(q)) return 4;
  const words = n.split(' ');
  if (words.some((w) => w.startsWith(q) && w.length > 2)) return 3;
  if (n.includes(q)) return 2;
  return 0;
}

export async function searchGeo(query: string, limit = 12): Promise<GeoSearchResult[]> {
  const q = normalize(query);
  if (q.length < 2) return [];
  countriesPromise ??= loadJson<CountryPolyLite[]>(COUNTRIES_URL).catch(error => { countriesPromise = null; throw error; });
  citiesPromise ??= loadJson<CityEntry[]>(CITIES_URL).catch(error => { citiesPromise = null; throw error; });
  const [countries, cities, regions] = await Promise.all([countriesPromise, citiesPromise, loadRegionsIndex()]);

  const out: { s: number; r: GeoSearchResult }[] = [];

  for (const c of countries) {
    const s = score(c.n, c.iso, q);
    if (s > 0) out.push({ s, r: { kind: 'country', name: c.n, iso2: c.iso, flag: c.fl ?? null, lat: c.la, lng: c.lo } });
  }
  for (const r of regions as RegionIndexEntry[]) {
    const s = score(r.name, r.code, q);
    if (s > 0) out.push({ s, r: { kind: 'region', name: r.name, code: r.code, country: r.country, type: r.type, lat: r.la, lng: r.lo } });
  }
  for (const [name, iso2, lat, lng] of cities) {
    const s = score(name, null, q);
    if (s > 0) out.push({ s, r: { kind: 'city', name, country: iso2, lat, lng } });
  }

  out.sort((a, b) => b.s - a.s || a.r.name.length - b.r.name.length);
  return out.slice(0, limit).map((o) => o.r);
}

const resultCache = new Map<string, GeoSearchResult[]>();

export async function searchGeoCached(query: string, limit = 12): Promise<GeoSearchResult[]> {
  const key = `${query}|${limit}`;
  const hit = resultCache.get(key);
  if (hit) return hit;
  const res = await searchGeo(query, limit);
  resultCache.set(key, res);
  return res;
}
