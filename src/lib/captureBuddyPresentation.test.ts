import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureIssue, packetMeaning, summarizePage } from './captureBuddyPresentation';

test('restricted launch is distinct from missing capture permissions', () => {
  assert.match(captureIssue('CAPTURE_SETUP: Install package').title, /setup required/);
  assert.match(captureIssue('CAPTURE_RESTRICTED: NoNewPrivs').title, /launch environment/);
  assert.match(captureIssue('CAP_NET_RAW may be required').title, /operating system/);
  assert.doesNotMatch(captureIssue('CAP_NET_RAW may be required').action, /sudo.*netoze/);
});
test('page summaries use only observed records and preserve unknown protocols', () => {
  assert.deepEqual(summarizePage([]), { endpoints: 0, bytes: 0, protocols: [] });
  const result = summarizePage([{ source: 'a', destination: 'b', length: '42', protocol: 'DNS' }, { source: 'b', destination: 'a', length: 'bad', protocol: 'TCP' }]);
  assert.equal(result.endpoints, 2); assert.equal(result.bytes, 42);
  assert.equal(packetMeaning('Unrecognized'), 'Unrecognized packet');
});
