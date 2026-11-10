#!/usr/bin/env node
/**
 * Sign the release update manifest.
 *
 * The manifest at the repository root (`update.json`) is the single source of
 * update policy consumed by the desktop client. The client installs an update
 * or enforces a mandatory gate only when BOTH conditions hold:
 *   1. `update.json` verifies with the embedded minisign/ed25519 public key.
 *   2. A previously-authenticated policy is cached in the app data directory.
 * An unsigned or invalidly-signed manifest is treated strictly as information.
 *
 * Usage (maintainer ceremony, run locally — never in CI):
 *   node scripts/sign-update-manifest.mjs \
 *     [--key <path>] [--out <repo-root/update.json>]
 *
 * Defaults:
 *   --key  ~/.local/share/netoze-update-signing/netoze-update
 *   --out  <repo-root>/update.json
 *
 * The signature is written next to the manifest as `update.json.sig`.
 * The private key must never be committed, and its password (if the key is
 * password-protected) is supplied via TAURI_SIGNING_PRIVATE_KEY_PASSWORD.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const keyPath = path.resolve(argOf('--key', path.join(os.homedir(), '.local/share/netoze-update-signing/netoze-update')));
const manifestPath = path.resolve(argOf('--out', path.join(repoRoot, 'update.json')));

if (!existsSync(manifestPath)) {
  console.error(`[sign-update-manifest] manifest not found: ${manifestPath}`);
  process.exit(1);
}
if (!existsSync(keyPath)) {
  console.error(`[sign-update-manifest] private signing key not found: ${keyPath}`);
  console.error('[sign-update-manifest] Generate it once with: tauri signer generate -w <key-path>');
  process.exit(1);
}

// Keep dotenv-style env handling out of the repo: the password comes from the
// environment or is empty (unencrypted key held under a 0700 personal folder).
const password = process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '';

const json = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (!json?.latest?.version || !json?.platforms) {
  console.error('[sign-update-manifest] manifest is missing required fields (latest.version / platforms)');
  process.exit(1);
}

const tauriBin = path.join(repoRoot, 'node_modules', '.bin', 'tauri');
if (!existsSync(tauriBin)) {
  console.error('[sign-update-manifest] tauri CLI not found at node_modules/.bin/tauri');
  process.exit(1);
}

const result = spawnSync(tauriBin, ['signer', 'sign', manifestPath], {
  encoding: 'utf8',
  env: {
    ...process.env,
    TAURI_SIGNING_PRIVATE_KEY_PATH: keyPath,
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

if (result.status !== 0) {
  console.error('[sign-update-manifest] tauri signer failed:');
  console.error((result.stderr || result.stdout || '').trim());
  process.exit(1);
}

const signaturePath = `${manifestPath}.sig`;
const signature = result.stdout?.trim();
if (signaturePath && existsSync(signaturePath)) {
  const stat = statSync(signaturePath);
  console.log(`[sign-update-manifest] signed ${path.basename(manifestPath)} (${stat.size} byte signature at ${signaturePath})`);
} else if (signature) {
  console.log('[sign-update-manifest] signature (write it to update.json.sig next to the manifest):');
  console.log(signature);
} else {
  console.error('[sign-update-manifest] signer produced no signature file');
  process.exit(1);
}

console.log('[sign-update-manifest] Remember: commit BOTH update.json and update.json.sig together,');
console.log('[sign-update-manifest] and keep the private key off this repository and out of CI logs.');
