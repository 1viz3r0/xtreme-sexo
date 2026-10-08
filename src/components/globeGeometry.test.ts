import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { globeCoordinate, globeCountry, globePoint, hubArc, validCoordinate } from './globeGeometry.ts';

test('only finite geographic coordinates are accepted, including genuine zero coordinates', () => {
  assert.equal(validCoordinate({ lat: 0, lng: 0 }), true);
  assert.equal(validCoordinate({ lat: -90, lng: 180 }), true);
  for (const point of [null, undefined, { lat: NaN, lng: 1 }, { lat: 0, lng: Infinity }, { lat: 91, lng: 0 }, { lat: 0, lng: -181 }]) {
    assert.equal(validCoordinate(point), false);
  }
  assert.equal(validCoordinate({ lat: null, lng: null } as unknown as { lat: number; lng: number }), false);
});

test('endpoint position and country picking coordinates agree across hemispheres', () => {
  for (const [lat, lng] of [[0, 0], [51.5, -0.12], [-33.86, 151.2], [35, -120], [-17, 179.5]]) {
    const actual = globeCoordinate(globePoint(lat, lng));
    assert.ok(Math.abs(actual.lat - lat) < 1e-8);
    assert.ok(Math.abs(actual.lng - lng) < 1e-8);
  }
});

test('arcs stay above Earth and connect actual endpoints, even at antipodes', () => {
  const hub = { lat: 0, lng: 0 };
  for (const destination of [{ lat: 20, lng: 170 }, { lat: 0, lng: 180 }, { lat: -30, lng: -90 }]) {
    const points = hubArc(hub, destination);
    assert.equal(points.length, 65);
    assert.ok(points.every(point => Number.isFinite(point.length()) && point.length() >= 1.011));
    assert.ok(points[0].distanceTo(globePoint(0, 0, 1.012)) < 1e-8);
    assert.ok(points.at(-1)!.distanceTo(globePoint(destination.lat, destination.lng, 1.012)) < 1e-8);
  }
  assert.deepEqual(hubArc(hub, hub), []);
  assert.deepEqual(hubArc(hub, { lat: NaN, lng: 0 }), []);
});

test('country picking honors holes and polygons crossing the dateline', () => {
  const country = { n: 'Test geometry', iso: 'XX', la: 0, lo: 180, polys: [[
    [[170, -10], [-170, -10], [-170, 10], [170, 10]],
    [[175, -2], [-175, -2], [-175, 2], [175, 2]],
  ]] };
  assert.equal(globeCountry([country], 5, 179)?.iso, 'XX');
  assert.equal(globeCountry([country], 5, -179)?.iso, 'XX');
  assert.equal(globeCountry([country], 0, 179), null);
  assert.equal(globeCountry([country], 5, 0), null);
});

test('bundled country data resolves recognizable land and leaves ocean empty', () => {
  const countries = JSON.parse(readFileSync(new URL('../assets/geodata/countries.json', import.meta.url), 'utf8'));
  for (const [lat, lng, iso] of [[48.85, 2.35, 'FR'], [41.88, -87.63, 'US'], [28.6, 77.2, 'IN'], [-17.8, 178, 'FJ'], [-85, 40, 'AQ']] as const) {
    assert.equal(globeCountry(countries, lat, lng)?.iso, iso);
  }
  assert.equal(globeCountry(countries, 0, -140), null);
});
