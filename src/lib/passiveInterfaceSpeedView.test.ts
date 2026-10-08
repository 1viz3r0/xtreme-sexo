import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PassiveInterfaceSpeed } from '../components/PassiveInterfaceSpeed';
import { emptySpeedSnapshot, failInterfaceSpeed, measureInterfaceSpeed } from './passiveInterfaceSpeed';
import type { DetailedAdapterInfo } from '../services/tauri/network';

const a: DetailedAdapterInfo = { name: 'eth0', friendly_name: 'eth0', description: '', mac_address: '',
  ipv4_addresses: [], ipv6_addresses: [], oper_status: 'Up', interface_type: 'Ethernet', rx_bytes: 0,
  tx_bytes: 0, rx_packets: 0, tx_packets: 0 };
const render = (snapshot = emptySpeedSnapshot(), desktop = true) => renderToStaticMarkup(createElement(PassiveInterfaceSpeed, { snapshot, desktop, refreshMs: 3000 }));

test('browser/unavailable/warmup states do not fabricate current zero rates or permit empty exports', () => {
  assert.match(render(undefined, false), /Unavailable in browser mode/);
  assert.match(render(), /Connecting: waiting/);
  const empty = measureInterfaceSpeed(emptySpeedSnapshot(), [], performance.now(), '', 10_000);
  assert.match(render(empty), /no non-loopback interfaces/);
  const first = measureInterfaceSpeed(emptySpeedSnapshot(), [a], performance.now(), '', 10_000);
  const html = render(first);
  assert.match(html, /Warmup: waiting/);
  assert.match(html, /disabled=""[^>]*>.*?Export recent CSV/);
  assert.doesNotMatch(html, /0\.000 Mbps/);
  assert.match(html, /not an Internet capacity speed test/);
});

test('live rates/history are available, while failed or stale readings hide current rates but retain export', () => {
  const time = performance.now();
  const first = measureInterfaceSpeed(emptySpeedSnapshot(), [a], time - 2000, '2026-10-05T00:00:00Z', 10_000);
  const live = measureInterfaceSpeed(first, [{ ...a, rx_bytes: 1_000_000 }], time, '2026-10-05T00:00:02Z', 10_000);
  assert.match(render(live), /4\.000 Mbps/);
  assert.match(render(live), /Recent throughput: 1 measured intervals/);
  assert.doesNotMatch(render(live), /disabled=""/);
  const failedHtml = render(failInterfaceSpeed(live));
  assert.match(failedHtml, /counter read failed/);
  assert.doesNotMatch(failedHtml, /font-bold">4\.000 Mbps/);
  assert.doesNotMatch(failedHtml, /disabled=""/);
  const staleHtml = render({ ...live, lastSuccess: time - 11_000 });
  assert.match(staleHtml, /Stale: no recent/);
  assert.doesNotMatch(staleHtml, /font-bold">4\.000 Mbps/);
});
