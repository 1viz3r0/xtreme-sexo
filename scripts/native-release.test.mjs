import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stageNativeRelease } from './stage-native-release.mjs';
import { formatIndiaTime } from './backend-logbook.mjs';

test('logbook time uses IST and rolls over the UTC date correctly', () => {
  assert.equal(formatIndiaTime(new Date('2026-10-03T20:45:00Z')), '2026-10-04 02:15:00 IST (+05:30)');
});

test('separate platform releases preserve artifacts and produce checksums', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'netoze-release-test-'));
  const previousTarget = process.env.CARGO_TARGET_DIR;
  delete process.env.CARGO_TARGET_DIR;
  try {
    mkdirSync(path.join(root, 'src-tauri'), { recursive: true });
    writeFileSync(path.join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ productName: 'NET0ZE', version: '2.0.0' }));
    for (const [folder, suffix] of [['nsis', '.exe'], ['msi', '.msi'], ['deb', '.deb'], ['appimage', '.AppImage']]) {
      const dir = path.join(root, 'src-tauri/target/release/bundle', folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `NET0ZE_2.0.0${suffix}`), `test fixture ${suffix}`);
    }
    for (const platform of ['windows', 'linux']) {
      const result = stageNativeRelease(root, platform, 'x64');
      assert.equal(result.files.length, 2);
      assert.ok(result.destination.includes(path.join('releases', platform)));
      for (const file of result.files) {
        assert.match(file.sha256, /^[0-9a-f]{64}$/);
        assert.equal(readFileSync(path.join(result.destination, file.name), 'utf8'), `test fixture ${path.extname(file.name)}`);
      }
    }
    rmSync(path.join(root, 'src-tauri/target/release/bundle/appimage'), { recursive: true });
    assert.throws(() => stageNativeRelease(root, 'linux', 'arm64'), /Missing native bundle/);
    assert.equal(existsSync(path.join(root, 'releases/linux/2.0.0-arm64')), false);
    const triple = 'x86_64-pc-windows-msvc';
    const crossDir = path.join(root, 'src-tauri/target', triple, 'release/bundle/nsis');
    mkdirSync(crossDir, { recursive: true });
    writeFileSync(path.join(crossDir, 'NET0ZE_2.0.0-setup.exe'), 'cross-build fixture');
    assert.throws(() => stageNativeRelease(root, 'windows', 'x64', { targetTriple: triple }), /Missing native bundle/);
    const cross = stageNativeRelease(root, 'windows', 'x64', { targetTriple: triple, formats: ['nsis'] });
    const manifest = JSON.parse(readFileSync(path.join(cross.destination, 'manifest.json')));
    assert.deepEqual(manifest.formats, ['nsis']);
    assert.equal(manifest.target, triple);
    assert.equal(manifest.files.length, 1);
    assert.throws(() => stageNativeRelease(root, 'windows', 'x64', { targetTriple: '../escape' }), /Invalid native target/);
    assert.throws(() => stageNativeRelease(root, 'linux', 'x64', { formats: ['nsis'] }), /Invalid installer/);
  } finally {
    if (previousTarget === undefined) delete process.env.CARGO_TARGET_DIR;
    else process.env.CARGO_TARGET_DIR = previousTarget;
    rmSync(root, { recursive: true, force: true });
  }
});
