import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
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
