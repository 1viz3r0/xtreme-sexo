import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const linuxConfig = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.linux.conf.json'), 'utf8'));
const postinst = readFileSync(path.join(root, 'src-tauri/install/linux-postinst.sh'), 'utf8');

test('Linux DEB packages only the capture helper and configures its privilege at install time', () => {
  const files = linuxConfig.bundle.linux.deb.files;
  assert.deepEqual(Object.keys(files), ['/usr/lib/netoze/netoze-capture-helper']);
  assert.equal(files['/usr/lib/netoze/netoze-capture-helper'], 'target/release/netoze-capture-helper');
  assert.equal(linuxConfig.bundle.linux.deb.postInstallScript, 'install/linux-postinst.sh');
  assert.match(postinst, /chown root:netdev \/usr\/lib\/netoze\/netoze-capture-helper/);
  assert.match(postinst, /chmod 0750 \/usr\/lib\/netoze\/netoze-capture-helper/);
  assert.match(postinst, /setcap cap_net_raw=ep \/usr\/lib\/netoze\/netoze-capture-helper/);
  assert.doesNotMatch(postinst, /netoze-desktop|\/usr\/bin\//);
});

test('AppImage configuration has no privileged helper payload or maintainer script', () => {
  assert.equal(linuxConfig.bundle.linux.deb.postInstallScript, 'install/linux-postinst.sh');
  assert.equal(Object.prototype.hasOwnProperty.call(linuxConfig.bundle.linux, 'appimage'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(linuxConfig.bundle, 'files'), false);
});
