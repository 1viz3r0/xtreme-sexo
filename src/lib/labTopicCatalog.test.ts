import test from 'node:test'
import assert from 'node:assert/strict'
import { LAB_TOPIC_CATALOG } from './labTopicCatalog'

test('catalog has three available original CTFs and one explicitly planned domain', () => {
   assert.equal(LAB_TOPIC_CATALOG.length, 8)
    assert.deepEqual(LAB_TOPIC_CATALOG.filter(lab => lab.status === 'available').map(lab => [lab.id, lab.category, lab.stage]), [['web-exposure', 'Web', 'Easy'], ['network-enumeration', 'Network', 'Easy'], ['linux-permissions', 'Linux', 'Medium'], ['header-trail', 'Web', 'Easy'], ['protocol-archive', 'Network', 'Hard'], ['first-contact', 'Web', 'Easy'], ['service-signals', 'Network', 'Easy']])
   assert.deepEqual(LAB_TOPIC_CATALOG.filter(lab => lab.status === 'planned').map(lab => lab.category), ['Forensics'])
   assert.deepEqual(new Set(LAB_TOPIC_CATALOG.map(lab => lab.stage)), new Set(['Easy', 'Medium', 'Hard']))
   for (const topic of LAB_TOPIC_CATALOG) { assert.ok(topic.steps.length > 0); assert.ok(topic.walkthroughPrompts.length > 0); assert.match(topic.stageLabel, new RegExp(topic.stage)) }
  assert.doesNotMatch(JSON.stringify(LAB_TOPIC_CATALOG), /red-|blue-|track|Purple|TryHackMe|Hack The Box/i)
  assert.match(LAB_TOPIC_CATALOG[0].description, /original NET0ZE HTTP/i)
  assert.ok(Object.isFrozen(LAB_TOPIC_CATALOG))
})
