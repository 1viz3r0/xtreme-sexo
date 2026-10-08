import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { Window } from 'happy-dom';

test('mounted numbered flow previews without permission, preserves preview on checkbox, cancels and revisits history', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? window : (window as unknown as Record<string, unknown>)[name] });
  const calls: { command: string; args: any }[] = [];
  const plan = { targets: ['127.0.0.1'], ports: [80], total_probes: 1, timeout_ms: 800, concurrency: 4, warnings: [] };
  let stored: any = null;
  let latePlan: ((value: typeof plan) => void) | undefined;
  let deferPlan = false;
  let failCommand: string | null = null;
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string, args: any) => {
    calls.push({ command, args });
    if (command === failCommand) throw new Error('Scan Buddy request timed out');
    if (command === 'scan_buddy_history') return stored ? [stored] : [];
    if (command === 'scan_buddy_plan') return deferPlan ? new Promise(resolve => { latePlan = resolve; }) : plan;
    if (command === 'scan_buddy_start') { stored = { id: 'fixture', state: 'RUNNING', started_at: '2026-10-05T00:00:00Z', finished_at: null, plan, completed_probes: 0, results: [], error: null }; return stored; }
    if (command === 'scan_buddy_cancel') { stored = { ...stored, state: 'CANCELLED' }; return stored; }
    if (command === 'scan_buddy_status') return stored;
    throw new Error(`Unexpected command ${command}`);
  } } });
  const { createRoot } = await import('react-dom/client');
  const { ScanBuddy } = await import('./ScanBuddy');
  const host = window.document.createElement('div'); window.document.body.append(host);
  let root = createRoot(host as unknown as Element);
  const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent.includes(text))!;
  try {
    await act(async () => { root.render(React.createElement(ScanBuddy)); });
    assert.equal(host.querySelector('textarea')!.value, '');
    assert.match(host.textContent, /Scope[\s\S]*Preview[\s\S]*Start/);
    assert.doesNotMatch(host.textContent, /[123]\. (Scope|Preview|Start)/);
    assert.match(host.querySelector('#scan-start-reason')!.textContent, /Scope required/);
    await act(async () => { button('Use loopback').click(); });
    assert.equal(calls.filter(call => call.command === 'scan_buddy_start' || call.command === 'scan_buddy_plan').length, 0);
    await act(async () => { button('Preview scan plan').click(); });
    assert.equal(calls.find(call => call.command === 'scan_buddy_plan')!.args.request.authorized, false);
    assert.equal(button('Start TCP scan').disabled, true);
    assert.match(host.querySelector('#scan-start-reason')!.textContent, /checkbox/);
    await act(async () => { (host.querySelector('input[type=checkbox]') as any).click(); });
    assert.equal(button('Start TCP scan').disabled, false);
    assert.equal(calls.filter(call => call.command === 'scan_buddy_plan').length, 1);
    await act(async () => { button('Start TCP scan').click(); });
    assert.equal(calls.find(call => call.command === 'scan_buddy_start')!.args.request.authorized, true);
    await act(async () => { button('Cancel job').click(); });
    assert.match(host.textContent, /Scan cancelled/);
    await act(async () => { root.unmount(); });
    root = createRoot(host as unknown as Element);
    await act(async () => { root.render(React.createElement(ScanBuddy)); });
    assert.match(host.textContent, /Scan cancelled/);
    assert.equal(calls.filter(call => call.command === 'scan_buddy_status').length, 0);
    await act(async () => { button('Use loopback').click(); });
    deferPlan = true;
    await act(async () => { button('Preview scan plan').click(); });
    assert.match(host.querySelector('#scan-start-reason')!.textContent, /Wait for preview/);
    await act(async () => { root.unmount(); });
    root = createRoot(host as unknown as Element);
    await act(async () => { root.render(React.createElement(ScanBuddy)); });
    await act(async () => { latePlan!(plan); });
    assert.equal(host.textContent.includes('Plan ready:'), false);
    deferPlan = false; failCommand = 'scan_buddy_plan';
    await act(async () => { button('Use loopback').click(); });
    await act(async () => { button('Preview scan plan').click(); });
    assert.match(host.querySelector('[role=alert]')!.textContent, /Preview failed \(no probes sent\)/);
    failCommand = null;
    await act(async () => { button('Preview scan plan').click(); });
    await act(async () => { (host.querySelector('input[type=checkbox]') as any).click(); });
    failCommand = 'scan_buddy_start';
    await act(async () => { button('Start TCP scan').click(); });
    assert.match(host.querySelector('[role=alert]')!.textContent, /may have started/);
    assert.equal(button('Start TCP scan').disabled, true);
    assert.match(host.querySelector('#scan-start-reason')!.textContent, /Refresh history/);
  } finally {
    await act(async () => { root.unmount(); }); await window.happyDOM.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
