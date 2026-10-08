import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { Window } from 'happy-dom';

test('top investigation links load off-page packet evidence and reject stale detail', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? window : (window as unknown as Record<string, unknown>)[name] });
  const calls: { command: string; args: any }[] = [];
  let sessions = 0;
  let resolveOldDetail: ((value: { dissection: string }) => void) | undefined;
  const fixtureSession = () => ({ session_id: `fixture-${sessions}`, path: '/synthetic/fixture.pcapng', running: false, bytes: 128 });
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string, args: any) => {
    calls.push({ command, args });
    if (command === 'buddy_engine_status') return { available: true, detail: 'Synthetic test engine', live_capture_blocked: false, capture_guidance: null };
    if (command === 'buddy_interfaces') return ['1. synthetic'];
    if (command === 'buddy_start') { sessions++; return fixtureSession(); }
    if (command === 'buddy_session_status') return fixtureSession();
    if (command === 'buddy_search_packets') return { packets: [{ number: 1, time: '0', source: '192.0.2.1', destination: '192.0.2.2', protocol: 'TCP', length: '64', info: 'Synthetic page packet' }], has_more: false };
    if (command === 'buddy_investigation_model') return {
      conversations: [], anomalies: [], generated_from_packets: 43, limitations: ['Synthetic fixture only'],
      timeline: [42, 43].map(packet_number => ({ packet_number, time: 1, kind: 'fixture', summary: `Evidence ${packet_number}`, severity: 'info' })),
    };
    if (command === 'buddy_packet_detail') {
      if (args.number === 43) return new Promise<{ dissection: string }>(resolve => { resolveOldDetail = resolve; });
      return { dissection: 'Decoded evidence for packet 42\n0000  2a 00  synthetic bytes' };
    }
    if (command === 'buddy_close') return;
    throw new Error(`Unexpected command: ${command}`);
  } } });
  const { createRoot } = await import('react-dom/client');
  const { CaptureBuddy } = await import('./CaptureBuddy');
  const host = window.document.createElement('div'); window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const button = (label: string) => {
    const found = [...host.querySelectorAll('button')].find(element => element.textContent === label);
    assert.ok(found, `Missing button ${label}: ${host.textContent}`);
    return found;
  };
  const click = async (label: string) => { await act(async () => { button(label).click(); }); };
  try {
    await act(async () => { root.render(React.createElement(CaptureBuddy)); });
    const header = host.querySelector('h1')!.closest('header')!;
    assert.equal(host.querySelector('h1')!.textContent, 'Capture workspace');
    assert.deepEqual([...header.querySelectorAll('nav a')].map(link => link.textContent), ['Capture', 'Investigate', 'Evidence']);
    for (const link of header.querySelectorAll('nav a')) assert.ok(host.querySelector(link.getAttribute('href')!));
    assert.equal(header.nextElementSibling?.getAttribute('aria-label'), 'Capture investigation workspace');
    const investigation = header.nextElementSibling!;
    assert.equal(investigation.nextElementSibling?.getAttribute('aria-label'), 'Recording source');
    assert.equal(investigation.querySelectorAll('[role="status"]').length, 1);
    assert.match(investigation.textContent, /Open or record a capture below/);
    assert.doesNotMatch(investigation.textContent, /Evidence, not verdict|Explore native metadata/);
    assert.deepEqual([...investigation.querySelectorAll('[aria-label="Investigation views"] span')].map(item => item.textContent), ['Conversations', 'Timeline', 'Review']);
    assert.equal(host.querySelector('table')!.parentElement!.className.includes('min-h-[240px]'), false);
    assert.equal(button('Generate model').disabled, true);
    assert.equal(host.querySelectorAll('[aria-label="Capture investigation workspace"]').length, 1);
    await click('Start recording');
    assert.match(host.querySelector('tbody')!.textContent, /Packet 1/);
    await click('Generate model');
    const sharing = [...host.querySelectorAll('details')].find(item => item.querySelector('summary')?.textContent === 'Evidence & sharing limits');
    assert.ok(sharing);
    assert.equal(sharing.open, false);
    assert.match(sharing.textContent, /bounded metadata only—not PCAP or hash proof/);
    await click('Timeline');
    await click('42');
    assert.deepEqual(calls.find(call => call.command === 'buddy_packet_detail')?.args, { sessionId: 'fixture-1', number: 42 });
    const inspector = host.querySelector('[aria-label="Packet evidence"]')!;
    assert.match(inspector.textContent, /Evidence · Packet 42/);
    assert.match(inspector.textContent, /Decoded evidence for packet 42/);
    assert.match(inspector.textContent, /0000  2a 00/);
    assert.equal(inspector.nextElementSibling?.tagName, 'DETAILS');
    assert.doesNotMatch(host.querySelector('tbody')!.textContent, /Packet 42/);
    await click('43');
    assert.match(inspector.textContent, /Dissecting/);
    await click('42');
    await act(async () => { resolveOldDetail!({ dissection: 'STALE packet 43 result' }); });
    assert.match(inspector.textContent, /Decoded evidence for packet 42/);
    assert.doesNotMatch(inspector.textContent, /STALE/);
    await click('Start recording');
    assert.equal(sessions, 2);
    assert.equal(button('Generate model').disabled, false);
    assert.doesNotMatch(host.querySelector('[aria-label="Capture investigation workspace"]')!.textContent, /Evidence 42/);
    assert.doesNotMatch(inspector.textContent, /Decoded evidence for packet 42/);
    assert.ok([...host.querySelectorAll('h1,h2,h3')].every(heading => !/^\s*\d+[.)]/.test(heading.textContent)));
  } finally {
    await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
