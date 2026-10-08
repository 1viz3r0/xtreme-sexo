import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function formatIndiaTime(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} IST (+05:30)`;
}

export function recordBackendActivity(message) {
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  appendFileSync(path.join(root, 'docs/BACKEND_LOGBOOK_IST.md'), `\n### ${formatIndiaTime()}\n\n${message.trim()}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const message = process.argv.slice(2).join(' ').trim();
  if (!message) { console.error('Provide a backend activity description'); process.exitCode = 1; }
  else { recordBackendActivity(message); console.log('Backend activity recorded in Indian Standard Time'); }
}
