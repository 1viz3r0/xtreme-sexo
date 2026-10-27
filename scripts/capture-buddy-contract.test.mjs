import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Capture Buddy uses NET0ZE-native analysis and only its fixed capture helper', () => {
  const runtime = [
    source('src-tauri/src/services/buddy_engine.rs'),
    source('src-tauri/src/services/buddy_search.rs'),
    source('src-tauri/src/services/capture_brief.rs'),
    source('src-tauri/src/services/capture_investigation.rs'),
    source('src-tauri/src/services/capture_helper.rs'),
    source('src-tauri/src/commands/capture_buddy.rs'),
  ].join('\n');
  assert.match(runtime, /Native PCAP|native query AST|capture-helper|netoze-capture-helper/i);
  assert.doesNotMatch(runtime, /(?:Command::new\(['"](?:nmap|tshark|dumpcap|wireshark)|(?:spawn|exec|process)\([^)]*(?:nmap|tshark|dumpcap|wireshark))/i);
  assert.match(source('src-tauri/src/services/capture_helper.rs'), /helper/);
});
