import test from 'node:test';
import assert from 'node:assert/strict';
import type { DetailedAdapterInfo } from '../services/tauri/network';
import { emptySpeedSnapshot, failInterfaceSpeed, interfaceSpeedCsv, measureInterfaceSpeed, SPEED_HISTORY_LIMIT, SPEED_INTERFACE_LIMIT } from './passiveInterfaceSpeed';

const adapter = (name = 'eth0', rx = 0, tx = 0, patch: Partial<DetailedAdapterInfo> = {}): DetailedAdapterInfo => ({
  name, friendly_name: name, description: '', mac_address: '00:11:22:33:44:55', ipv4_addresses: [], ipv6_addresses: [],
  oper_status: 'Up', interface_type: 'Ethernet', rx_bytes: rx, tx_bytes: tx, rx_packets: 0, tx_packets: 0, ...patch,
});
const measure = (s = emptySpeedSnapshot(), a = [adapter()], t = 1000) => measureInterfaceSpeed(s, a, t, '2026-10-05T00:00:00.000Z', 10_000);

test('uses actual elapsed interval, decimal Mbps and binary KiB/s; idle is measured zero', () => {
  const first = measure();
  assert.equal(first.interfaces[0].status, 'warmup');
  assert.equal(first.interfaces[0].history.length, 0);
  const second = measure(first, [adapter('eth0', 1_000_000, 512_000)], 3000);
  const i = second.interfaces[0];
  assert.equal(i.status, 'live');
  assert.equal(i.history[0].rxMbps, 4);
  assert.equal(i.history[0].txKibps, 250);
  assert.equal(i.sessionRx, 1_000_000);
  const idle = measure(second, [adapter('eth0', 1_000_000, 512_000)], 4000).interfaces[0];
  assert.equal(idle.history[1].rxMbps, 0);
  assert.equal(idle.peakRxMbps, 4);
});

test('reordering/IP changes keep stable identity; loopback and duplicate adapters do not create aggregates', () => {
  const first = measure(undefined, [adapter(), adapter('tun0', 9000), adapter('lo'), adapter('loop', 0, 0, { interface_type: 'Software Loopback' })]);
  const second = measure(first, [adapter('tun0', 9500), adapter('eth0', 100, 20, { ipv4_addresses: ['192.0.2.1'] }), adapter('eth0', 5000)], 2000);
  assert.equal(second.interfaces.length, 2);
  assert.equal(second.interfaces[0].sessionRx, 500);
  assert.equal(second.interfaces[1].sessionRx, 100);
});

test('counter resets in either direction discard the entire interval and mark the next graph segment', () => {
  const first = measure(undefined, [adapter('eth0', 1000, 1000)]);
  const reset = measure(first, [adapter('eth0', 2000, 500)], 2000);
  assert.equal(reset.interfaces[0].status, 'reset');
  assert.equal(reset.interfaces[0].sessionRx, 0);
  assert.equal(reset.interfaces[0].history.length, 0);
  const recovered = measure(reset, [adapter('eth0', 2100, 600)], 3000).interfaces[0];
  assert.equal(recovered.sessionRx, 100);
  assert.equal(recovered.history[0].gapBefore, true);
});

test('interface churn does not bridge removed counters, and changed MAC is a new session', () => {
  const first = measure();
  const live = measure(first, [adapter('eth0', 100)], 2000);
  const gone = measure(live, [], 3000);
  assert.equal(gone.interfaces[0].status, 'missing');
  const returned = measure(gone, [adapter('eth0', 10000)], 4000);
  assert.equal(returned.interfaces[0].status, 'warmup');
  assert.equal(returned.interfaces[0].sessionRx, 100);
  const replaced = measure(returned, [adapter('eth0', 20000, 0, { mac_address: 'aa:bb:cc:dd:ee:ff' })], 5000);
  assert.equal(replaced.interfaces[0].status, 'warmup');
  assert.equal(replaced.interfaces[0].sessionRx, 0);
  assert.equal(replaced.interfaces[1].status, 'missing');
});

test('failure, down state, long gap and clock reversal renew baselines without invented rates', () => {
  const first = measure();
  const failed = failInterfaceSpeed(first);
  assert.equal(failed.error, true);
  const recovered = measure(failed, [adapter('eth0', 900)], 2000);
  assert.equal(recovered.interfaces[0].status, 'warmup');
  const down = measure(recovered, [adapter('eth0', 1000, 0, { oper_status: 'Down' })], 3000);
  assert.equal(down.interfaces[0].status, 'down');
  assert.equal(measure(down, [adapter('eth0', 2000)], 4000).interfaces[0].status, 'warmup');
  for (const time of [1000, 999, 11001]) {
    const skipped = measure(first, [adapter('eth0', 50000)], time).interfaces[0];
    assert.equal(skipped.status, 'stale');
    assert.equal(skipped.sessionRx, 0);
    assert.equal(skipped.history.length, 0);
  }
});

test('rejects unsafe, negative, fractional and nonfinite counters and nonfinite rates', () => {
  for (const number of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = measure(undefined, [adapter('eth0', number)]);
    assert.equal(invalid.interfaces[0].status, 'invalid');
    assert.equal(invalid.interfaces[0].baseline, null);
    assert.equal(measure(invalid).interfaces[0].status, 'warmup');
  }
  const first = measure(undefined, [adapter()], 0);
  assert.equal(measure(first, [adapter('eth0', 100)], Number.MIN_VALUE).interfaces[0].status, 'invalid');
  assert.equal(measure(first, [adapter()], NaN).error, true);
});

test('bounded recent history retains accurate session totals and peaks; interfaces also bounded', () => {
  let snapshot = measure(undefined, [adapter()], 0);
  for (let n = 1; n <= SPEED_HISTORY_LIMIT + 5; n++) snapshot = measure(snapshot, [adapter('eth0', n * 100)], n * 1000);
  const i = snapshot.interfaces[0];
  assert.equal(i.history.length, SPEED_HISTORY_LIMIT);
  assert.equal(i.sessionRx, (SPEED_HISTORY_LIMIT + 5) * 100);
  assert.equal(i.peakRxMbps, 0.0008);
  const many = Array.from({ length: SPEED_INTERFACE_LIMIT + 10 }, (_, n) => adapter(`eth${n}`));
  assert.equal(measure(snapshot, many, 130_000).interfaces.length, SPEED_INTERFACE_LIMIT);
});

test('does not permit measured session byte totals to overflow safe integer precision', () => {
  let snapshot = measure(undefined, [adapter()], 0);
  snapshot = measure(snapshot, [adapter('eth0', Number.MAX_SAFE_INTEGER)], 1000);
  snapshot = measure(snapshot, [adapter('eth0', 0)], 2000);
  const overflow = measure(snapshot, [adapter('eth0', 1)], 3000).interfaces[0];
  assert.equal(overflow.status, 'invalid');
  assert.equal(overflow.sessionRx, Number.MAX_SAFE_INTEGER);
  assert.equal(overflow.history.length, 1);
});

test('CSV exports only measured retained intervals, correct units, escaping and formula protection', () => {
  const first = measure(undefined, [adapter('=danger,"label"')]);
  assert.equal(interfaceSpeedCsv(first.interfaces[0]).split('\r\n').length, 2);
  const live = measure(first, [adapter('=danger,"label"', 1000, 512)], 2000);
  const csv = interfaceSpeedCsv(live.interfaces[0]);
  assert.match(csv, /rx_mbps,tx_mbps,rx_kib_per_second/);
  assert.match(csv, /"'=danger,""label"""/);
  assert.match(csv, /,1,1000,512,0.008,0.004096,0.9765625,0.5,false/);
});
