import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordBackendActivity } from './backend-logbook.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.platform === 'win32' ? 'windows' : process.platform;
const target = process.argv[2] ?? host;
const cross = target === 'windows' && host === 'linux' && process.argv.includes('--cross');
const windowsTriple = 'x86_64-pc-windows-msvc';
const backendOnly = process.argv.includes('--backend-only');
if (backendOnly && !existsSync(path.join(root, 'dist/index.html'))) {
  console.error('Backend-only build requires the existing packaged UI in dist/.');
  process.exit(1);
}
if (!['windows', 'linux'].includes(target) || (target !== host && !cross)) {
  console.error(`Build ${target} on its native OS. The desktop workflow builds Windows and Linux concurrently from the same source.`);
  process.exit(1);
}

const env = { ...process.env };
// Reuse an already prepared, project-local toolchain when system installation
// was unavailable. Nothing is downloaded or installed by this build helper.
const tooling = path.join(root, 'target/native-tooling');
const localCargo = path.join(tooling, 'netoze-toolchain/cargo');
if (host === 'linux' && spawnSync('cargo', ['--version'], { env, stdio: 'ignore' }).status !== 0 && existsSync(path.join(localCargo, 'bin/cargo'))) {
  env.CARGO_HOME = localCargo;
  env.RUSTUP_HOME = path.join(tooling, 'netoze-toolchain/rustup');
  env.PATH = `${path.join(localCargo, 'bin')}${path.delimiter}${env.PATH ?? ''}`;
}
const sysroot = path.join(tooling, 'netoze-sysroot');
if (target === 'linux' && existsSync(sysroot) && spawnSync('pkg-config', ['--exists', 'gtk+-3.0', 'webkit2gtk-4.1', 'libpcap'], { env, stdio: 'ignore' }).status !== 0) {
  env.PKG_CONFIG_PATH = [path.join(sysroot, 'usr/lib/x86_64-linux-gnu/pkgconfig'), path.join(sysroot, 'usr/share/pkgconfig'), env.PKG_CONFIG_PATH].filter(Boolean).join(path.delimiter);
  env.PKG_CONFIG_SYSROOT_DIR = sysroot;
  env.PATH = `${path.join(sysroot, 'usr/bin')}${path.delimiter}${env.PATH ?? ''}`;
  env.CARGO_BUILD_JOBS ??= '1';
}
if (cross) {
  const tools = path.join(tooling, 'netoze-windows-tools');
  env.PATH = [tools, path.join(tools, 'usr/lib/llvm-21/bin'), env.PATH].join(path.delimiter);
  env.XWIN_CACHE_DIR ??= path.join(tooling, 'netoze-xwin-sdk');
  const localLibs = path.join(tools, 'npcap-sdk/Lib/x64');
  if (existsSync(path.join(localLibs, 'wpcap.lib'))) env.LIBPCAP_LIBDIR ??= localLibs;
  env.CARGO_BUILD_JOBS ??= '1';
}
if (target === 'windows' && !env.LIBPCAP_LIBDIR) {
  const sdk = env.NPCAP_SDK ?? 'C:\\npcap';
  const libs = path.join(sdk, 'Lib', process.arch === 'arm64' ? 'ARM64' : 'x64');
  if (!existsSync(path.join(libs, 'wpcap.lib'))) {
    console.error('Npcap SDK not found. Set LIBPCAP_LIBDIR to the SDK import-library directory.');
    process.exit(1);
  }
  env.LIBPCAP_LIBDIR = libs;
}

function run(command, args, commandEnv = env) {
  const result = spawnSync(command, args, { cwd: root, env: commandEnv, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) {
    recordBackendActivity(`FAILED: ${target} desktop build step ${path.basename(command)} (exit ${result.status ?? 'launch error'}). Inspect the build output for details.`);
    process.exit(result.status || 1);
  }
}

recordBackendActivity(`STARTED: ${target}${cross ? ' cross' : ''} desktop build; ${backendOnly ? 'backend-only, reusing packaged frontend' : 'full packaged application'}.`);
run('cargo', ['--version']);
if (target === 'linux') run('cargo', ['build', '--manifest-path', 'src-tauri/Cargo.toml', '--release', '--bin', 'netoze-capture-helper']);
// Tauri's beforeBuildCommand builds the shared UI before each native bundle.
const bundleArgs = target === 'linux' ? ['--bundles', 'deb'] : [];
run(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build', ...(backendOnly ? ['--config', JSON.stringify({ build: { beforeBuildCommand: null } })] : []), ...bundleArgs, ...(cross ? ['--runner', 'cargo-xwin', '--target', windowsTriple, '--bundles', 'nsis'] : [])]);
if (target === 'linux') {
  // linuxdeploy's GTK plugin must see host paths; the sysroot variables are
  // needed for compilation but make the plugin prepend the sysroot to AppDir.
  const packagingEnv = { ...env };
  delete packagingEnv.PKG_CONFIG_SYSROOT_DIR;
  delete packagingEnv.PKG_CONFIG_PATH;
  delete packagingEnv.LD_LIBRARY_PATH;
  run(process.execPath, [path.join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'bundle', '--bundles', 'appimage'], packagingEnv);
}
run(process.execPath, [path.join(root, 'scripts/stage-native-release.mjs'), target, ...(cross ? ['--target', windowsTriple, '--formats', 'nsis'] : [])]);
recordBackendActivity(`COMPLETED: ${target}${cross ? ' NSIS-only cross' : ''} desktop build and artifact staging. See releases/${target}/ and its manifest for exact files and checksums. Runtime validation is a separate check.`);
