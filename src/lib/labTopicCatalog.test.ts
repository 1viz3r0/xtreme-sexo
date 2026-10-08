import test from 'node:test'
import assert from 'node:assert/strict'
import { LAB_TOPIC_CATALOG } from './labTopicCatalog'

test('compact catalog has one available Web exercise and three explicitly planned domains', () => {
  assert.equal(LAB_TOPIC_CATALOG.length, 4)
  assert.deepEqual(LAB_TOPIC_CATALOG.filter(lab => lab.status === 'available').map(lab => [lab.id, lab.category, lab.level]), [['web-exposure', 'Web', 'Beginner']])
  assert.deepEqual(LAB_TOPIC_CATALOG.filter(lab => lab.status === 'planned').map(lab => lab.category), ['Network', 'Linux', 'Forensics'])
  assert.deepEqual(new Set(LAB_TOPIC_CATALOG.map(lab => lab.level)), new Set(['Beginner', 'Intermediate', 'Advanced']))
  assert.doesNotMatch(JSON.stringify(LAB_TOPIC_CATALOG), /red-|blue-|track|Purple|TryHackMe|Hack The Box/i)
  assert.match(LAB_TOPIC_CATALOG[0].description, /original NET0ZE HTTP/i)
  assert.ok(Object.isFrozen(LAB_TOPIC_CATALOG))
})
