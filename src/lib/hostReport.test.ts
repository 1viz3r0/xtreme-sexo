import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HostReport } from '../components/HostReport';
import { collectHostReport, hostReportJson, hostReportMarkdown, REPORT_LIMITS, type HostReportSources } from './hostReport';
import type { DetailedAdapterInfo } from '../services/tauri/network';

const adapter: DetailedAdapterInfo = { name: 'private-interface', friendly_name: 'private-friendly', description: 'private-description', mac_address: 'aa:bb:cc:dd:ee:ff', ipv4_addresses: ['192.0.2.13'], ipv6_addresses: ['2001:db8::13'], oper_status: 'Up', interface_type: 'Ethernet', rx_bytes: 100, tx_bytes: 200, rx_packets: 3, tx_packets: 4 };
function sources(): HostReportSources {
  return { desktop: true,
    system: async () => ({ hostname: 'private-host', user_name: 'private-user', os_name: 'Linux', os_version: '6.1', architecture: 'x86_64', cpu_model: 'Test CPU', cpu_core_count: 8, ram_total_bytes: 1000, ram_available_bytes: 500, ram_usage_percent: 50, uptime_seconds: 3, is_admin: false }),
    interfaces: async () => [adapter],
    sockets: async () => [{ local_ip: '192.0.2.13', local_port: 31415, remote_ip: '198.51.100.2', remote_port: 27182, tcp_state: 'ESTABLISHED', pid: 98765, process_name: 'private-process' }],
    readiness: async () => ({ checked_at: '2026-10-05T03:00:00+03:00', platform: 'linux', architecture: 'x86_64', platform_supported: true,
      storage: { initialized: true, path: '/home/private-user/db.sqlite', schema_readable: true, read_write_open: true, writes_verified: false, detail: 'secret-detail' },
      native_tools: [{ name: 'private-tool', available: true, path: '/private-tool-path', purpose: 'secret-purpose' }],
      capture: { library: 'pcap', enumeration: 'AVAILABLE', interface_count: 1, permission: 'NOT_TESTED', detail: 'secret-capture-detail' }, last_errors: [{ source: 'secret-source', message: 'secret-token' }], error_scope: 'secret-scope', guidance: ['secret-guidance'] }),
    logStatus: async () => ({ available: true, reason: 'secret-log-reason', generated_at: '2026-10-05T00:00:00Z', timezone: 'UTC', initialized_at: null, last_write_at: null, file_count: 1, retained_bytes: 50, max_file_bytes: 1048576, max_files: 5, max_read_bytes: 65536 }),
  };
}
test('default redaction removes identifiers/endpoints; unknown fields and diagnostic/log text never retained', async () => {
  const report = await collectHostReport(false, sources());
  const json = hostReportJson(report);
  for (const value of ['private-host', 'private-user', 'private-interface', 'private-friendly', 'private-description', 'aa:bb:cc:dd:ee:ff', '192.0.2.13', '2001:db8::13', '198.51.100.2', '31415', '27182', '98765', 'private-process', 'private-tool', 'secret-']) assert.ok(!json.includes(value), value);
  assert.equal(report.identifiersIncluded, false);
  assert.equal(report.sections.length, 5);
  assert.ok(report.sections.every(section => section.status === 'observed' && section.collectedAtUtc.endsWith('Z')));
  assert.ok(json.includes('2026-10-05T00:00:00.000Z'));
  assert.ok(json.includes('ESTABLISHED'));
  assert.ok(json.includes('NOT_TESTED'));
});
test('explicit inclusion preserves bounded identifiers but still excludes freeform messages and secrets', async () => {
  const report = await collectHostReport(true, sources());
  const json = hostReportJson(report);
  for (const value of ['private-host', 'private-user', '192.0.2.13', 'aa:bb:cc:dd:ee:ff', 'private-process', '/private-tool-path']) assert.ok(json.includes(value));
  assert.ok(!json.includes('secret-'));
  assert.equal(report.identifiersIncluded, true);
});
test('Markdown contains native injection only inside escaped JSON; cannot close fence or insert HTML', async () => {
  const input = sources();
  const system = await input.system();
  const malicious = '```\n# fake health\n<script>alert(1)</script>~~~&[link](https://evil.example)\u202e';
  input.system = async () => ({ ...system, hostname: malicious });
  const report = await collectHostReport(true, input);
  const markdown = hostReportMarkdown(report);
  assert.equal(markdown.match(/```/g)?.length, 2);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('~~~'));
  assert.ok(!markdown.includes('\u202e'));
  const body = markdown.split('```json\n')[1].split('\n```')[0];
  assert.equal(JSON.parse(body).sections[0].data.hostname, malicious.replace(/[\n\u202e]/g, ''));
});
test('allSettled preserves independent reads, failures, empty observations and explicit unavailable status', async () => {
  const input = sources();
  input.system = () => { throw new Error('private-host secret-token /secret-path'); };
  input.interfaces = async () => [];
  const status = await input.logStatus();
  input.logStatus = async () => ({ ...status, available: false });
  const report = await collectHostReport(false, input);
  assert.equal(report.sections[0].status, 'failed');
  assert.equal(report.sections[0].data, null);
  assert.equal(report.sections[1].status, 'observed');
  assert.deepEqual(report.sections[1].data, { observedCount: 0, includedCount: 0, omittedCount: 0, rows: [] });
  assert.equal(report.sections[2].status, 'observed');
  assert.equal(report.sections[4].status, 'unavailable');
  assert.ok(!hostReportJson(report).includes('secret-token'));
});
test('browser collection never invokes any native source or invents telemetry; UI is empty and disabled', async () => {
  const fail = async (): Promise<never> => { assert.fail('Native source must not run'); };
  const report = await collectHostReport(false, { desktop: false, system: fail, interfaces: fail, sockets: fail, readiness: fail, logStatus: fail });
  assert.ok(report.sections.every(section => section.status === 'unavailable' && section.data === null));
  const html = renderToStaticMarkup(createElement(HostReport));
  assert.ok(html.includes('No browser telemetry or sample report is available.'));
  assert.ok(!html.includes('<pre'));
  assert.equal(html.match(/disabled=""/g)?.length, 4);
});
test('row, address, string and output caps bound sensitive opt-in snapshots with explicit omissions', async () => {
  const input = sources();
  const huge = '`'.repeat(10000);
  input.interfaces = async () => Array.from({ length: 1000 }, () => ({ ...adapter, name: huge, friendly_name: huge, description: huge, mac_address: huge, ipv4_addresses: Array(100).fill(huge), ipv6_addresses: Array(100).fill(huge) }));
  const socket = (await input.sockets())[0];
  input.sockets = async () => Array.from({ length: 1000 }, () => ({ ...socket, local_ip: huge, remote_ip: huge, process_name: huge }));
  const report = await collectHostReport(true, input);
  const interfaces = report.sections[1].data as { observedCount: number; includedCount: number; omittedCount: number; rows: { name: string; ipv4_addresses: { includedCount: number; omittedCount: number } }[] };
  assert.equal(interfaces.observedCount, 1000);
  assert.equal(interfaces.includedCount, REPORT_LIMITS.interfaces);
  assert.equal(interfaces.omittedCount, 1000 - REPORT_LIMITS.interfaces);
  assert.equal(interfaces.rows[0].name.length, REPORT_LIMITS.text);
  assert.equal(interfaces.rows[0].ipv4_addresses.includedCount, REPORT_LIMITS.addresses);
  assert.equal(interfaces.rows[0].ipv4_addresses.omittedCount, 100 - REPORT_LIMITS.addresses);
  assert.ok(hostReportJson(report).length < REPORT_LIMITS.serialized);
  assert.ok(hostReportMarkdown(report).length < REPORT_LIMITS.serialized);
  const sockets = report.sections[2].data as { includedCount: number };
  assert.equal(sockets.includedCount, REPORT_LIMITS.sockets);
});
test('nonfinite measurements and malformed collections are not exported as invented observations', async () => {
  const input = sources();
  const system = await input.system();
  input.system = async () => ({ ...system, ram_available_bytes: NaN, cpu_core_count: Infinity, uptime_seconds: -1 });
  input.interfaces = async () => null as unknown as DetailedAdapterInfo[];
  const report = await collectHostReport(false, input);
  const data = report.sections[0].data as { ram_available_bytes: null; cpu_core_count: null; uptime_seconds: null };
  assert.equal(data.ram_available_bytes, null);
  assert.equal(data.cpu_core_count, null);
  assert.equal(data.uptime_seconds, null);
  assert.equal(report.sections[1].status, 'failed');
});
