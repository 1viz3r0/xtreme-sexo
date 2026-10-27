import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.NETOZE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const key = process.env.NETOZE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
const destination = process.env.NETOZE_AUTH_CONFIG_PATH ?? resolve('landing-page/auth-config.js');

if (!url || !key) {
  console.warn('NET0ZE auth config is not set; optional account features remain unavailable, but release downloads stay available.');
  process.exit(0);
}

if (key.includes('service_role') || key.startsWith('sb_secret_')) {
  throw new Error('Refusing to publish a Supabase service or secret key to the browser.');
}

const output = `/* generated during the landing-page build; browser-safe values only */\nwindow.NET0ZE_AUTH_CONFIG = Object.freeze(${JSON.stringify({ supabaseUrl: url, supabasePublishableKey: key }, null, 2)});\n`;
await writeFile(destination, output, 'utf8');
console.log(`Wrote public NET0ZE auth config to ${destination}`);
