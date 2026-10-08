import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { CaptureInvestigation as Model } from '../services/tauri/captureInvestigation';

const model: Model = { conversations: [{ id: 'conversation-1', source: 'private-a', destination: 'private-b', source_port: null, destination_port: 443, protocol: 'TCP', packets: 2, bytes: 44, first_time: null, last_time: 2, packet_numbers: [1, 2] }], timeline: [{ packet_number: 1, time: null, kind: 'DNS', severity: 'INFO', summary: 'Timeline fixture' }, { packet_number: 2, time: 2, kind: 'ERROR', severity: 'LOW', summary: 'Decode fixture' }], anomalies: [{ id: 'anomaly-1', kind: 'MISSING_TIMESTAMP', severity: 'LOW', confidence: 'observed', summary: 'Review fixture', reason: 'No timestamp', evidence_packets: [1] }], generated_from_packets: 2, limitations: ['Metadata only'] };

test('StrictMode manual generation, active-only tabs, filtering, temporary bookmarks and session late-result isolation', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? window : (window as unknown as Record<string, unknown>)[name] });
  const pending: { session: string; resolve: (value: Model) => void }[] = [];
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: (command: string, args: { sessionId: string }) => { assert.equal(command, 'buddy_investigation_model'); return new Promise<Model>(resolve => pending.push({ session: args.sessionId, resolve })); } } });
  const { createRoot } = await import('react-dom/client');
  const { CaptureInvestigation } = await import('./CaptureInvestigation');
  const host = window.document.createElement('div'); window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const selected: number[] = [];
  const render = async (sessionId: string) => { await act(async () => root.render(React.createElement(React.StrictMode, {}, React.createElement(CaptureInvestigation, { sessionId, onSelectPacket: n => selected.push(n) })))); };
  const find = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
  const click = async (button: Element) => { await act(async () => { (button as unknown as { click: () => void }).click(); await new Promise(resolve => setTimeout(resolve, 10)); }); };
  try {
    await render('first'); assert.equal(pending.length, 0, 'no automatic model request');
    await act(async () => { const generate = find('Generate model'); (generate as any).click(); (generate as any).click(); await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.equal(pending.length, 1, 'synchronous double click is gated');
    await act(async () => pending[0].resolve(model));
    assert.equal(host.querySelectorAll('[role=tabpanel]').length, 1); assert.ok(host.textContent.includes('private-a')); assert.ok(!host.textContent.includes('Timeline fixture')); assert.ok(!host.textContent.includes('Review fixture'));
    const search = host.querySelector('[aria-label="Search investigation metadata"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, 'no-match'); search.dispatchEvent(new window.Event('input', { bubbles: true })); });
    assert.ok(host.textContent.includes('No matching records')); assert.ok(!host.textContent.includes('private-a'));
    await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(search, ''); search.dispatchEvent(new window.Event('input', { bubbles: true })); });
    await click(host.querySelector('[aria-label="Select packet 1"]')!); assert.deepEqual(selected, [1]);
    await click(find('Bookmark packet')); assert.ok(host.querySelector('[aria-label="Bookmarked packets"]')); assert.ok(host.textContent.includes('1/100 references'));
    await click(find('Timeline')); assert.ok(!host.textContent.includes('private-a')); assert.ok(host.textContent.includes('Timeline fixture')); assert.ok(!host.textContent.includes('Review fixture'));
    const severity = host.querySelector('[aria-label="Severity filter"]')!;
    await act(async () => { (severity as any).value = 'LOW'; severity.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.ok(!host.textContent.includes('Timeline fixture')); assert.ok(host.textContent.includes('Decode fixture'));
    await click(find('Review')); assert.ok(!host.textContent.includes('Decode fixture')); assert.ok(host.textContent.includes('Review fixture'));
    await click(find('Refresh model')); assert.equal(pending.length, 2);
    await render('second'); assert.ok(!host.querySelector('[role=tabpanel]')); assert.ok(!host.querySelector('[aria-label="Bookmarked packets"]'));
    await click(find('Generate model')); assert.equal(pending.length, 3); assert.equal(pending[2].session, 'second');
    await act(async () => pending[1].resolve({ ...model, conversations: [{ ...model.conversations[0], source: 'STALE' }] }));
    assert.ok(!host.textContent.includes('STALE')); assert.ok(host.textContent.includes('Generating…'));
    await act(async () => pending[2].resolve(model)); assert.ok(host.textContent.includes('private-a')); assert.ok(host.textContent.includes('0/100 references')); assert.equal((host.querySelector('[aria-label="Search investigation metadata"]') as any).value, '');
    await click(find('Timeline')); assert.equal((host.querySelector('[aria-label="Severity filter"]') as any).value, 'all');
  } finally { await act(async () => root.unmount()); await window.happyDOM.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); } }
});
