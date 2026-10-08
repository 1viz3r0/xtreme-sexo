import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import countriesData from '../assets/geodata/countries.json';
import regionsData from '../assets/geodata/regions-index.json';
import citiesData from '../assets/geodata/cities.json';
import type { CountryPolyData } from '../lib/countryIndex';
import { globeCoordinate, globeCountry, globePoint, hubArc, unwrapRing, validCoordinate } from './globeGeometry';

export type LocationNode = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  pkts: string;
  rtt: string;
  status: 'low' | 'medium' | 'high' | 'critical';
  color: string;
  activeFlowsCount: number;
  threatLevel: string;
  ip: string;
};

export type CountryGeo = {
  name: string;
  iso: string;
  lat: number;
  lng: number;
  cap?: string | null;
  r?: string | null;
  sr?: string | null;
  fl?: string;
  state?: string | null;
};

export interface Globe3DProps {
  nodes: LocationNode[];
  selectedNode: LocationNode | null;
  onSelectNode: (node: LocationNode | null) => void;
  selectedCountry: CountryGeo | null;
  onSelectCountry: (country: CountryGeo | null) => void;
  isAutoRotate: boolean;
  hub?: { lat: number; lng: number } | null;
  captureStatus: string;
  captureMetrics: {
    packets_per_sec: number;
    bytes_per_sec: number;
    packets_captured: number;
    bytes_captured: number;
    status: string;
  };
  activeFlows: LocationNode[];
}

type GlobeCountry = CountryPolyData & { cap?: string; r?: string; sr?: string; fl?: string };
const countries = countriesData as GlobeCountry[];
type RegionDatum = { code: string; name: string; country: string; type: string; la: number; lo: number };
type CityDatum = [name: string, country: string, lat: number, lng: number];
const regions = regionsData as RegionDatum[];
const cities = citiesData as CityDatum[];
const sortedCountries = [...countries].sort((a, b) => a.n.localeCompare(b.n));
const countrySelection = (country: GlobeCountry): CountryGeo => ({
  name: country.n, iso: country.iso, lat: country.la, lng: country.lo,
  cap: country.cap, r: country.r, sr: country.sr, fl: country.fl,
});

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

function countryTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  // Keep enough texels for the close (CITIES) stage without allocating an
  // unnecessarily large 8k-style map. The camera floor below prevents this
  // texture from being pushed into an unusable pixel-burst range.
  canvas.width = 4096;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Map texture unavailable');
  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#242424';
  ctx.lineWidth = 0.65;
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = (lng + 180) / 360 * canvas.width;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = (90 - lat) / 180 * canvas.height;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.fillStyle = '#252525';
  ctx.strokeStyle = '#737373';
  ctx.lineWidth = 0.85;
  for (const country of countries) {
    for (const poly of country.polys) {
      for (const offset of [-360, 0, 360]) {
        ctx.beginPath();
        for (const ring of poly) {
          const unwrapped = unwrapRing(ring);
          unwrapped.forEach(([lng, lat], index) => {
            const x = (lng + offset + 180) / 360 * canvas.width;
            const y = (90 - lat) / 180 * canvas.height;
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          });
          // Polar polygons close through the pole, not across the map interior.
          if (unwrapped.length > 2 && Math.abs(unwrapped.at(-1)![0] - unwrapped[0][0]) > 180) {
            const poleY = unwrapped[0][1] < 0 ? canvas.height : 0;
            ctx.lineTo((unwrapped.at(-1)![0] + offset + 180) / 360 * canvas.width, poleY);
            ctx.lineTo((unwrapped[0][0] + offset + 180) / 360 * canvas.width, poleY);
          }
          ctx.closePath();
        }
        ctx.fill('evenodd'); ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

type GlobeRuntime = {
  endpoints: THREE.Group;
  arcs: THREE.Group;
  selection: THREE.Group;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  regions: THREE.Group;
  cities: THREE.Group;
  setZoomLevel: (level: ZoomLevel) => void;
};
type ZoomLevel = 'WORLD' | 'REGIONS' | 'CITIES';
// Do not let OrbitControls enlarge individual texture texels across the view.
// This still leaves a useful close-up for the CITIES stage while keeping the
// whole globe and its marker layers usable on modest displays.
export const MIN_CAMERA_DISTANCE = 1.85;
export const MAX_CAMERA_DISTANCE = 5.5;
const zoomLevelFor = (distance: number): ZoomLevel => distance <= 2.25 ? 'CITIES' : distance <= 3.5 ? 'REGIONS' : 'WORLD';
// The globe is intentionally monochrome. Endpoint status is still conveyed by
// the surrounding telemetry/detail views, not by introducing accent colors here.
const colorFor = (_color: string) => '#f5f5f5';
const metric = (value: number, decimals?: number) => Number.isFinite(value) && value >= 0
  ? decimals === undefined ? value.toLocaleString() : value.toFixed(decimals)
  : '—';

export function geoMarker(lat: number, lng: number, color: string, label: string, kind: 'region' | 'city'): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(globePoint(lat, lng, 1.014));
  // Keep the geometry deliberately small.  Its screen size is adjusted by the
  // camera-distance scaler below rather than by making a billboard/text sprite.
  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color }));
  marker.name = 'geography-marker';
  // Keep the hit target separate from the visible dot: labels should be easy to
  // trigger without making the geography look like a field of oversized blobs.
  const hitProxy = new THREE.Mesh(
    // The proxy is intentionally much larger than the dot so deep-zoom hover
    // remains usable without adding any visible text or oversized markers.
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

// Keep the scene bounded even when the bundled geography grows. Labels are
// never created here: only these dots and their invisible hit proxies exist.
const MAX_REGION_MARKERS = 240;
const MAX_CITY_MARKERS = 320;
export const MAX_ENDPOINT_MARKERS = 500;
export const MAX_FLOW_ARCS = 150;

// Prefer the geography nearest the current view instead of truncating the
// alphabetically ordered dataset to a handful of countries.
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

/** Markers should never bloom into oversized dots at the closest zoom. */
function markerScaleForDistance(distance: number): number {
  return THREE.MathUtils.clamp(0.48 + (distance - 1.4) / (5.5 - 1.4) * 0.52, 0.48, 1);
}

function scaleMarkerMeshes(group: THREE.Group, scale: number) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh) object.scale.setScalar(scale);
  });
}

export const Globe3D: React.FC<Globe3DProps> = (props) => {
  const { nodes, selectedNode, selectedCountry, isAutoRotate, hub, activeFlows, captureStatus, captureMetrics } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<GlobeRuntime | null>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [hovered, setHovered] = useState('');
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('WORLD');
  const validNodes = useMemo(() => nodes.filter(validCoordinate), [nodes]);

  /* Renderer availability is external state; report initialization failures to React. */
  /* eslint-disable react/set-state-in-effect */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { setUnavailable(true); return; }
    const scene = new THREE.Scene();
    const globe = new THREE.Group();
    const endpoints = new THREE.Group();
    const arcs = new THREE.Group();
    const selection = new THREE.Group();
    const regionMarkers = new THREE.Group();
    const cityMarkers = new THREE.Group();
    scene.add(globe, endpoints, arcs, selection, regionMarkers, cityMarkers);
    let texture: THREE.CanvasTexture;
    try { texture = countryTexture(); }
    catch { renderer.dispose(); setUnavailable(true); return; }
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
     texture.minFilter = THREE.LinearMipmapLinearFilter;
     texture.magFilter = THREE.LinearFilter;
     texture.generateMipmaps = true;
     texture.needsUpdate = true;
    const surface = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshBasicMaterial({ map: texture }));
    globe.add(surface);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.025, 48, 32), new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false,
      uniforms: { glowColor: { value: new THREE.Color('#d4d4d4') } },
      vertexShader: 'varying vec3 vNormal; varying vec3 vPosition; void main() { vNormal = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position, 1.0); vPosition = p.xyz; gl_Position = projectionMatrix * p; }',
      fragmentShader: 'uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vPosition; void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(-vPosition))), 3.0); gl_FragColor = vec4(glowColor, rim * 0.38); }',
    }));
    globe.add(atmosphere);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 30);
    camera.position.copy(globePoint(20, 10, 3.2));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
     controls.minDistance = MIN_CAMERA_DISTANCE;
     controls.maxDistance = MAX_CAMERA_DISTANCE;
    controls.zoomSpeed = 0.8;
    controls.autoRotateSpeed = 0.35;
    controls.rotateSpeed = 0.55;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x050505, 0);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', 'Interactive globe. Drag to rotate, scroll to zoom. Arrow keys rotate; plus and minus zoom. Use endpoint and country menus for keyboard selection.');
    host.appendChild(renderer.domElement);
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    const raycaster = new THREE.Raycaster();
    const cursor = new THREE.Vector2();
    let pointerStart: { x: number; y: number; id: number } | null = null;
    let moved = false;
    const hitAt = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return {};
      cursor.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      raycaster.setFromCamera(cursor, camera);
      const surfaceHit = raycaster.intersectObject(surface)[0];
      const endpointHit = visibleHit(raycaster.intersectObjects(endpoints.children, true), surfaceHit, camera.position);
      const regionHit = regionMarkers.visible ? visibleHit(raycaster.intersectObjects(regionMarkers.children, true).filter(hit => hit.object.userData.hoverLabel), surfaceHit, camera.position) : undefined;
      const cityHit = cityMarkers.visible ? visibleHit(raycaster.intersectObjects(cityMarkers.children, true).filter(hit => hit.object.userData.hoverLabel), surfaceHit, camera.position) : undefined;
      // The opaque surface occludes endpoints on the far hemisphere.
      const node = endpointHit && (!surfaceHit || endpointHit.distance < surfaceHit.distance)
        ? endpointHit.object.userData.node as LocationNode | undefined : undefined;
      const coordinate = surfaceHit ? globeCoordinate(surfaceHit.point) : null;
      // A proxy is only actionable when it is in front of the opaque globe.
      // This keeps far-side labels from winning the raycast over the surface.
      const visibleMarker = (hit: THREE.Intersection<THREE.Object3D> | undefined) =>
        hit && (!surfaceHit || hit.distance < surfaceHit.distance)
          ? hit.object.userData as { hoverLabel?: string; kind?: string }
          : undefined;
      const marker = zoomLevelFor(camera.position.length()) === 'CITIES'
        ? visibleMarker(cityHit) ?? visibleMarker(regionHit)
        : visibleMarker(regionHit);
      const country = coordinate ? globeCountry(countries, coordinate.lat, coordinate.lng) : null;
      return { node, coordinate, marker, country };
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (pointerStart) { moved = true; return; }
      pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; moved = false;
      setHovered('');
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const pointerMove = (event: PointerEvent) => {
      if (pointerStart) {
        if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) moved = true;
        return;
      }
      const { node, marker, country } = hitAt(event);
      const label = node ? `${node.name} · ${node.ip}` : marker?.hoverLabel ?? country?.n ?? '';
      setHovered(label);
      renderer.domElement.style.cursor = label ? 'pointer' : 'grab';
    };
    const pointerUp = (event: PointerEvent) => {
      if (!pointerStart || event.pointerId !== pointerStart.id) return;
      const dragged = moved || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5;
      pointerStart = null;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (dragged) return;
      const { node, coordinate } = hitAt(event);
      if (node) latest.current.onSelectNode(node);
      else if (coordinate) {
        const country = globeCountry(countries, coordinate.lat, coordinate.lng);
        if (country) latest.current.onSelectCountry(countrySelection(country));
        else latest.current.onSelectNode(null);
      } else latest.current.onSelectNode(null);
    };
    const pointerCancel = () => { pointerStart = null; setHovered(''); };
    const pointerLeave = () => { setHovered(''); };
    const keyboard = (event: KeyboardEvent) => {
      const spherical = new THREE.Spherical().setFromVector3(camera.position);
      switch (event.key) {
        case 'ArrowLeft': spherical.theta -= 0.12; break;
        case 'ArrowRight': spherical.theta += 0.12; break;
        case 'ArrowUp': spherical.phi -= 0.12; break;
        case 'ArrowDown': spherical.phi += 0.12; break;
        case '+': case '=': spherical.radius *= 0.9; break;
        case '-': spherical.radius *= 1.1; break;
        default: return;
      }
      event.preventDefault();
      spherical.makeSafe();
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
      camera.position.setFromSpherical(spherical);
      controls.update();
    };
    let contextAvailable = true;
    const contextLost = (event: Event) => { event.preventDefault(); contextAvailable = false; setUnavailable(true); };
    const contextRestored = () => { contextAvailable = true; setUnavailable(false); };
    const canvas = renderer.domElement;
    let geographyDirection = new THREE.Vector3();
    let geographyTime = -Infinity;
    const refreshGeography = (time: number) => {
      const direction = camera.position.clone().normalize();
      if (time - geographyTime < 250 || direction.distanceTo(geographyDirection) < 0.06) return;
      geographyTime = time;
      geographyDirection.copy(direction);
      const updateMarkers = (group: THREE.Group, entries: { lat: number; lng: number; label: string }[], kind: 'region' | 'city', color: string) => {
        while (group.children.length > entries.length) {
          const stale = group.children.pop();
          if (stale) disposeGroup(stale as THREE.Group);
        }
        entries.forEach((entry, index) => {
          let marker = group.children[index] as THREE.Group | undefined;
          if (!marker) { marker = geoMarker(entry.lat, entry.lng, color, entry.label, kind); group.add(marker); }
          marker.position.copy(globePoint(entry.lat, entry.lng, 1.014));
          marker.children[1].userData.hoverLabel = entry.label;
        });
      };
      const localRegions = nearestGeography(regions, region => ({ lat: region.la, lng: region.lo }), camera.position, MAX_REGION_MARKERS);
      updateMarkers(regionMarkers, localRegions.map(region => ({ lat: region.la, lng: region.lo, label: `${region.name} · ${region.type}` })), 'region', '#d4d4d4');
      const localCities = nearestGeography(cities, city => ({ lat: city[2], lng: city[3] }), camera.position, MAX_CITY_MARKERS);
      updateMarkers(cityMarkers, localCities.map(([name, country, lat, lng]) => ({ lat, lng, label: `${name} · ${country}` })), 'city', '#f5f5f5');
      const scale = markerScaleForDistance(camera.position.length());
      scaleMarkerMeshes(regionMarkers, scale);
      scaleMarkerMeshes(cityMarkers, scale);
    };
    refreshGeography(performance.now());
    const applyZoomLevel = () => {
      const next = zoomLevelFor(camera.position.length());
      regionMarkers.visible = next !== 'WORLD';
      cityMarkers.visible = next === 'CITIES';
      const scale = markerScaleForDistance(camera.position.length());
      scaleMarkerMeshes(endpoints, scale);
      scaleMarkerMeshes(regionMarkers, scale);
      scaleMarkerMeshes(cityMarkers, scale);
      return next;
    };
    let lastZoomLevel: ZoomLevel = 'WORLD';
    const onControlsChange = () => {
      const next = applyZoomLevel();
      setHovered('');
      if (next && next !== lastZoomLevel) { lastZoomLevel = next; setZoomLevel(next); }
    };
    controls.addEventListener('change', onControlsChange);
    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', pointerCancel);
    canvas.addEventListener('pointerleave', pointerLeave);
    canvas.addEventListener('keydown', keyboard);
    canvas.addEventListener('webglcontextlost', contextLost);
    canvas.addEventListener('webglcontextrestored', contextRestored);
    runtimeRef.current = { endpoints, arcs, selection, camera, controls, regions: regionMarkers, cities: cityMarkers, setZoomLevel };
    lastZoomLevel = applyZoomLevel();
    setZoomLevel(lastZoomLevel);
    setReady(true);
    let frame = 0;
    let lastTime = performance.now();
    const animate = (time: number) => {
      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      controls.autoRotate = latest.current.isAutoRotate;
      controls.update(delta);
      refreshGeography(time);
      if (contextAvailable) renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerCancel);
      canvas.removeEventListener('pointerleave', pointerLeave);
      canvas.removeEventListener('keydown', keyboard);
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.removeEventListener('webglcontextrestored', contextRestored);
      controls.dispose();
      controls.removeEventListener('change', onControlsChange);
      [globe, endpoints, arcs, selection, regionMarkers, cityMarkers].forEach(disposeGroup);
      renderer.dispose();
      canvas.remove();
      runtimeRef.current = null;
    };
  }, []);
  /* eslint-enable react/set-state-in-effect */

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!ready || !runtime) return;
    disposeGroup(runtime.endpoints);
    for (const node of validNodes.slice(0, MAX_ENDPOINT_MARKERS)) {
      const marker = geoMarker(node.lat, node.lng, colorFor(node.color), `${node.name} · ${node.ip}`, 'city');
      marker.children.forEach(child => { child.userData.node = node; });
      runtime.endpoints.add(marker);
    }
    scaleMarkerMeshes(runtime.endpoints, markerScaleForDistance(runtime.camera.position.length()));
  }, [ready, validNodes]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!ready || !runtime) return;
    disposeGroup(runtime.arcs);
    if (!validCoordinate(hub)) return;
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.022), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    marker.position.copy(globePoint(hub.lat, hub.lng, 1.016));
    runtime.arcs.add(marker);
    const seen = new Set<string>();
    for (const node of activeFlows) {
      if (!validCoordinate(node) || node.activeFlowsCount <= 0 || !Number.isFinite(node.activeFlowsCount)) continue;
      const key = `${node.lat}:${node.lng}`;
      if (seen.has(key)) continue;
      if (seen.size >= MAX_FLOW_ARCS) break;
      seen.add(key);
      const points = hubArc(hub, node);
      if (!points.length) continue;
      runtime.arcs.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: colorFor(node.color), transparent: true, opacity: 0.55 })));
    }
  }, [ready, hub, activeFlows]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!ready || !runtime) return;
    disposeGroup(runtime.selection);
    if (selectedNode && validCoordinate(selectedNode)) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.023, 0.03, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
      ring.position.copy(globePoint(selectedNode.lat, selectedNode.lng, 1.03));
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ring.position.clone().normalize());
      runtime.selection.add(ring);
    }
    if (selectedCountry) {
      const country = countries.find(item => item.iso === selectedCountry.iso);
      country?.polys.forEach(poly => poly.forEach(ring => {
        const points = ring.map(([lng, lat]) => globePoint(lat, lng, 1.004));
         runtime.selection.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#ffffff' })));
      }));
    }
  }, [ready, selectedNode, selectedCountry]);

  const selectedLat = selectedNode?.lat;
  const selectedLng = selectedNode?.lng;
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (selectedLat === undefined || selectedLng === undefined) return;
    const point = { lat: selectedLat, lng: selectedLng };
    if (!ready || !runtime || !validCoordinate(point)) return;
    runtime.camera.position.copy(globePoint(point.lat, point.lng, runtime.camera.position.length()));
    runtime.controls.update();
  }, [ready, selectedLat, selectedLng]);

  const status = captureStatus === 'RUNNING' || captureStatus === 'LIVE' ? 'LIVE' : captureStatus || 'UNAVAILABLE';
  const selectClass = 'min-w-0 max-w-44 rounded border border-[#525252] bg-[#111111] px-2 py-1 text-[10px] text-neutral-200 outline-none focus:border-[#d4d4d4]';
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050505] font-mono" style={{ backgroundImage: 'radial-gradient(ellipse at center, #29292940 0%, #050505 72%)' }}>
      <div ref={hostRef} className="absolute inset-0" style={{ visibility: unavailable ? 'hidden' : 'visible' }} />
      <div className="pointer-events-none absolute left-4 top-4 text-[10px] leading-5 text-neutral-400">
        <div className="tracking-[0.22em] text-white">GEOINT / EARTH</div>
        <div>{validNodes.length} GEOLOCATED ENDPOINTS</div>
        <div>{validCoordinate(hub) ? 'CAPTURE HUB LOCATED' : 'HUB LOCATION UNAVAILABLE'}</div>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded border border-[#525252] bg-black/70 px-2 py-1 text-[10px] tracking-[0.18em] text-white" aria-label={`Zoom level ${zoomLevel}`}>
        {zoomLevel} <span className="ml-2 tracking-normal text-neutral-500">● boundaries · {zoomLevel === 'WORLD' ? 'zoom for regions' : zoomLevel === 'REGIONS' ? 'city points at closer zoom' : 'bundled city/region data'}</span>
      </div>
      <div className="pointer-events-none absolute right-4 top-4 text-right text-[10px] leading-5 text-neutral-400" aria-label="Capture telemetry">
        <div className="text-white">{status}</div>
        <div>{metric(captureMetrics.packets_per_sec, 1)} pkt/s</div>
        <div>{metric(captureMetrics.bytes_per_sec, 0)} B/s</div>
        <div>{metric(captureMetrics.packets_captured)} pkts · {metric(captureMetrics.bytes_captured)} B</div>
      </div>
      {unavailable && <div className="absolute inset-x-6 top-1/3 text-center text-xs text-white" role="status">
        <p className="mb-2 tracking-widest">3D VIEW UNAVAILABLE</p>
        <p className="text-neutral-400">WebGL is unavailable or its context was lost. Use the menus below to inspect endpoints and countries.</p>
      </div>}
      {hovered && !unavailable && <div className="pointer-events-none absolute bottom-24 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded border border-[#737373] bg-[#111111]/95 px-3 py-2 text-[11px] text-white">{hovered}</div>}
      <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-[9px] tracking-widest text-neutral-500">ENDPOINT
            <select aria-label="Select endpoint" className={selectClass} value={selectedNode?.id ?? ''} onChange={event => props.onSelectNode(validNodes.find(node => node.id === event.target.value) ?? null)}>
              <option value="">{validNodes.length ? 'Select endpoint' : 'No geolocated endpoints'}</option>
              {validNodes.map(node => <option key={node.id} value={node.id}>{node.name} · {node.ip}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[9px] tracking-widest text-neutral-500">COUNTRY
            <select aria-label="Select country" className={selectClass} value={selectedCountry?.iso ?? ''} onChange={event => {
              const country = countries.find(item => item.iso === event.target.value);
              props.onSelectCountry(country ? countrySelection(country) : null);
            }}>
              <option value="">Select country</option>
              {sortedCountries.map(country => <option key={country.iso} value={country.iso}>{country.n}</option>)}
            </select>
          </label>
        </div>
        <div className="pointer-events-none text-right text-[9px] leading-4 tracking-wider text-neutral-500">
          <div>{isAutoRotate ? 'ROTATION ACTIVE' : 'ROTATION PAUSED'}</div>
          <div>DRAG TO ORBIT · SCROLL TO ZOOM</div>
          <div>NATURAL EARTH · GEOGRAPHIC BOUNDARIES</div>
        </div>
      </div>
    </div>
  );
};
