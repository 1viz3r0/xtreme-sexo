import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { SystemLogs } from './SystemLogs';

test('dashboard leads with host and network facts and keeps logs below them', () => {
  const source = readFileSync(new URL('./SystemLogs.tsx', import.meta.url), 'utf8');
  const overview = source.indexOf('aria-label="Host overview"');
  const network = source.indexOf('aria-label="Network identity"');
  const resources = source.indexOf('aria-label="System resources"');
  const detailed = source.indexOf('aria-label="Logs & diagnostics"');

  assert.ok(overview >= 0);
  assert.ok(network > overview);
  assert.ok(resources > network);
  assert.ok(detailed > overview);
  assert.ok(detailed > resources);
  assert.ok(source.indexOf('Host identity') > overview);
  assert.ok(source.indexOf('Observed resources') > overview);
  assert.ok(source.indexOf('Local IP') > network);
  assert.ok(source.indexOf('Connected devices') > network);
  assert.ok(source.indexOf('MAC address') > network);
  assert.ok(source.indexOf('Link state') > network);
  assert.match(source, /getDetailedNetworkInterfaces/);
  assert.match(source, /getDevices/);
  assert.ok(source.indexOf('Active TCP Connections') > detailed);
  assert.ok(source.indexOf('Native Host Event Logs') > detailed);
  for (const accordion of ['Readiness &amp; live sources', 'Throughput', 'Runtime logs &amp; host report', 'TCP connections', 'Native events']) {
    assert.ok(source.indexOf(accordion) > detailed, `${accordion} must be a diagnostics accordion`);
  }
  for (const feature of ['<ReadinessPanel', '<LiveSources', '<HostReport', '<PassiveInterfaceSpeed', '<RuntimeLogs']) {
    assert.ok(source.indexOf(feature) > detailed, `${feature} must remain below the host summary`);
  }
  assert.match(source, /Open the desktop application to view local activity/);
  assert.match(source, /No native event records available on this host/);
  assert.doesNotMatch(source, /health score|threat score|bandwidth test/i);
});

test('rendered dashboard visibly labels addresses and device count without inventing browser data', () => {
  // The node runner uses classic JSX for legacy child components; Vite uses automatic JSX.
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  let markup: string;
  try { markup = renderToStaticMarkup(React.createElement(SystemLogs)); }
  finally {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  }
  assert.match(markup, />Dashboard</);
  assert.match(markup, />Local IP</);
  assert.match(markup, />MAC address</);
  assert.match(markup, /Connected devices/);
  assert.match(markup, /Not reported/);
  assert.match(markup, /stored local ARP\/discovery evidence/);
  assert.match(markup, /not a complete live network census/);
  assert.match(markup, /No scans or uploads are started here/);
  assert.ok(markup.indexOf('Network identity') < markup.indexOf('Logs &amp; diagnostics'));
  assert.ok(markup.indexOf('System resources') < markup.indexOf('Logs &amp; diagnostics'));
  assert.ok(markup.indexOf('TCP connections') > markup.indexOf('Logs &amp; diagnostics'));
});

test('network snapshot is sourced by passive reads and retains polling safety', () => {
  const source = readFileSync(new URL('./SystemLogs.tsx', import.meta.url), 'utf8');
  assert.match(source, /getDevices\(\)/);
  assert.match(source, /devices\.filter\(\(device\) => device\.active\)/);
  assert.match(source, /not a verified default route/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /document\.hidden \|\| busy\.current/);
  assert.match(source, /generation\.current !== requestGeneration/);
  assert.doesNotMatch(source, /refreshDevices\(|scanHostPorts\(|request_admin|upload\(/);
});

test('dashboard releases refresh loading after StrictMode or polling changes invalidate a pending read', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'React', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'React' ? React : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name],
  });
  const pending: Array<{ resolve: (value: null) => void; reject: (error: Error) => void }> = [];
  Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string) => {
    if (command === 'get_detailed_system_info') return new Promise<null>((resolve, reject) => { pending.push({ resolve, reject }); });
    if (['get_detailed_network_interfaces', 'get_active_tcp_connections', 'get_windows_events', 'get_devices'].includes(command)) return [];
    if (command === 'get_backend_readiness') return null;
    throw new Error(`Unexpected command: ${command}`);
  } } });
  const { createRoot } = await import('react-dom/client');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const render = async (refreshMs: number) => { await act(async () => {
    root.render(React.createElement(React.StrictMode, {}, React.createElement(SystemLogs, { refreshMs })));
  }); };
  const refresh = () => host.querySelector('header button')!;
  try {
    await render(60_000);
    assert.equal(pending.length, 1, 'StrictMode must not duplicate in-flight native requests');
    assert.equal(refresh().getAttribute('aria-busy'), 'true');
    await render(120_000);
    assert.equal(pending.length, 1, 'polling changes must retain the shared request gate');
    await act(async () => { pending[0].resolve(null); });
    assert.equal(refresh().getAttribute('aria-busy'), 'false');
    assert.equal(refresh().hasAttribute('disabled'), false);
    assert.match(refresh().textContent ?? '', /Refresh host/);
    await act(async () => { (refresh() as unknown as HTMLButtonElement).click(); });
    assert.equal(pending.length, 2);
    await act(async () => { pending[1].resolve(null); });
    assert.equal(refresh().getAttribute('aria-busy'), 'false');
  } finally {
    await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
