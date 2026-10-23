import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linuxInstaller = readFileSync(path.join(root, 'scripts/install-linux.sh'), 'utf8');
const windowsInstaller = readFileSync(path.join(root, 'scripts/install-windows.ps1'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const distributionGuide = readFileSync(path.join(root, 'docs/NETOZE_DISTRIBUTION.md'), 'utf8');
const windowsGuide = readFileSync(path.join(root, 'docs/NETOZE_WINDOWS_INSTALLER.md'), 'utf8');
const windowsWorkflow = readFileSync(path.join(root, '.github/workflows/windows-installer.yml'), 'utf8');

test('distribution entrypoints cover staged Linux and Windows artifacts', () => {
  assert.match(linuxInstaller, /releases\/linux/);
  assert.match(linuxInstaller, /dpkg-deb/);
  assert.match(linuxInstaller, /install -m 0755/);
  assert.match(linuxInstaller, /--dry-run/);
  assert.match(linuxInstaller, /--force/);
  assert.match(linuxInstaller, /\.deb/);
  assert.match(linuxInstaller, /\.AppImage/);
  assert.match(windowsInstaller, /releases\/windows/);
  assert.match(windowsInstaller, /msiexec\.exe/);
  assert.match(windowsInstaller, /Start-Process/);
  assert.match(windowsInstaller, /\.msi/);
  assert.match(windowsInstaller, /\.exe/);
});

test('installers document safe failure behavior and native Windows prerequisites', () => {
  assert.match(linuxInstaller, /Dependency repair is not run automatically/);
  assert.match(linuxInstaller, /Existing packages were not removed/);
  assert.doesNotMatch(linuxInstaller, /rm\s+-rf/);
  assert.match(windowsInstaller, /native\s+Windows build environment/);
  assert.match(windowsInstaller, /Npcap SDK/);
  assert.doesNotMatch(windowsInstaller, /Remove-Item|del\s|rmdir\s/i);
  assert.match(distributionGuide, /Rust MSVC/);
  assert.match(distributionGuide, /Visual Studio/);
  assert.match(distributionGuide, /Npcap SDK/);
  assert.match(distributionGuide, /does not automatically repair/i);
});

test('package scripts expose the platform-specific install commands', () => {
  assert.equal(packageJson.scripts['install:linux'], 'bash scripts/install-linux.sh');
  assert.equal(packageJson.scripts['install:windows'], 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-windows.ps1');
  assert.match(packageJson.scripts['test:release'], /install-flow\.test\.mjs/);
});

test('Windows release documentation and workflow define one-click publishing boundaries', () => {
  assert.match(windowsGuide, /NET0ZE_2\.0\.0_x64-setup\.exe/);
  assert.match(windowsGuide, /WebView2 bootstrapper/);
  assert.match(windowsGuide, /Npcap SDK/);
  assert.match(windowsGuide, /Do not silently download or redistribute/i);
  assert.match(windowsGuide, /Overview\/GOD'S EYE VIEW is currently hidden/);
  assert.match(windowsWorkflow, /windows-latest/);
  assert.match(windowsWorkflow, /npm run dist:windows/);
  assert.match(windowsWorkflow, /actions\/upload-artifact/);
  assert.match(windowsWorkflow, /softprops\/action-gh-release/);
});
