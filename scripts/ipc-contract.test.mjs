import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('literal frontend IPC commands have registered native handlers', () => {
  const backend = readFileSync(new URL('../src-tauri/src/lib.rs', import.meta.url), 'utf8');
  const registered = new Set([...backend.matchAll(/commands(?:::\w+)*::(\w+)/g)].map((m) => m[1]));
  const directory = new URL('../src/', import.meta.url);
  const missing = [];
  for (const name of readdirSync(directory, { recursive: true }).filter((name) => /\.tsx?$/.test(name))) {
    const source = readFileSync(new URL(name, directory), 'utf8');
    for (const match of source.matchAll(/invoke(?:<[^>]+>)?\(['"]([^'"]+)/g)) {
      if (!registered.has(match[1])) missing.push(`${name}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
