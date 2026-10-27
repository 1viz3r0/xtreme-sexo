import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { CaptureBuddyMasteryLab, CaptureBuddyMiniPanel, type CaptureBuddyMiniPanelService, type CaptureBuddySession } from './CaptureBuddyMasteryLab'

function fixtureService() {
  const sessions = new Map<string, CaptureBuddySession>()
  const closed: string[] = []
  let next = 0
  const service: CaptureBuddyMiniPanelService = {
    engineStatus: async () => ({ available: true, live_capture_blocked: false, detail: 'Synthetic fixture', capture_guidance: null, visibility_scope: 'fixture', visibility_note: 'No live capture' }),
    interfaces: async () => ['1. synthetic'],
    start: async () => {
      if (sessions.size >= 8) throw new Error('Session limit reached')
      const value = { session_id: `fixture-${++next}`, path: '/synthetic/fixture.pcap', running: true, bytes: 24 }
      sessions.set(value.session_id, value)
      return { ...value }
    },
    stop: async id => { sessions.get(id)!.running = false },
    close: async id => { closed.push(id); sessions.delete(id) },
    status: async id => ({ ...sessions.get(id)! }),
    brief: async () => ({ packet_count: 0, captured_bytes: 0, wire_bytes: 0, protocols: [], observations: [] }),
  }
  return { service, sessions, closed }
}

async function mountedPanel(service: CaptureBuddyMiniPanelService) {
  const window = new Window({ url: 'http://localhost/' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? window : (window as unknown as Record<string, unknown>)[name] })
  const { createRoot } = await import('react-dom/client')
  const host = window.document.createElement('div')
  window.document.body.append(host)
  const root = createRoot(host as unknown as Element)
  const button = (name: string) => {
    const element = [...host.querySelectorAll('button')].find(button => button.textContent === name)
    assert.ok(element, `Missing ${name}: ${host.textContent}`)
    return element
  }
  await act(async () => root.render(createElement(CaptureBuddyMiniPanel, { service, available: true })))
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
  return {
    host, button,
    click: async (name: string) => { await act(async () => button(name).click()) },
    unmount: async () => { await act(async () => root.unmount()) },
    cleanup: async () => {
      await act(async () => root.unmount())
      await window.happyDOM.close()
      for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) }
    },
  }
}

test('tutorial reconciles automatic completion, closes replaced sessions and stops ownership on unmount', async context => {
  const fixture = fixtureService()
  const panel = await mountedPanel(fixture.service)
  context.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    await panel.click('Start bounded capture')
    fixture.sessions.get('fixture-1')!.running = false
    await act(async () => { context.mock.timers.tick(1000) })
    assert.match(panel.host.textContent!, /Native session: ready for review/)
    assert.equal(panel.button('Start bounded capture').disabled, false)
    for (let index = 0; index < 10; index++) {
      await panel.click('Start bounded capture')
      assert.equal(fixture.sessions.size, 1)
      await panel.click('Finish capture')
    }
    assert.doesNotMatch(panel.host.textContent!, /Session limit reached/)
    await panel.click('Start bounded capture')
    assert.equal([...fixture.sessions.values()][0].running, true)
    await panel.unmount()
    assert.equal(fixture.sessions.size, 0)
    assert.equal(fixture.closed.length, 12)
  } finally { context.mock.timers.reset(); await panel.cleanup() }
})

test('tutorial closes a late startup result after unmount and suppresses late state updates', async () => {
  const fixture = fixtureService()
  let resolve!: (value: CaptureBuddySession) => void
  fixture.service.start = () => new Promise(value => { resolve = value })
  const panel = await mountedPanel(fixture.service)
  try {
    await panel.click('Start bounded capture')
    await panel.unmount()
    const value = { session_id: 'late', path: '/synthetic/late.pcap', running: true, bytes: 24 }
    fixture.sessions.set(value.session_id, value)
    await act(async () => resolve(value))
    assert.deepEqual(fixture.closed, ['late'])
    assert.equal(fixture.sessions.size, 0)
  } finally { await panel.cleanup() }
})

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
