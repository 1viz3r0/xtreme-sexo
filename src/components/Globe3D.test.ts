import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { disposeGroup, geoMarker, nearestGeography, visibleHit, MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE, MAX_ENDPOINT_MARKERS, MAX_FLOW_ARCS } from './Globe3D.tsx';
import { globePoint } from './globeGeometry.ts';

const source = readFileSync(new URL('./Globe3D.tsx', import.meta.url), 'utf8');

test('globe scene and overlay are strictly monochrome', () => {
  assert.doesNotMatch(source, /purple|cyan|text-slate|text-emerald|text-amber/i);
  for (const [, hex] of source.matchAll(/#([a-f0-9]{6})(?:[a-f0-9]{2})?/gi)) {
    assert.equal(hex.slice(0, 2), hex.slice(2, 4));
    assert.equal(hex.slice(2, 4), hex.slice(4, 6));
  }
  assert.match(source, /const colorFor = .* => '#f5f5f5'/);
});

test('tiny dots have a separate invisible hit target and no persistent label', () => {
  const marker = geoMarker(0, 0, '#f5f5f5', 'Test city', 'city');
  const [dot, proxy] = marker.children as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[];
  assert.equal(dot.geometry.parameters.radius, 0.006);
  assert.equal(proxy.geometry.parameters.radius, 0.025);
  assert.equal(proxy.material.opacity, 0);
  assert.equal(proxy.material.depthWrite, false);
  assert.equal(proxy.userData.hoverLabel, 'Test city');
  assert.equal(marker.children.length, 2);
  assert.doesNotMatch(source, /new THREE\.Sprite|geoLabelSprite|declutterGeoLabels/);
  assert.match(source, /hovered && !unavailable/);
  assert.match(source, /max-w-\[90%\].*truncate/);
  disposeGroup(marker);
});

test('actual raycasts pick a front marker but never a far-side or occluded marker', () => {
  const camera = globePoint(0, 0, 3.2);
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshBasicMaterial());
  const front = geoMarker(0, 0, '#ffffff', 'Front', 'city');
  const back = geoMarker(0, 180, '#ffffff', 'Back', 'city');
  const scene = new THREE.Group(); scene.add(surface, front, back); scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(camera, camera.clone().negate().normalize());
  const surfaceHit = ray.intersectObject(surface)[0];
  const frontHit = visibleHit(ray.intersectObjects(front.children), surfaceHit, camera);
  assert.equal(frontHit?.object.userData.hoverLabel, 'Front');
  assert.equal(visibleHit(ray.intersectObjects(back.children), surfaceHit, camera), undefined);
  // Even without a surface hit, a proxy protruding around the limb cannot expose
  // a center on the far hemisphere.
  assert.equal(visibleHit(ray.intersectObjects(back.children), undefined, camera), undefined);
  assert.equal(visibleHit(ray.intersectObjects(front.children), { ...surfaceHit, distance: 0.1 }, camera), undefined);
  disposeGroup(scene);
});

test('hidden geography is excluded from raycasts and hover falls back to country', () => {
  assert.match(source, /regionMarkers\.visible \? visibleHit/);
  assert.match(source, /cityMarkers\.visible \? visibleHit/);
  assert.match(source, /filter\(hit => hit\.object\.userData\.hoverLabel\)/);
  assert.match(source, /marker\?\.hoverLabel \?\? country\?\.n/);
  assert.match(source, /regionMarkers\.visible = next !== 'WORLD'/);
  assert.match(source, /cityMarkers\.visible = next === 'CITIES'/);
});

test('bundled geography selection is bounded, valid, and follows the viewing hemisphere', () => {
  const data = [
    { lat: 0, lng: 180, name: 'West' },
    { lat: NaN, lng: 0, name: 'Invalid' },
    { lat: 0, lng: 0, name: 'East' },
    { lat: 0, lng: 90, name: 'Side' },
  ];
  assert.deepEqual(nearestGeography(data, item => item, globePoint(0, 0, 3), 1).map(item => item.name), ['East']);
  assert.deepEqual(nearestGeography(data, item => item, globePoint(0, 180, 3), 1).map(item => item.name), ['West']);
  assert.equal(nearestGeography(data, item => item, globePoint(0, 0), 100).length, 3);
  assert.equal(nearestGeography(data, item => item, globePoint(0, 0), 0).length, 0);
  assert.deepEqual(data.map(item => item.name), ['West', 'Invalid', 'East', 'Side']);
  for (const [file, coordinate, cap] of [
    ['regions-index.json', (item: any) => ({ lat: item.la, lng: item.lo }), 240],
    ['cities.json', (item: any) => ({ lat: item[2], lng: item[3] }), 320],
  ] as const) {
    const bundled = JSON.parse(readFileSync(new URL(`../assets/geodata/${file}`, import.meta.url), 'utf8'));
    const selected = nearestGeography(bundled, coordinate, globePoint(28.6, 77.2, 2), cap);
    assert.equal(selected.length, Math.min(cap, bundled.length));
    assert.ok(selected.every(item => Number.isFinite(coordinate(item).lat)));
  }
  assert.match(source, /time - geographyTime < 250/);
  assert.match(source, /if \(!marker\).*geoMarker/);
  assert.match(source, /const MAX_REGION_MARKERS = 240/);
  assert.match(source, /const MAX_CITY_MARKERS = 320/);
  assert.doesNotMatch(source, /'TOWNS'|'ROADS'|'BUILDINGS'/);
});

test('endpoint meshes and arcs are bounded while the endpoint menu retains all locations', () => {
  assert.equal(MAX_ENDPOINT_MARKERS, 500);
  assert.equal(MAX_FLOW_ARCS, 150);
  assert.match(source, /validNodes\.slice\(0, MAX_ENDPOINT_MARKERS\)/);
  assert.match(source, /seen\.size >= MAX_FLOW_ARCS/);
  assert.match(source, /validNodes\.map\(node => <option/);
});

test('quality settings and camera bounds preserve continuous supported zoom', () => {
  assert.ok(MIN_CAMERA_DISTANCE > 1);
  assert.ok(MIN_CAMERA_DISTANCE < 2.25);
  assert.ok(MAX_CAMERA_DISTANCE > 3.5);
  assert.match(source, /controls\.minDistance = MIN_CAMERA_DISTANCE/);
  assert.match(source, /controls\.maxDistance = MAX_CAMERA_DISTANCE/);
  assert.match(source, /spherical\.radius = THREE\.MathUtils\.clamp/);
  assert.match(source, /antialias: true/);
  assert.match(source, /setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 2\)\)/);
  assert.match(source, /canvas\.width = 4096/);
  assert.match(source, /canvas\.height = 2048/);
  assert.match(source, /getMaxAnisotropy\(\), 8/);
  assert.match(source, /texture\.minFilter = THREE\.LinearMipmapLinearFilter/);
  assert.match(source, /texture\.magFilter = THREE\.LinearFilter/);
  assert.match(source, /scaleMarkerMeshes\(endpoints/);
});

test('owned and shared resources are disposed once and groups are cleared', () => {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: texture });
  const counts = { geometry: 0, texture: 0, material: 0 };
  geometry.addEventListener('dispose', () => counts.geometry++);
  texture.addEventListener('dispose', () => counts.texture++);
  material.addEventListener('dispose', () => counts.material++);
  group.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, [material, material]));
  disposeGroup(group);
  assert.deepEqual(counts, { geometry: 1, texture: 1, material: 1 });
  assert.equal(group.children.length, 0);
  disposeGroup(group);
  assert.deepEqual(counts, { geometry: 1, texture: 1, material: 1 });
  assert.match(source, /cancelAnimationFrame\(frame\)/);
  assert.match(source, /observer\.disconnect\(\)/);
  assert.match(source, /controls\.dispose\(\)/);
  assert.match(source, /renderer\.dispose\(\)/);
  assert.match(source, /canvas\.remove\(\)/);
  const added = [...source.matchAll(/canvas\.addEventListener\('([^']+)', (\w+)\)/g)].map(match => `${match[1]}:${match[2]}`);
  const removed = [...source.matchAll(/canvas\.removeEventListener\('([^']+)', (\w+)\)/g)].map(match => `${match[1]}:${match[2]}`);
  assert.deepEqual(added, removed);
});

test('click handling rejects drag and other pointers and context loss exposes fallback', () => {
  assert.match(source, /event\.pointerId !== pointerStart\.id/);
  assert.match(source, /if \(dragged\) return/);
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /releasePointerCapture\(event\.pointerId\)/);
  assert.match(source, /latest\.current\.onSelectNode\(node\)/);
  assert.match(source, /latest\.current\.onSelectCountry\(countrySelection\(country\)\)/);
  assert.match(source, /if \(contextAvailable\) renderer\.render/);
  assert.match(source, /3D VIEW UNAVAILABLE/);
});
