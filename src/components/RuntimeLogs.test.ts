import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeLogs } from './RuntimeLogs';

test('browser log view reports native requirement and cannot export', () => {
  const html = renderToStaticMarkup(createElement(RuntimeLogs));
  assert.match(html, /Open the native desktop app/);
  assert.match(html, /Packet contents and credentials are excluded/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.doesNotMatch(html, /No operational events recorded yet/);
});
