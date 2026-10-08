import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { FlowRecord } from '../services/tauri/flows';
import type { DetectionFinding } from '../services/tauri/detections';
import type { AttackGraph } from '../services/tauri/graph';
import type { DeviceEntry } from '../services/tauri/intel';
import type { DetailedAdapterInfo } from '../services/tauri/network';
import type { WatchtowerDataSources } from './Watchtower';

const flow = { flow_id: 'flow-1' } as FlowRecord;
const finding = (id: string, timestamp: number): DetectionFinding => ({
  finding_id: id, rule_id: 'rule-1', rule_version: '1', timestamp, first_seen: timestamp, last_seen: timestamp,
  source_ip: '192.0.2.1', destination_ip: '198.51.100.2', source_port: 1234, destination_port: 443,
  protocol: 'TCP', flow_id: 'flow-1', ja4: '', category: 'test', severity: 'low', confidence: 0.5,
  title: id, description: '', evidence: '', status: 'active', occurrence_count: 1,
});
const graph = { nodes: [{ node_id: 'node-1' }], edges: [{ edge_id: 'edge-1' }] } as AttackGraph;

async function render(props: { flows: FlowRecord[]; events: DetectionFinding[]; graph: AttackGraph; inventorySources?: WatchtowerDataSources }) {
  const window = new Window({ url: 'http://localhost/' });
  const previous = new Map(['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']
    .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of previous.keys()) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name] });
  const { createRoot } = await import('react-dom/client');
  const { Watchtower } = await import('./Watchtower');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  await act(async () => { root.render(React.createElement(Watchtower, props)); });
  return { host, root, window, previous };
}

async function cleanup(rendered: Awaited<ReturnType<typeof render>>) {
  await act(async () => { rendered.root.unmount(); });
  await rendered.window.happyDOM.close();
  for (const [name, descriptor] of rendered.previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}

test('Watchtower derives metrics and bounds recent signals', async () => {
  const rendered = await render({ flows: [flow], events: Array.from({ length: 6 }, (_, index) => finding(`Finding ${index}`, index + 1)), graph });
  try {
    assert.match(rendered.host.textContent ?? '', /Watchtower/);
    assert.match(rendered.host.textContent ?? '', /Source visibility/);
    assert.match(rendered.host.textContent ?? '', /3\/5/);
    assert.match(rendered.host.textContent ?? '', /Active flows1/);
    assert.match(rendered.host.textContent ?? '', /Observed findings6/);
    assert.match(rendered.host.textContent ?? '', /Graph nodes1/);
    assert.match(rendered.host.textContent ?? '', /Graph edges1/);
    assert.match(rendered.host.textContent ?? '', /Snapshot only/);
    assert.match(rendered.host.textContent ?? '', /Recent signals/);
    assert.equal(rendered.host.querySelectorAll('[aria-label="Recent detection findings"] li').length, 5);
    assert.match(rendered.host.textContent ?? '', /Finding 5/);
    assert.doesNotMatch(rendered.host.textContent ?? '', /Finding 0/);
  } finally { await cleanup(rendered); }
});

test('Watchtower presents explicit empty state and truth boundary', async () => {
  const rendered = await render({ flows: [], events: [], graph: { nodes: [], edges: [] } });
  try {
    assert.match(rendered.host.textContent ?? '', /Sources with records0\/5/);
    assert.match(rendered.host.textContent ?? '', /No findings are currently loaded/);
    assert.match(rendered.host.textContent ?? '', /Only data currently loaded by NET0ZE is shown/);
    assert.match(rendered.host.textContent ?? '', /No scan or upload occurs here/);
    assert.match(rendered.host.textContent ?? '', /not a threat verdict/);
    assert.match(rendered.host.textContent ?? '', /Interfaces unavailable in browser/);
    assert.match(rendered.host.textContent ?? '', /Neighbors unavailable in browser/);
  } finally { await cleanup(rendered); }
});

test('local inventory is read once on mount and renders host addresses and existing devices', async () => {
  let interfaceCalls = 0;
  let deviceCalls = 0;
  const adapter = { name: 'en0', friendly_name: 'Wi-Fi', description: '', mac_address: 'aa:bb:cc:dd:ee:ff', ipv4_addresses: ['192.168.1.20'], ipv6_addresses: ['fe80::20'], oper_status: 'Up', interface_type: 'Ethernet', rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0 } as DetailedAdapterInfo;
  const device: DeviceEntry = { ip: '192.168.1.1', mac: '00:11:22:33:44:55', hostname: 'router', vendor: 'Example', interface: 'en0', first_seen: 1, last_seen: 2, active: true, is_self: false };
  const sources: WatchtowerDataSources = {
    getDetailedNetworkInterfaces: async () => { interfaceCalls += 1; return [adapter]; },
    refreshDevices: async () => [],
    getDevices: async () => { deviceCalls += 1; return [device]; },
  };
  const rendered = await render({ flows: [], events: [], graph: { nodes: [], edges: [] }, inventorySources: sources });
  try {
    assert.equal(interfaceCalls, 1);
    assert.equal(deviceCalls, 1);
    assert.match(rendered.host.textContent ?? '', /192\.168\.1\.20/);
    assert.match(rendered.host.textContent ?? '', /fe80::20/);
    assert.match(rendered.host.textContent ?? '', /aa:bb:cc:dd:ee:ff/);
    assert.match(rendered.host.textContent ?? '', /192\.168\.1\.1/);
    assert.match(rendered.host.textContent ?? '', /router/);
    assert.match(rendered.host.textContent ?? '', /Example/);
  } finally { await cleanup(rendered); }
});

test('inventory is automatic, contributes to coverage, and refreshes when visible', async () => {
  let resolveInterfaces!: (value: DetailedAdapterInfo[]) => void;
  let resolveDevices!: (value: DeviceEntry[]) => void;
  let refreshCalls = 0;
  const adapter = { name: 'en0', friendly_name: 'Wi-Fi', description: '', mac_address: 'aa', ipv4_addresses: ['192.0.2.10'], ipv6_addresses: [], oper_status: 'Up', interface_type: 'Ethernet', rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0 } as DetailedAdapterInfo;
  const device = { ip: '192.0.2.1', mac: 'bb', hostname: 'router', vendor: 'Example', interface: 'en0', first_seen: 1, last_seen: 2, active: true, is_self: false } as DeviceEntry;
  const sources: WatchtowerDataSources = {
    getDetailedNetworkInterfaces: () => new Promise((resolve) => { resolveInterfaces = resolve; }),
    getDevices: () => new Promise((resolve) => { resolveDevices = resolve; }),
     refreshDevices: async () => { refreshCalls += 1; return []; },
  };
  const rendered = await render({ flows: [], events: [], graph: { nodes: [], edges: [] }, inventorySources: sources });
  try {
     assert.match(rendered.host.textContent ?? '', /Sources with records0\/5/);
     await act(async () => { resolveInterfaces([adapter]); resolveDevices([device]); await Promise.resolve(); });
     assert.match(rendered.host.textContent ?? '', /Sources with records2\/5/);
     await act(async () => { rendered.window.document.dispatchEvent(new rendered.window.Event('visibilitychange')); });
     assert.equal(refreshCalls, 1);
     assert.doesNotMatch(rendered.host.textContent ?? '', /192\.168\.1\.1/);
  } finally { await cleanup(rendered); }
});

test('mount inventory errors are explicit and distinguish unavailable data', async () => {
  const sources: WatchtowerDataSources = {
    getDetailedNetworkInterfaces: async () => { throw new Error('interfaces unavailable'); },
    getDevices: async () => { throw new Error('devices unavailable'); },
    refreshDevices: async () => [],
  };
  const rendered = await render({ flows: [], events: [], graph: { nodes: [], edges: [] }, inventorySources: sources });
  try {
    assert.match(rendered.host.textContent ?? '', /interfaces unavailable/);
    assert.match(rendered.host.textContent ?? '', /Interface inventory unavailable/);
    assert.match(rendered.host.textContent ?? '', /devices unavailable/);
    assert.match(rendered.host.textContent ?? '', /Neighbor inventory unavailable/);
  } finally { await cleanup(rendered); }
});

test('late mount inventory results do not update after unmount', async () => {
  let resolveInterfaces!: (value: DetailedAdapterInfo[]) => void;
  let resolveDevices!: (value: DeviceEntry[]) => void;
  const sources: WatchtowerDataSources = {
    getDetailedNetworkInterfaces: () => new Promise((resolve) => { resolveInterfaces = resolve; }),
    getDevices: () => new Promise((resolve) => { resolveDevices = resolve; }),
    refreshDevices: async () => [],
  };
  const rendered = await render({ flows: [], events: [], graph: { nodes: [], edges: [] }, inventorySources: sources });
  await cleanup(rendered);
  resolveInterfaces([]);
  resolveDevices([]);
  await Promise.resolve();
});

test('neighbor refresh renders records and handles empty/error states', async () => {
  const device: DeviceEntry = { ip: '192.168.1.1', mac: '00:11:22:33:44:55', hostname: 'router', vendor: 'Example', interface: 'en0', first_seen: 1, last_seen: 2, active: true, is_self: false };
  let shouldFail = false;
  const sources: WatchtowerDataSources = {
    getDetailedNetworkInterfaces: async () => [],
     refreshDevices: async () => { if (shouldFail) throw new Error('neighbor failure'); return [device]; },
     getDevices: async () => [device],
  };
  const rendered = await render({ flows: [], events: [], graph: { nodes: [], edges: [] }, inventorySources: sources });
  try {
    assert.match(rendered.host.textContent ?? '', /192\.168\.1\.1/);
    assert.match(rendered.host.textContent ?? '', /00:11:22:33:44:55/);
    const button = Array.from(rendered.host.querySelectorAll('button')).find((item) => item.textContent?.includes('Refresh local neighbors')) as HTMLButtonElement;
    await act(async () => { button.click(); });
    assert.match(rendered.host.textContent ?? '', /router/);
    assert.match(rendered.host.textContent ?? '', /Example/);
    assert.match(rendered.host.textContent ?? '', /Yes/);
    shouldFail = true;
    await act(async () => { button.click(); });
    assert.match(rendered.host.textContent ?? '', /neighbor failure/);
  } finally { await cleanup(rendered); }
});
