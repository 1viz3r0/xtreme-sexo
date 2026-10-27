import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LearningLabsView } from './LearningLabsView';

test('Learning Labs exposes a separate beginner path with honest runtime boundaries', () => {
  const markup = renderToStaticMarkup(React.createElement(LearningLabsView, { profileScope: 'fixture' }));
  assert.match(markup, /Learning Labs/);
  assert.match(markup, /guided exercises/);
  assert.match(markup, /Read your local interface/);
  assert.match(markup, /Trace an HTTP request/);
  assert.match(markup, /Build a reproducible evidence note/);
  assert.match(markup, /Preview an authorized TCP check/);
  assert.match(markup, /do not fabricate packets, scans, or targets/);
  assert.match(markup, /Progress is saved locally/);
  assert.doesNotMatch(markup, /NET0ZE\{/);
});
