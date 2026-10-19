import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CaptureBuddyMasteryLab, CaptureBuddyMiniPanel } from './CaptureBuddyMasteryLab'

test('mastery lab teaches capture authorization, review, and reporting boundaries', () => {
  const markup = renderToStaticMarkup(createElement(CaptureBuddyMasteryLab, { available: false }))
  for (const text of ['Purpose', 'Capture authorization', 'Interface.*readiness', 'Bounded capture', 'Evidence review', 'Export.*report boundaries', 'Theory', 'Practice', 'Observe in the live panel', 'Real-world note', 'No simulated packets']) assert.match(markup, new RegExp(text, 'i'))
  assert.match(markup, /Capture Buddy mini panel/)
})

test('mini panel is honest when native Capture Buddy is unavailable', () => {
  const markup = renderToStaticMarkup(createElement(CaptureBuddyMiniPanel, { available: false }))
  assert.match(markup, /Desktop required/)
  assert.match(markup, /No simulated packets are shown/)
  assert.match(markup, /explicit authorization/i)
  assert.match(markup, /Start bounded capture/)
})

test('live observation stays explicit about browser limitations', () => {
  const markup = renderToStaticMarkup(createElement(CaptureBuddyMasteryLab, { available: false }))
  assert.match(markup, /Browser mode has no native capture source/i)
  assert.match(markup, /There are no packets, interfaces, or readiness claims/i)
})
