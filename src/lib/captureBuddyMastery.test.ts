import assert from 'node:assert/strict'
import test from 'node:test'
import { captureBuddyMasteryStepAt, CAPTURE_BUDDY_MASTERY_STEPS, captureDurationError } from './captureBuddyMastery'

test('Capture Buddy mastery covers the requested safe workflow', () => {
  assert.deepEqual(CAPTURE_BUDDY_MASTERY_STEPS.map(step => step.id), ['purpose', 'authorization', 'readiness', 'workflow', 'evidence', 'boundaries'])
  for (const step of CAPTURE_BUDDY_MASTERY_STEPS) {
    assert.ok(step.theory.length > 80)
    assert.ok(step.practice.length >= 2)
    assert.ok(step.observe.length >= 2)
    assert.ok(step.realWorldNote.length > 40)
  }
  assert.match(CAPTURE_BUDDY_MASTERY_STEPS[0].theory, /interface|visibility/i)
  assert.match(CAPTURE_BUDDY_MASTERY_STEPS[2].theory, /header|metadata|payload/i)
  assert.match(CAPTURE_BUDDY_MASTERY_STEPS[3].theory, /timing|duration/i)
  assert.match(CAPTURE_BUDDY_MASTERY_STEPS[4].theory, /protocol/i)
  assert.match(captureBuddyMasteryStepAt(99).lesson, /sensitive|review/i)
})

test('tutorial duration stays bounded', () => {
  assert.equal(captureDurationError('60'), null)
  assert.match(captureDurationError('0')!, /1–300/)
  assert.match(captureDurationError('301')!, /1–300/)
  assert.match(captureDurationError('later')!, /whole number/)
})
