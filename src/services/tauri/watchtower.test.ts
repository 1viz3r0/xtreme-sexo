import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWatchtowerSnapshot } from './watchtower';

const valid = {
  captured_at: '2026-10-14T00:00:00Z', captured_at_unix_ms: 1791936000000, stale: false,
  interfaces: [{ name: 'wlan0', addresses: ['192.0.2.10'], mac_address: 'aa:bb:cc:dd:ee:ff', oper_state: 'up', counters: { receive_bytes: 1, transmit_bytes: 2, receive_packets: 3, transmit_packets: 4 }, wifi_ssid: null, wifi_bssid: null, wifi_association: 'unavailable', warnings: ['association unavailable'] }],
  routes: [{ interface: 'wlan0', destination: '0.0.0.0/0', gateway: '192.0.2.1', metric: 100, active: true }],
  default_gateway: '192.0.2.1', neighbors: [{ interface: 'wlan0', address: '192.0.2.1', mac_address: '00:11:22:33:44:55', state: 'reachable' }], warnings: ['not a complete LAN inventory'],
};

test('Watchtower validates and preserves native provenance fields', () => {
  const snapshot = validateWatchtowerSnapshot(valid);
  assert.equal(snapshot.interfaces[0].wifi_association, 'unavailable');
  assert.equal(snapshot.neighbors[0].state, 'reachable');
  assert.deepEqual(snapshot.warnings, ['not a complete LAN inventory']);
});

test('Watchtower rejects malformed native payloads instead of rendering guesses', () => {
  assert.throws(() => validateWatchtowerSnapshot({ ...valid, neighbors: [{ address: 42 }] }));
  assert.throws(() => validateWatchtowerSnapshot({ ...valid, stale: 'false' }));
  assert.throws(() => validateWatchtowerSnapshot({ ...valid, interfaces: [{ ...valid.interfaces[0], counters: undefined }] }));
  assert.throws(() => validateWatchtowerSnapshot({ ...valid, interfaces: [{ ...valid.interfaces[0], wifi_association: 1 }] }));
  assert.throws(() => validateWatchtowerSnapshot({ ...valid, interfaces: [{ ...valid.interfaces[0], counters: { ...valid.interfaces[0].counters, receive_bytes: Number.MAX_SAFE_INTEGER + 1 } }] }));
});
