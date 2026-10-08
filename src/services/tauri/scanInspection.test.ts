import test from 'node:test';
import assert from 'node:assert/strict';
import { createScanInspectionAdapter } from './scanInspection';

const valid = { target: '127.0.0.1', port: 80, check: 'http-head', status: 'observed', protocol_evidence: 'HTTP/1.1', os_assessment: null, observed_at: '2026-10-07T00:00:00Z', limitations: ['No OS inference from port number'] };

test('inspection uses exact IPC command and preserves structured evidence', async () => {
  let call: unknown[] = [];
  const inspect = createScanInspectionAdapter(async (command, args) => { call = [command, args]; return valid; }, true);
  assert.deepEqual(await inspect('127.0.0.1', 80, true, 'http-head'), valid);
  assert.deepEqual(call, ['scan_buddy_inspect', { target: '127.0.0.1', port: 80, authorized: true, check: 'http-head' }]);
});

test('inspection accepts bounded optional preview evidence without fabricating absent fields', async () => {
  const absent = createScanInspectionAdapter(async () => valid, true);
  const absentResult = await absent('127.0.0.1', 80, true, 'http-head');
  assert.equal('response_headers' in absentResult, false);
  assert.equal('content_preview' in absentResult, false);
  const result = await createScanInspectionAdapter(async () => ({ ...valid, check: 'http-preview', response_headers: { 'content-type': 'text/plain' }, content_preview: '<safe>' }), true)('127.0.0.1', 80, true, 'http-preview');
  assert.deepEqual(result.response_headers, { 'content-type': 'text/plain' });
  assert.equal(result.content_preview, '<safe>');
});

test('inspection gates permission, browser mode, and malformed native results', async () => {
  const inspect = createScanInspectionAdapter(async () => valid, false);
  await assert.rejects(() => inspect('127.0.0.1', 80, true, 'connect'), /browser mode/);
  const native = createScanInspectionAdapter(async () => ({ ...valid, port: '80' }), true);
  await assert.rejects(() => native('127.0.0.1', 80, true, 'connect'), /invalid result/);
  await assert.rejects(() => createScanInspectionAdapter(async () => ({ ...valid, response_headers: ['bad'] }), true)('127.0.0.1', 80, true, 'http-head'), /response headers/);
  await assert.rejects(() => createScanInspectionAdapter(async () => ({ ...valid, content_preview: 'x'.repeat(4097) }), true)('127.0.0.1', 80, true, 'http-preview'), /content preview/);
  await assert.rejects(() => createScanInspectionAdapter(async () => ({ ...valid, response_headers: { 'content-type': 42 } }), true)('127.0.0.1', 80, true, 'http-head'), /response headers/);
  await assert.rejects(() => createScanInspectionAdapter(async () => valid, true)('127.0.0.1', 80, false, 'connect'), /permission/);
});
