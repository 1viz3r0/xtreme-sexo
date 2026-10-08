import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
test('Scan Buddy owns its native state and replaces the routed legacy engine', () => {
  const app = source('src/App.tsx');
  assert.match(app, /import\('\.\/components\/ScanBuddy'\)/);
  assert.match(app, /<ScanBuddy\s*\/>/);
  assert.doesNotMatch(app, /<HybridIntel\s*\/>/);
  assert.match(source('src/components/Sidebar.tsx'), /id: 'network_engine', label: 'Scan Buddy'/);
  const bootstrap = source('src-tauri/src/lib.rs');
  assert.match(bootstrap, /manage\(services::scan_buddy::ScanBuddyState::persistent\(\)\)/);
  assert.match(bootstrap, /state::<services::scan_buddy::ScanBuddyState>\(\).shutdown\(\)/);
  for (const command of ['plan', 'start', 'status', 'cancel', 'history']) {
    assert.ok(bootstrap.includes(`commands::scan_buddy::scan_buddy_${command}`));
  }
});
test('Independent native scanner does not spawn or embed an external scanner', () => {
  const engine = source('src-tauri/src/services/scan_buddy.rs');
  const commands = source('src-tauri/src/commands/scan_buddy.rs');
  assert.match(engine, /TcpStream::connect\(address\)/);
  assert.doesNotMatch(engine + commands, /(?:tokio::process|Command::new|include_bytes!|include_str!)/);
  assert.doesNotMatch(source('src-tauri/Cargo.toml'), /^\s*nmap\s*=/m);
});
