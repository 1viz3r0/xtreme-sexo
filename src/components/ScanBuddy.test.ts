import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScanBuddy } from './ScanBuddy';

test('SSR renders explicit desktop-only state, unchecked consent and disabled scan actions', () => {
  const markup = renderToStaticMarkup(createElement(ScanBuddy));
  assert.ok(markup.includes('Scan Buddy is unavailable in browser mode'));
  assert.ok(markup.includes('No simulated results or browser scanning'));
  assert.match(markup, /<input type="checkbox" disabled=""/);
  assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);
  assert.ok(markup.includes('Start TCP scan'));
  assert.ok(markup.includes('Jobs continue when you leave this view'));
  assert.ok(markup.includes('TCP connect only'));
});
