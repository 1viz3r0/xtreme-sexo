import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { GlobalIntelView } from './GlobalIntelView';
import { captureIsRunning } from '../lib/captureBuddyPresentation';

const overviewSource = readFileSync(new URL('./GlobalIntelView.tsx', import.meta.url), 'utf8');
const globalIntelService = readFileSync(new URL('../services/tauri/globalIntel.ts', import.meta.url), 'utf8');
const intelService = readFileSync(new URL('../services/tauri/intel.ts', import.meta.url), 'utf8');

test('overview distinguishes native availability, empty local snapshots, and real refresh errors', () => {
  assert.match(overviewSource, /BROWSER MODE · LOCAL TELEMETRY UNAVAILABLE/);
  assert.match(overviewSource, /LOADING NATIVE SNAPSHOT/);
  assert.match(overviewSource, /No geolocated contacts in this session/);
  assert.match(overviewSource, /Native endpoint telemetry unavailable/);
  assert.match(overviewSource, /No recorded alerts — capture is not running or unavailable/);
  assert.match(overviewSource, /Last endpoint snapshot is stale/);
  assert.match(overviewSource, /Snapshot stale/);
  assert.match(overviewSource, /Observed geography/);
  assert.match(overviewSource, /CAPTURE CONTROL/);
  assert.doesNotMatch(overviewSource, /CURRENT-SESSION FLOWS/);
  // Explicit on-demand geography: the resolve action drives the registered
  // enrichment command; snapshots stay local-only and never auto-enrich.
  assert.match(overviewSource, /Resolve locations/);
  assert.match(overviewSource, /refreshWatchtowerEnrichment/);
  assert.match(overviewSource, /No public endpoints observed yet — start capture to observe traffic/);
  assert.match(overviewSource, /Location resolution failed/);
  // Local devices appear from the real devices cache and are clearly marked.
  assert.match(overviewSource, /local network/);
  // Both Overview commands carry the persisted session token; the backend
  // validates the admin role against the auth store before answering.
  assert.match(globalIntelService, /netoze_token/);
  assert.match(intelService, /refresh_watchtower_enrichment', \{ token/);
});

test('overview treats both active capture status contracts as running', () => {
  assert.equal(captureIsRunning('RUNNING'), true);
  assert.equal(captureIsRunning('LIVE'), true);
  assert.equal(captureIsRunning('STOPPED'), false);
  assert.equal(captureIsRunning('UNAVAILABLE'), false);
});

test('overview resolves observed endpoint locations on demand with honest outcomes', async (context) => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'React', 'IS_REACT_ACT_ENVIRONMENT', 'localStorage'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'React' ? React : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name],
  });
  let reads = 0;
  let enrichCalls = 0;
  let enrichResponse: unknown = {
    requested_ips: 1,
    attempted_ips: 1,
    geoip: [{ ip: '8.8.8.8', country: 'United States', country_code: 'US', city: 'Mountain View', latitude: 37.386, longitude: -122.0838, asn: 15169, org: 'GOOGLE', source: 'ipwho.is', resolved_at: 1, stale: false }],
    sources: [],
    errors: [],
  };
  const fixtureSnapshot = () => ({
    collected_at: '2026-11-13T00:00:00Z', scope: 'Synthetic test fixture only',
    capture: { status: 'STOPPED', selected_interface: '', packets_captured: 0, bytes_captured: 0, packets_per_sec: 0, bytes_per_sec: 0, dropped_packets: 0, duration_secs: 0 },
    capture_availability: { state: 'AVAILABLE', detail: 'fixture' }, flows: [], flow_summary: null,
    detections: [], detection_summary: null, connectivity: null, threat_intel: null,
    geoip: [], threat_matches: [], devices: [], storage: null, enrichment: null,
  });
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string) => {
    if (command === 'get_global_intel_snapshot') { reads++; return fixtureSnapshot(); }
    if (command === 'get_pcap_interfaces') return [];
    if (command === 'refresh_watchtower_enrichment') {
      enrichCalls++;
      if (enrichResponse instanceof Error) throw enrichResponse;
      return enrichResponse;
    }
    throw new Error(`Unexpected command: ${command}`);
  } } });
  const { createRoot } = await import('react-dom/client');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const originalError = console.error;
  const silence = context.mock.method(console, 'error', (...args: unknown[]) => {
    if (!String(args[0]).startsWith('THREE.WebGLRenderer:')) originalError(...args);
  });
  try {
    await act(async () => { root.render(React.createElement(GlobalIntelView, { selectedNode: null, setSelectedNode: () => {}, setActiveTab: () => {} })); });
    silence.mock.restore();
    assert.equal(reads, 1);
    assert.match(host.textContent ?? '', /No observed endpoints with coordinates in this session\. “Resolve locations” looks up observed public endpoints on demand\./);
    const resolve = host.querySelector('button[aria-label="Resolve endpoint locations"]') as HTMLButtonElement | null;
    assert.ok(resolve, 'the resolve action must render for desktop users');
    await act(async () => { resolve!.click(); });
    assert.equal(enrichCalls, 1, 'resolving must invoke the registered enrichment command');
    assert.match(host.textContent ?? '', /Resolved locations for 1 of 1 observed public endpoint\(s\)\./);
    assert.equal(reads, 2, 'a completed resolution must immediately refresh the snapshot');
    enrichResponse = { requested_ips: 0, attempted_ips: 0, geoip: [], sources: [], errors: [] };
    await act(async () => { (host.querySelector('button[aria-label="Resolve endpoint locations"]') as HTMLButtonElement).click(); });
    assert.match(host.textContent ?? '', /No public endpoints observed yet — start capture to observe traffic, then resolve again\./);
    enrichResponse = new Error('Synthetic provider unreachable');
    await act(async () => { (host.querySelector('button[aria-label="Resolve endpoint locations"]') as HTMLButtonElement).click(); });
    assert.match(host.textContent ?? '', /Location resolution failed: Synthetic provider unreachable/);
  } finally {
    await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('overview resumes passive polling when visible and exposes location search', async (context) => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'React', 'IS_REACT_ACT_ENVIRONMENT', 'localStorage'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'React' ? React : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name],
  });
  let reads = 0;
  let allowSnapshot = false;
  let captureState = 'STOPPING';
  let stops = 0;
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string) => {
    if (command === 'get_global_intel_snapshot') {
      reads++;
      if (allowSnapshot) return {
        collected_at: '2026-10-24T00:00:00Z', scope: 'Synthetic test fixture only',
        capture: { status: captureState, selected_interface: 'synthetic', packets_captured: 0, bytes_captured: 0, packets_per_sec: 0, bytes_per_sec: 0, dropped_packets: 0, duration_secs: 0 },
        capture_availability: { state: 'AVAILABLE', detail: 'fixture' }, flows: [], flow_summary: null,
        detections: [], detection_summary: null, connectivity: null, threat_intel: null,
        geoip: [], threat_matches: [], devices: [], storage: null, enrichment: null,
      };
      throw new Error('Synthetic snapshot unavailable');
    }
    if (command === 'get_pcap_interfaces') return [{ id: 'synthetic', name: 'Synthetic fixture', ipv4_addresses: [], ipv6_addresses: [], mac_address: '', is_loopback: false }];
    if (command === 'get_detailed_network_interfaces') return [];
    if (command === 'get_detailed_system_info') return null;
    if (command === 'stop_packet_capture') { stops++; return; }
    throw new Error(`Unexpected command: ${command}`);
  } } });
  const { createRoot } = await import('react-dom/client');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const originalError = console.error;
  let webglErrors = 0;
  const renderingError = context.mock.method(console, 'error', (...args: unknown[]) => {
    if (!String(args[0]).startsWith('THREE.WebGLRenderer:')) { originalError(...args); return; }
    assert.match(args.join(' '), /THREE\.WebGLRenderer: .*Error creating WebGL context/);
    webglErrors++;
  });
  context.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await act(async () => { root.render(React.createElement(GlobalIntelView, { selectedNode: null, setSelectedNode: () => {}, setActiveTab: () => {} })); });
    assert.equal(webglErrors, 1);
    renderingError.mock.restore();
    assert.match(host.textContent ?? '', /WebGL is unavailable or its context was lost/);
    assert.equal(reads, 1);
    Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => { context.mock.timers.tick(3000); });
    assert.equal(reads, 1, 'hidden pages must not poll');
    Object.defineProperty(window.document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => { window.document.dispatchEvent(new window.Event('visibilitychange')); });
    assert.equal(reads, 2, 'returning to the page must restart the stopped polling loop');
    await act(async () => { context.mock.timers.tick(3000); });
    assert.equal(reads, 3, 'polling must continue after visibility resumes');
    const search = host.querySelector('[aria-label="Search locations"]');
    assert.ok(search);
    await act(async () => { (search as unknown as HTMLButtonElement).click(); });
    assert.ok(host.querySelector('input[placeholder="Search countries, states/provinces, cities…"]'), 'location search must expose its query input');
    await act(async () => { window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(host.querySelector('input[placeholder="Search countries, states/provinces, cities…"]'), null);
    allowSnapshot = true;
    await act(async () => { context.mock.timers.tick(3000); });
    const captureButton = () => [...host.querySelectorAll('button')].find(button => ['STOPPING…', 'START', 'STOP'].includes(button.textContent ?? ''))!;
    assert.equal(captureButton().textContent, 'STOPPING…');
    assert.equal(captureButton().disabled, true, 'restart must wait for final persistence');
    assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Capture interface"]')!.disabled, true);
    captureState = 'RUNNING';
    await act(async () => { context.mock.timers.tick(3000); });
    allowSnapshot = false;
    await act(async () => { context.mock.timers.tick(3000); });
    assert.equal(captureButton().textContent, 'STOP', 'a stale snapshot must not hide stop for the last known running capture');
    await act(async () => { captureButton().click(); });
    assert.equal(stops, 1);
  } finally {
    await act(async () => { root.unmount(); });
    context.mock.timers.reset();
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
