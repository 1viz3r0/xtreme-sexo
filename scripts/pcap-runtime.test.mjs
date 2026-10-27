import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = process.env.CARGO_TARGET_DIR ?? path.join(root, 'src-tauri/target');
const binary = process.env.NETOZE_WINDOWS_BINARY ?? [
  path.join(target, 'x86_64-pc-windows-msvc/release/netoze-desktop.exe'),
  path.join(target, 'release/netoze-desktop.exe'),
].find(existsSync);

test('Windows PE defers capture imports and every deferred symbol has a runtime guard', {
  skip: !binary && 'requires a Windows desktop build; not Windows runtime acceptance',
}, () => {
  const bytes = readFileSync(binary);
  assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  const pe = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.toString('ascii', pe, pe + 4), 'PE\0\0');
  const sectionCount = bytes.readUInt16LE(pe + 6);
  assert.ok(sectionCount > 0 && sectionCount < 100);
  const optional = pe + 24;
  assert.equal(bytes.readUInt16LE(optional), 0x20b, 'the desktop payload must be PE32+');
  const sections = optional + bytes.readUInt16LE(pe + 20);
  const offset = (rva) => {
    for (let i = 0; i < sectionCount; i++) {
      const section = sections + i * 40;
      const address = bytes.readUInt32LE(section + 12);
      const size = bytes.readUInt32LE(section + 16);
      if (rva >= address && rva - address < size) {
        const result = bytes.readUInt32LE(section + 20) + rva - address;
        assert.ok(result < bytes.length);
        return result;
      }
    }
    assert.fail(`Unmapped PE RVA ${rva}`);
  };
  const cstring = (rva) => {
    const start = offset(rva);
    const end = bytes.indexOf(0, start);
    assert.ok(end >= start && end - start < 512, 'bounded PE import name');
    return bytes.toString('ascii', start, end);
  };
  const imports = (index, stride, nameField) => {
    const directory = optional + 112 + index * 8;
    const rva = bytes.readUInt32LE(directory);
    if (!rva) return [];
    const size = bytes.readUInt32LE(directory + 4);
    const records = [];
    for (let i = 0; i + stride <= size; i += stride) {
      const record = offset(rva + i);
      const name = bytes.readUInt32LE(record + nameField);
      if (!name) break;
      records.push({ name: cstring(name).toLowerCase(), record });
    }
    return records;
  };
  const eager = imports(1, 20, 12);
  assert.ok(!eager.some(({ name }) => name === 'wpcap.dll' || name === 'packet.dll'),
    'missing Npcap must not prevent the Windows loader from reaching main');
  const deferred = imports(13, 32, 4).find(({ name }) => name === 'wpcap.dll');
  assert.ok(deferred, 'Npcap calls must use the delay-import table');
  assert.equal(bytes.readUInt32LE(deferred.record) & 1, 1, 'delay descriptors must use RVAs');
  const names = bytes.readUInt32LE(deferred.record + 16);
  const source = readFileSync(path.join(root, 'src-tauri/src/platform/capture.rs'), 'utf8');
  const guarded = new Set([...source.matchAll(/b"(pcap_[a-z_]+)\\0"/g)].map((match) => match[1]));
  let count = 0;
  for (; count < 256; count++) {
    const name = bytes.readBigUInt64LE(offset(names + count * 8));
    if (name === 0n) break;
    assert.equal(name >> 63n, 0n, 'ordinal-only imports require an explicit guard review');
    assert.ok(name < 0x100000000n);
    const symbol = cstring(Number(name) + 2);
    assert.ok(guarded.has(symbol), `Missing pre-call export guard for ${symbol}`);
  }
  assert.ok(count > 0 && count < 256);
});
