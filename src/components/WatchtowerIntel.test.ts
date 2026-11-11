import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { IntelPacketRow, IpIntelNote, IpIntelRecord, IpIntelSources } from '../services/tauri/ipIntel';
import type { WatchtowerIntelProps } from './WatchtowerIntel';

const record: IpIntelRecord = {
  ip: '192.168.7.10',
  mac: 'aa:bb:cc:dd:ee:ff',
  hostname: 'printer',
  vendor: 'Raspberry Pi Trading Ltd',
  os_guess: 'Linux (Raspberry Pi vendor OUI)',
  os_confidence: 'inferred · medium confidence',
  os_basis: 'vendor OUI "Raspberry Pi Trading Ltd"',
  interface: 'wlan0',
  first_seen: Date.now() - 100_000,
  last_seen: Date.now() - 5_000,
  packet_count: 12,
  byte_count: 900,
  flow_count: 3,
  last_activity_at: Date.now() - 5_000,
  source: 'kernel-neighbors',
  origin: 'observed',
  label: 'Office printer',
  excluded: false,
  scan_enabled: false,
  scan_authorized_at: null,
  open_ports: '[22,80]',
  last_scan_at: null,
  scan_failures: 0,
  last_scan_state: null,
  updated_at: Date.now(),
};

const investigationBase = {
  record,
  geoip: null,
  geoip_note: 'Local/private address — public geolocation does not apply.',
  dns_records: [],
  port_scan: [],
  scan_history: [],
  notes: [] as IpIntelNote[],
  scan_eligible: false,
};

function fakeSources(overrides: Partial<IpIntelSources> = {}): IpIntelSources {
  const calls = { startCapture: [] as Array<Record<string, unknown>>, scanIpNow: [] as Array<[string, boolean]>, saveNote: [] as Array<[number | null, string | null, string]> };
  const sources: IpIntelSources = {
    listIps: async () => [record],
    saveIp: async () => record,
    removeIp: async () => undefined,
    setIpFlags: async () => record,
    getScanConfig: async () => ({ enabled: false, interval_seconds: 900, intensity: 'light', max_runs_per_cycle: 4 }),
    setScanConfig: async (config) => ({ enabled: config.enabled, interval_seconds: config.intervalSeconds, intensity: config.intensity, max_runs_per_cycle: config.maxRunsPerCycle }),
    getScanStatus: async () => ({
      running: false, current_ip: null, last_job_id: null, last_job_state: null, next_due_at: null, due_count: 0,
      config: { enabled: false, interval_seconds: 900, intensity: 'light', max_runs_per_cycle: 4 },
    }),
    scanIpNow: async (ip, force) => {
      calls.scanIpNow.push([ip, Boolean(force)]);
      return { ip, trigger: 'manual', started_at: Date.now(), state: 'completed', open_ports: [22], probe_count: 5, error: null };
    },
    investigateIp: async () => investigationBase,
    listNotes: async () => [],
    saveNote: async (id, ip, body) => {
      calls.saveNote.push([id, ip, body]);
      return { id: id ?? 99, ip, body, created_at: Date.now(), updated_at: Date.now() };
    },
    deleteNote: async () => undefined,
    listCaptureInterfaces: async () => ['wlan0'],
    startCapture: async (options) => {
      calls.startCapture.push(options as unknown as Record<string, unknown>);
      return { session_id: 'session-1', path: '/tmp/capture', running: true, bytes: 0 };
    },
    stopCapture: async () => undefined,
    closeCapture: async () => undefined,
    listCapturePackets: async () => ({ packets: [
      { number: 1, time: '0.000001', source: '192.168.7.10', destination: '192.168.7.1', protocol: 'TCP', length: '60', info: 'SYN' },
      { number: 2, time: '0.000002', source: '10.9.9.9', destination: '10.9.9.10', protocol: 'UDP', length: '90', info: 'noise' },
    ] as IntelPacketRow[], has_more: false }),
    exportCapture: async () => ({ path: '/tmp/out.pcap', bytes: 128 }),
    ...overrides,
  };
  return Object.assign(sources, { calls });
}

async function render(props: WatchtowerIntelProps) {
  const window = new Window({ url: 'http://localhost/' });
  const previous = new Map(['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']
    .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of previous.keys()) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name] });
  const { createRoot } = await import('react-dom/client');
  const { WatchtowerIntel } = await import('./WatchtowerIntel');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  await act(async () => { root.render(React.createElement(WatchtowerIntel, props)); });
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

function button(host: Element, text: string): HTMLButtonElement {
  const buttons = [...host.querySelectorAll('button')];
  const match = buttons.find((candidate) => (candidate.textContent ?? '').trim() === text);
  assert.ok(match, `button "${text}" not found; have: ${buttons.map(b => (b.textContent ?? '').trim()).join(' | ')}`);
  return match as HTMLButtonElement;
}

test('WatchtowerIntel renders the persistent inventory from injected sources', async () => {
  const sources = fakeSources();
  const rendered = await render({ sources });
  try {
    const text = rendered.host.textContent ?? '';
    assert.match(text, /IP intelligence workspace/);
    assert.match(text, /192\.168\.7\.10/);
    assert.match(text, /Office printer/);
    assert.match(text, /Raspberry Pi Trading Ltd/);
    assert.match(text, /Inferred · medium: Linux \(Raspberry Pi vendor OUI\)/);
    assert.match(text, /22, 80/);
    assert.match(text, /Passive/);
    // Honest empty state for auto-scan: disabled by default.
    assert.match(text, /Nothing scheduled · 0 addresses due/);
    assert.match(text, /Off by default/);
  } finally { await cleanup(rendered); }
});

test('manual Scan now calls the authorized scan command and reports the outcome', async () => {
  const sources = fakeSources();
  const rendered = await render({ sources });
  try {
    await act(async () => { button(rendered.host, 'Scan now').click(); });
    const calls = (sources as unknown as { calls: { scanIpNow: Array<[string, boolean]> } }).calls;
    assert.deepEqual(calls.scanIpNow, [['192.168.7.10', true]]);
    assert.match(rendered.host.textContent ?? '', /Scan completed \(5 probes\)\./);
    assert.match(rendered.host.textContent ?? '', /Open ports: 22/);
  } finally { await cleanup(rendered); }
});

test('investigation panel loads and starts a host-scoped capture via the buddy engine', async () => {
  const sources = fakeSources();
  const rendered = await render({ sources });
  try {
    await act(async () => { button(rendered.host, 'Investigate').click(); });
    assert.match(rendered.host.textContent ?? '', /Identity · detected/);
    assert.match(rendered.host.textContent ?? '', /host 192\.168\.7\.10/);
    assert.match(rendered.host.textContent ?? '', /unrelated traffic is not captured/);
    await act(async () => { button(rendered.host, 'Start capture').click(); });
    const calls = (sources as unknown as { calls: { startCapture: Array<Record<string, unknown>> } }).calls;
    assert.equal(calls.startCapture.length, 1);
    assert.equal(calls.startCapture[0].captureFilter, 'host 192.168.7.10', 'capture must be BPF-restricted to the selected IP');
    assert.equal(calls.startCapture[0].interface, 'wlan0');
    assert.equal(calls.startCapture[0].promiscuous, false);
  } finally { await cleanup(rendered); }
});

test('packet table applies src/dst filters and excludes unrelated traffic', async () => {
  const sources = fakeSources();
  const rendered = await render({ sources });
  try {
    await act(async () => { button(rendered.host, 'Investigate').click(); });
    await act(async () => { button(rendered.host, 'Start capture').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 2_100)); });
    let text = rendered.host.textContent ?? '';
    // 'both' shows only the host's own traffic; the unrelated 10.9.9.9 flow
    // is excluded even though the engine page contains it.
    assert.match(text, /1 packets · 60 bytes/);
    await act(async () => { button(rendered.host, 'Src only').click(); });
    text = rendered.host.textContent ?? '';
    assert.match(text, /1 packets · 60 bytes/);
    await act(async () => { button(rendered.host, 'Dst only').click(); });
    text = rendered.host.textContent ?? '';
    // Dst-only view: the host was the source of the only captured packet.
    assert.match(text, /0 packets · 0 bytes/);
  } finally { await cleanup(rendered); }
});

test('notes autosave through the debounced save command', async () => {
  let saved: Array<[number | null, string | null, string]> = [];
  const sources = fakeSources({
    listNotes: async (ip) => (ip === null ? [{ id: 5, ip: null, body: 'existing general note', created_at: 1, updated_at: 2 }] : []),
  });
  const rendered = await render({ sources });
  try {
    const textarea = rendered.host.querySelector('textarea[aria-label="New note text"]') as HTMLTextAreaElement;
    assert.ok(textarea, 'general note editor textarea missing');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(textarea, 'General investigation note');
      textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); });
    saved = (sources as unknown as { calls: { saveNote: Array<[number | null, string | null, string]> } }).calls.saveNote;
    assert.equal(saved.length, 1, 'autosave must call saveNote once after the debounce');
    assert.deepEqual(saved[0], [null, null, 'General investigation note']);
  } finally { await cleanup(rendered); }
});

test('enable auto-scan records explicit per-IP authorization through set flags', async () => {
  const setFlags: Array<[string, boolean | null, boolean | null]> = [];
  const sources = fakeSources({
    setIpFlags: async (ip, excluded, scanEnabled) => {
      setFlags.push([ip, excluded ?? null, scanEnabled ?? null]);
      return record;
    },
  });
  const rendered = await render({ sources });
  try {
    await act(async () => { button(rendered.host, 'Enable auto').click(); });
    assert.deepEqual(setFlags, [['192.168.7.10', null, true]]);
    assert.match(rendered.host.textContent ?? '', /Auto-scan authorized for 192\.168\.7\.10\./);
  } finally { await cleanup(rendered); }
});
