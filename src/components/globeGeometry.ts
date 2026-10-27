import * as THREE from 'three';
import type { CountryPolyData } from '../lib/countryIndex';

export const MIN_CAMERA_DISTANCE = 1.85;
export const MAX_CAMERA_DISTANCE = 5.5;
export const MAX_ENDPOINT_MARKERS = 500;
export const MAX_FLOW_ARCS = 150;
export const DEFAULT_CAMERA_POSITION = { lat: 20, lng: 10, distance: 3.2 };

export function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const ownedMaterials = new Set<THREE.Material>();
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(material => {
      // Dispose any owned map texture before releasing the material.
      const map = (material as THREE.MeshBasicMaterial).map;
      if (map) textures.add(map);
      ownedMaterials.add(material);
    });
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  ownedMaterials.forEach(material => material.dispose());
  group.clear();
}

export function geoMarker(lat: number, lng: number, color: string, label: string, kind: 'region' | 'city'): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(globePoint(lat, lng, 1.014));
  // Scale the small visible dot with camera distance, independently of its hit target.
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color }));
  marker.name = 'geography-marker';
  const hitProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 8, 6),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitProxy.name = 'geography-hit-proxy';
  hitProxy.userData.hoverLabel = label;
  hitProxy.userData.kind = kind;
  group.add(marker);
  group.add(hitProxy);
  return group;
}

// Prefer geography nearest the current view over the dataset's alphabetical order.
export function nearestGeography<T>(items: T[], coordinate: (item: T) => { lat: number; lng: number }, camera: THREE.Vector3, limit: number): T[] {
  const direction = camera.clone().normalize();
  return items.filter(item => validCoordinate(coordinate(item)))
    .map(item => ({ item, score: globePoint(coordinate(item).lat, coordinate(item).lng).dot(direction) }))
    .sort((a, b) => b.score - a.score).slice(0, limit).map(entry => entry.item);
}

export function visibleHit(hits: THREE.Intersection[], surfaceHit: THREE.Intersection | undefined, camera: THREE.Vector3): THREE.Intersection | undefined {
  return hits.find(hit => {
    const center = hit.object.getWorldPosition(new THREE.Vector3());
    return (!surfaceHit || hit.distance < surfaceHit.distance)
      && center.dot(camera.clone().sub(center)) > 0;
  });
}

export function validCoordinate(point: { lat: number; lng: number } | null | undefined): point is { lat: number; lng: number } {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

// Matches the equirectangular UVs of Three.js SphereGeometry.
export function globePoint(lat: number, lng: number, radius = 1): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(lat);
  const theta = THREE.MathUtils.degToRad(lng);
  return new THREE.Vector3(Math.cos(phi) * Math.cos(theta), Math.sin(phi), -Math.cos(phi) * Math.sin(theta)).multiplyScalar(radius);
}

export function globeCoordinate(point: THREE.Vector3): { lat: number; lng: number } {
  const p = point.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(p.y, -1, 1))), lng: THREE.MathUtils.radToDeg(Math.atan2(-p.z, p.x)) };
}

export function hubArc(hub: { lat: number; lng: number }, endpoint: { lat: number; lng: number }): THREE.Vector3[] {
  if (!validCoordinate(hub) || !validCoordinate(endpoint)) return [];
  const start = globePoint(hub.lat, hub.lng);
  const end = globePoint(endpoint.lat, endpoint.lng);
  const angle = Math.acos(THREE.MathUtils.clamp(start.dot(end), -1, 1));
  if (angle < 0.00001) return [];
  const axis = new THREE.Vector3().crossVectors(start, end);
  // Antipodal points have no unique great circle; choose a stable perpendicular.
  if (axis.lengthSq() < 1e-12) axis.crossVectors(start, Math.abs(start.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0));
  axis.normalize();
  return Array.from({ length: 65 }, (_, i) => {
    const t = i / 64;
    return start.clone().applyAxisAngle(axis, angle * t).multiplyScalar(1.012 + Math.sin(Math.PI * t) * Math.min(0.32, angle * 0.14));
  });
}

// Unlike the legacy flat ring index, retain polygon holes and unwrap dateline rings.
export function unwrapRing(ring: number[][]): number[][] {
  const out: number[][] = [];
  for (const [lng, lat] of ring) {
    let x = lng;
    if (out.length) {
      const previous = out[out.length - 1][0];
      while (x - previous > 180) x -= 360;
      while (x - previous < -180) x += 360;
    }
    out.push([x, lat]);
  }
  return out;
}

function ringContains(ring: number[][], lat: number, lng: number): boolean {
  if (ring.length < 3) return false;
  const unwrapped = unwrapRing(ring);
  if (Math.abs(unwrapped.at(-1)![0] - unwrapped[0][0]) > 180) {
    const pole = unwrapped[0][1] < 0 ? -90 : 90;
    unwrapped.push([unwrapped.at(-1)![0], pole], [unwrapped[0][0], pole]);
  }
  const center = unwrapped.reduce((sum, p) => sum + p[0], 0) / unwrapped.length;
  const x = lng + Math.round((center - lng) / 360) * 360;
  let inside = false;
  for (let i = 0, j = unwrapped.length - 1; i < unwrapped.length; j = i++) {
    const [xi, yi] = unwrapped[i];
    const [xj, yj] = unwrapped[j];
    if ((yi > lat) !== (yj > lat) && x < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function globeCountry<T extends CountryPolyData>(countries: T[], lat: number, lng: number): T | null {
  return countries.find(country => country.polys.some(poly =>
    poly.length > 0 && ringContains(poly[0], lat, lng) && !poly.slice(1).some(hole => ringContains(hole, lat, lng)),
  )) ?? null;
}
