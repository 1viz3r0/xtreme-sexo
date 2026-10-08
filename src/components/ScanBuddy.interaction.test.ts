import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { Window } from 'happy-dom';

test('mounted native workflow previews and starts the same authorized request', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? window : (window as unknown as Record<string, unknown>)[name] });
  const calls: { command: string; args: any }[] = [];
  const plan = { targets: ['127.0.0.1'], ports: [80], total_probes: 1, timeout_ms: 800, concurrency: 4, warnings: [] };
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string, args: any) => {
    calls.push({ command, args });
    if (command === 'scan_buddy_history') return [];
    if (command === 'scan_buddy_plan') return plan;
     if (command === 'scan_buddy_start') return { id: 'loopback-fixture', state: 'COMPLETED', started_at: '2026-10-05T00:00:00Z', finished_at: '2026-10-05T00:00:00Z', plan, completed_probes: 1, results: [{ target: '127.0.0.1', port: 80, state: 'OPEN', service_hint: 'HTTP (unverified hint)', latency_ms: 1, observed_at: '2026-10-05T00:00:00Z' }], error: null };
     if (command === 'scan_buddy_inspect') return { target: '127.0.0.1', port: 80, check: 'http-preview', status: 'http-response', protocol_evidence: 'HTTP/1.1 200 OK', response_headers: { 'content-type': 'text/plain' }, content_preview: '<safe> preview', os_assessment: null, observed_at: '2026-10-05T00:00:01Z', limitations: ['Bounded GET /; content is unverified peer-supplied evidence.'] };
    throw new Error(`Unexpected command: ${command}`);
  } } });
  const { createRoot } = await import('react-dom/client');
  const { ScanBuddy } = await import('./ScanBuddy');
  const host = window.document.createElement('div'); window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  try {
    await act(async () => { root.render(React.createElement(ScanBuddy)); });
    assert.deepEqual([...host.querySelectorAll('[aria-label="Scan stages"] a')].map(link => link.textContent), ['Scope', 'Preview', 'Results']);
    for (const link of host.querySelectorAll('[aria-label="Scan stages"] a')) assert.ok(host.querySelector(link.getAttribute('href')!));
    assert.equal(host.querySelector('h1')!.textContent, ' Scan Buddy');
    assert.doesNotMatch(host.querySelector('header')!.textContent, /Active reconnaissance|32 TARGETS|pretending/);
    assert.ok([...host.querySelectorAll('h1,h2,h3')].every(heading => !/^\s*\d+[.)]/.test(heading.textContent)));
    const limits = [...host.querySelectorAll('details')].find(item => item.querySelector('summary')?.textContent === 'Scan limits, recovery & export privacy');
    assert.ok(limits);
    assert.equal(limits.open, false);
    assert.match(limits.textContent, /Jobs continue when you leave this view/);
    const target = host.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(target, '127.0.0.1');
      target.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
    const checkbox = host.querySelector('input[type=checkbox]')!;
    await act(async () => { (checkbox as any).click(); });
    const buttons = () => [...host.querySelectorAll('button')];
    const preview = buttons().find(button => button.textContent.includes('Preview scan plan'))!;
    assert.equal((preview as any).disabled, false, host.textContent);
    await act(async () => { (preview as any).click(); });
    assert.match(host.querySelector('#scan-preview')!.textContent, /Targets: 127\.0\.0\.1/);
    assert.match(host.querySelector('#scan-preview')!.textContent, /Ports: 80/);
    assert.ok(calls.some(call => call.command === 'scan_buddy_plan'));
    const start = buttons().find(button => button.textContent.includes('Start TCP scan'))!;
    assert.equal((start as any).disabled, false, host.textContent);
    await act(async () => { (start as any).click(); });
    const started = calls.find(call => call.command === 'scan_buddy_start');
    assert.ok(started, host.textContent);
    assert.equal(started.args.request.authorized, true);
    assert.equal(started.args.request.targets, '127.0.0.1');
    assert.ok(host.textContent.includes('Scan completed'));
   assert.ok(host.textContent.includes('OPEN'));
   const select = buttons().find(button => button.textContent === 'Select')!;
   await act(async () => { (select as any).click(); });
   const check = host.querySelector('[aria-label="Inspection check"]') as HTMLSelectElement;
   assert.ok(check);
   await act(async () => {
     Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!.call(check, 'http-preview');
     check.dispatchEvent(new window.Event('change', { bubbles: true }));
   });
   assert.match(check.textContent, /bounded GET \/ content preview/);
   const permission = [...host.querySelectorAll('input[type=checkbox]')][1] as HTMLInputElement;
   await act(async () => { permission.click(); });
   const inspect = buttons().find(button => button.textContent.includes('Inspect'))!;
   await act(async () => { (inspect as any).click(); });
   assert.match(host.querySelector('[aria-label="Service inspection evidence"]')!.textContent, /HTTP preview/);
   assert.match(host.textContent, /content-type/);
   assert.match(host.textContent, /<safe> preview/);
   assert.ok(calls.some(call => call.command === 'scan_buddy_inspect' && call.args.check === 'http-preview'));
  } finally {
    await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
