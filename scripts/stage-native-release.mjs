import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function stageNativeRelease(root, platform, arch = process.arch, options = {}) {
  const allowed = platform === 'windows' ? { nsis: '.exe', msi: '.msi' } : platform === 'linux' ? { deb: '.deb', appimage: '.AppImage' } : null;
  if (!allowed) throw new Error(`Unsupported native release platform: ${platform}`);
  const formats = options.formats ?? Object.keys(allowed);
  if (!formats.length || formats.some((format) => !Object.hasOwn(allowed, format))) throw new Error('Invalid installer format for platform');
  const extensions = formats.map((format) => allowed[format]);
  const triple = options.targetTriple;
  if (triple && !/^[a-z0-9_]+(?:-[a-z0-9_]+)+$/.test(triple)) throw new Error('Invalid native target triple');
  const config = JSON.parse(readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const targetDir = process.env.CARGO_TARGET_DIR
    ? path.resolve(root, process.env.CARGO_TARGET_DIR)
    : path.join(root, 'src-tauri/target');
  const bundleDir = path.join(targetDir, ...(triple ? [triple] : []), 'release/bundle');
  const artifacts = [];
  for (const folder of formats) {
    const dir = path.join(bundleDir, folder);
    if (!existsSync(dir)) throw new Error(`Missing native bundle directory: ${dir}`);
    for (const name of readdirSync(dir)) {
      const source = path.join(dir, name);
      if (name.endsWith(allowed[folder]) && name.includes(config.version) && statSync(source).isFile()) {
        artifacts.push({ source, name });
      }
    }
  }
  for (const extension of extensions) {
    if (!artifacts.some(({ name }) => name.endsWith(extension))) throw new Error(`Missing ${platform} ${extension} artifact for version ${config.version}`);
  }
  // Validate every requested format before writing anything. Defaults require
  // both installers; cross-built NSIS-only output must be explicitly requested.
  const destination = path.join(root, 'releases', platform, `${config.version}-${arch}`);
  mkdirSync(destination, { recursive: true });
  const files = artifacts.map(({ source, name }) => {
    copyFileSync(source, path.join(destination, name));
    return { name, bytes: statSync(source).size, sha256: createHash('sha256').update(readFileSync(source)).digest('hex') };
  });
  writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ product: config.productName, version: config.version, platform, arch, target: triple ?? null, formats, generated_at: new Date().toISOString(), files }, null, 2));
  return { destination, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let index = 3; index < process.argv.length; index += 2) {
      const value = process.argv[index + 1];
      if (!value) throw new Error('Missing staging option value');
      if (process.argv[index] === '--target') options.targetTriple = value;
      else if (process.argv[index] === '--formats') options.formats = value.split(',');
      else throw new Error(`Unknown staging option: ${process.argv[index]}`);
    }
    const arch = options.targetTriple?.startsWith('x86_64-') ? 'x64' : process.arch;
    const result = stageNativeRelease(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), process.argv[2] ?? (process.platform === 'win32' ? 'windows' : process.platform), arch, options);
    console.log(`Staged ${result.files.length} native installers in ${result.destination}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
