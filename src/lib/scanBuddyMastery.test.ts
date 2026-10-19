import test from 'node:test'
import assert from 'node:assert/strict'
import { masteryStepAt, SCAN_BUDDY_MASTERY_STEPS } from './scanBuddyMastery'

test('mastery curriculum covers the safe Scan Buddy learning path in order', () => {
  assert.deepEqual(SCAN_BUDDY_MASTERY_STEPS.map(step => step.id), ['purpose', 'authorize', 'workflow', 'preview', 'bounded-run', 'history'])
  assert.ok(SCAN_BUDDY_MASTERY_STEPS.every(step => step.lesson.length > 40))
  assert.match(SCAN_BUDDY_MASTERY_STEPS[1].lesson, /permission/i)
  assert.match(SCAN_BUDDY_MASTERY_STEPS[3].lesson, /no network traffic/i)
  assert.match(SCAN_BUDDY_MASTERY_STEPS[4].lesson, /Cancel/i)
  assert.ok(SCAN_BUDDY_MASTERY_STEPS.every(step => step.theory && step.practice && step.observe && step.realWorldNote && step.exercises.length > 0))
  assert.match(SCAN_BUDDY_MASTERY_STEPS[0].theory, /three-way handshake/i)
  assert.match(SCAN_BUDDY_MASTERY_STEPS[2].theory, /Cartesian product/i)
  assert.match(SCAN_BUDDY_MASTERY_STEPS[4].theory, /CLOSED.*TIMEOUT/i)
})

test('lesson selection is clamped for embedders restoring progress', () => {
  assert.equal(masteryStepAt(-4).id, 'purpose')
  assert.equal(masteryStepAt(999).id, 'history')
})
