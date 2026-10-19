import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { awardLabBadge, loadLabBadges } from './labBadges'

test('lab badges are free, scoped, persistent, and awarded once', () => {
  const browser = new Window()
  const previous = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: browser.localStorage })
  try {
    const first = awardLabBadge('scan-buddy-master', 'user-1')
    const second = awardLabBadge('scan-buddy-master', 'user-1')
    assert.equal(first.earnedAt, second.earnedAt)
    assert.equal(loadLabBadges('user-1').length, 1)
    assert.equal(loadLabBadges('user-2').length, 0)
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previous })
  }
})
