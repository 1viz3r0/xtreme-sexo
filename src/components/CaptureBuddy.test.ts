import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCaptureOptions } from '../lib/captureBuddyPresentation';

test('capture frontend validation matches native bounds', () => {
  assert.equal(validateCaptureOptions('64', '24', '1'), null);
  assert.equal(validateCaptureOptions('262144', String(32 * 1024 * 1024), '100000'), null);
  assert.match(validateCaptureOptions('63', '24', '1')!, /Snapshot length/);
  assert.match(validateCaptureOptions('64', '23', '1')!, /Max bytes/);
  assert.match(validateCaptureOptions('64', '24', '100001')!, /Max packets/);
  assert.match(validateCaptureOptions('64.5', '24', '1')!, /whole numbers/);
});
