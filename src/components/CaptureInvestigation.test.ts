import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaptureInvestigation } from './CaptureInvestigation';

test('renders a native-only empty state during SSR without browser capture data', () => {
  const html = renderToStaticMarkup(React.createElement(CaptureInvestigation, { sessionId: 'session-1' }));
  assert.match(html, /Capture Investigation/);
  assert.match(html, /no simulated browser data/);
  assert.doesNotMatch(html, /role="tabpanel"|role="tablist"/);
  assert.match(html, /Endpoints and exported metadata may be sensitive/);
});
