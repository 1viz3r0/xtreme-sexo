import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFile(join(root, path), 'utf8');

const html = await read('landing-page/index.html');
const auth = await read('landing-page/thankyou.js');
const css = await read('landing-page/styles.css');
const netlify = await read('netlify.toml');

assert.match(html, /data-auth-dialog/);
assert.match(html, /data-signup-otp-form/);
assert.match(html, /data-download-link=/);
assert.match(html, /<button[^>]+data-download-link=/);
assert.match(html, /github\.com\/1viz3r0\/xtreme-sexo\/raw\/master\/public\/netoze-icon\.png/);
assert.doesNotMatch(html, /href="javascript:void\(0\)"/);
assert.match(auth, /email_confirmed_at/);
assert.match(auth, /type: 'sms'/);
assert.doesNotMatch(auth, /phone_change/);
assert.match(auth, /ThankYou\.txt/);
assert.match(auth, /NET0ZE will be out soon/);
assert.match(auth, /button\[data-download-link\]/);
assert.doesNotMatch(auth, /pending\.link|finishPendingDownload/);
assert.match(css, /download-gated\[aria-disabled="true"\]/);
assert.match(netlify, /publish = "landing-page"/);
assert.match(netlify, /scripts\/build-landing-page\.mjs/);
assert.match(html, /github\.com\/1viz3r0\/xtreme-sexo/);
await assert.rejects(access(join(root, 'landing-page/ThankYou.txt')));

const temp = await mkdtemp(join(tmpdir(), 'netoze-auth-test-'));
const configPath = join(temp, 'auth-config.js');
try {
  await exec('node', ['scripts/build-landing-page.mjs'], {
    cwd: root,
    env: { ...process.env, NETOZE_AUTH_CONFIG_PATH: configPath, NETOZE_SUPABASE_URL: 'https://demo.supabase.co', NETOZE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_demo' },
  });
  const generated = await readFile(configPath, 'utf8');
  assert.match(generated, /demo\.supabase\.co/);
  assert.match(generated, /sb_publishable_demo/);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log('landing-page download/auth checks passed');
