import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScanBuddyMasteryLab, ScanBuddyMiniPanel } from './ScanBuddyMasteryLab'

test('mastery lab explains the safe workflow and exposes a mountable mini panel', () => {
  const markup = renderToStaticMarkup(createElement(ScanBuddyMasteryLab, { available: false }))
  for (const text of ['Purpose', 'Authorization', 'Preview', 'Bounded run', 'History', 'Theory', 'Practice', 'Observe in the live panel', 'Real-world note', 'Exercises', 'no simulated results', 'Start bounded scan', 'No native jobs loaded yet']) assert.match(markup, new RegExp(text, 'i'))
  assert.match(markup, /Scan Buddy mini panel/)
})

test('mini panel keeps the authorization checkbox and actions unavailable outside native desktop', () => {
  const markup = renderToStaticMarkup(createElement(ScanBuddyMiniPanel, { available: false }))
  assert.match(markup, /Desktop required/)
  assert.match(markup, /No simulated results are shown/)
  assert.match(markup, /type="checkbox" disabled=""/)
  assert.match(markup, /Start bounded scan[^<]*<\/button>/)
})
