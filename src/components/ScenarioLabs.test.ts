import test from 'node:test'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { ScenarioLabs } from './ScenarioLabs'
import { LabRuntimeWorkspace } from './LabRuntimeWorkspace'
import { createLabRuntimeAdapter, type LabRuntimeAdapter, type LabRuntimeStatus } from '../services/tauri/labRuntime'

const setup: LabRuntimeStatus = { running: false, labId: null, phase: 'setup-required', targetUrl: null, consoleAddr: null, message: 'Docker engine unavailable', runtime: 'docker', completed: false }
const running: LabRuntimeStatus = { ...setup, running: true, labId: 'web-exposure', phase: 'running', targetUrl: 'http://127.0.0.1:42000/', message: 'Target ready' }
function mock() {
  let current = setup
  const calls: unknown[] = []
  const adapter = createLabRuntimeAdapter(async <T>(command: string, args?: Record<string, unknown>) => {
    calls.push([command, args])
    if (command === 'lab_runtime_start' || command === 'lab_runtime_reset') current = running
    if (command === 'lab_runtime_action') current = { ...running, completed: true, message: 'Flag accepted' }
    if (command === 'lab_runtime_stop') current = { ...setup, phase: 'stopped', message: 'Stopped' }
    return current as T
  })
  return { adapter, calls }
}
test('CTF arena presents an honest practical Web Exposure briefing', () => {
  const markup = renderToStaticMarkup(createElement(ScenarioLabs, { runtimeAdapter: mock().adapter }))
   assert.match(markup, /CTF Arena/); assert.match(markup, /Browse CTF catalog/); assert.match(markup, /Open selected room/); assert.match(markup, /CHALLENGE WORKFLOW/)
    assert.match(markup, /id="ctf-catalog"/); assert.match(markup, /CTF catalog/); assert.match(markup, /Room index/); assert.match(markup, /New beginner rooms/); assert.match(markup, /ROOM \/\/ first-contact/); assert.match(markup, /ROOM \/\/ service-signals/); assert.match(markup, /Web Exposure/); assert.match(markup, /First Contact/); assert.match(markup, /Service Signals/); assert.match(markup, /Ready to provision/); assert.match(markup, /Planned/); assert.match(markup, /Practical CTFs/)
    for (const label of ['Web', 'Network', 'Linux', 'Forensics', 'Easy', 'Medium', 'Hard']) assert.match(markup, new RegExp(label))
    for (const id of ['web-exposure', 'network-enumeration', 'linux-permissions', 'header-trail', 'protocol-archive', 'first-contact', 'service-signals', 'forensics-timeline']) assert.match(markup, new RegExp(`ROOM \\/\\/ ${id}`))
   for (const label of ['Investigation objective', 'Target surface', '/robots.txt', '/api/releases', 'Investigation checklist', 'Evidence notes', 'Challenge guidance', 'Walkthrough prompts']) assert.match(markup, new RegExp(label.replace('/', '\\/')))
   assert.doesNotMatch(markup, /Working|Red Team|Blue Team|red-|blue-|Purple|asset-aurora|NET0ZE\{|emerald-|amber-|fuchsia-|violet-|cyan-/)
})
test('setup guidance precedes confirmed start and backend-verified flag completion', async () => {
  const fixture = mock()
  await mounted(fixture.adapter, async host => {
    assert.match(host.textContent ?? '', /Docker setup/)
    assert.match(host.textContent ?? '', /28 or newer/)
    assert.doesNotMatch(host.textContent ?? '', /Working/)
    const click = async (text: string) => { const b = [...host.querySelectorAll('button')].find(item => item.textContent === text) as HTMLButtonElement; assert.equal(b.disabled, false); await act(async () => b.click()) }
     await click('Start selected CTF')
    assert.ok(fixture.calls.some(call => JSON.stringify(call) === JSON.stringify(['lab_runtime_start', { labId: 'web-exposure' }])))
    assert.match(host.textContent ?? '', /Working/)
    assert.match(host.textContent ?? '', /curl -i http:\/\/127.0.0.1:42000\//)
     assert.equal(host.querySelectorAll('input[type="checkbox"]').length, 5)
    const notes = host.querySelector('[aria-label="Evidence notes"]') as HTMLTextAreaElement
    assert.ok(notes)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(notes, 'robots.txt points to the site map')
      notes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    assert.equal(notes.value, 'robots.txt points to the site map')
    const input = host.querySelector('[aria-label="Discovered flag"]') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'my-discovered-value')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('Submit flag')
    assert.ok(fixture.calls.some(call => JSON.stringify(call) === JSON.stringify(['lab_runtime_action', { action: { action: 'submit_flag', flag: 'my-discovered-value' } }])))
    assert.match(host.textContent ?? '', /Completed — flag accepted/)
    assert.equal(input.value, '')
     await click('Open target'); await click('Reset CTF'); await click('Stop CTF')
    assert.equal(host.querySelector('[aria-label="Target URL"]'), null)
    assert.doesNotMatch(host.textContent ?? '', /Working/)
  })
})
test('category and stage filters expose planned CTFs and empty results', async () => {
  await mounted(mock().adapter, async host => {
    const change = async (label: string, value: string) => { const select = host.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement; await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) }) }
     assert.equal(host.querySelectorAll('[data-topic-id]').length, 8)
    await change('Category', 'Linux'); assert.equal(host.querySelectorAll('[data-topic-id]').length, 1)
     assert.match(host.querySelector('[data-topic-id]')?.textContent ?? '', /Ready to provision/)
      await change('Stage', 'Easy'); assert.equal(host.querySelectorAll('[data-topic-id]').length, 0)
      assert.match(host.textContent ?? '', /No CTFs match/)
  })
})
test('start returning setup-required never fabricates a running target', async () => {
  const adapter = { ...mock().adapter, start: async () => setup }
  await mounted(adapter, async host => {
      await act(async () => ([...host.querySelectorAll('button')].find(item => item.textContent === 'Start selected CTF') as HTMLButtonElement).click())
    assert.match(host.textContent ?? '', /Setup required/)
    assert.doesNotMatch(host.textContent ?? '', /Working/)
    assert.equal(host.querySelector('[aria-label="Target URL"]'), null)
    assert.equal(([...host.querySelectorAll('button')].find(item => item.textContent === 'Open target') as HTMLButtonElement).disabled, true)
  })
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const buttonNamed = (host: HTMLElement, name: string) => {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === name) as HTMLButtonElement
  assert.ok(button, name)
  return button
}
test('a background poll cannot swallow Stop or overwrite its newer stopped result', async () => {
  const poll = deferred<LabRuntimeStatus>(); const entered = deferred<void>()
  let reads = 0; let stops = 0
  let current = running
  const adapter = createLabRuntimeAdapter(async <T>(command: string) => {
    if (command === 'lab_runtime_status') { if (++reads === 2) { entered.resolve(); return await poll.promise as T } return current as T }
    if (command === 'lab_runtime_stop') { stops++; current = { ...setup, phase: 'stopped' } }
    return current as T
  })
  await mounted(adapter, async host => {
    await act(async () => { await entered.promise })
    await act(async () => buttonNamed(host, 'Stop CTF').click())
    assert.equal(stops, 0)
    await act(async () => poll.resolve(running))
    assert.equal(stops, 1)
    assert.equal(host.querySelector('[aria-label="Target URL"]'), null)
    assert.equal(host.querySelector('[role="alert"]'), null)
  }, { pollIntervalMs: 20 })
})
test('Stop remains available during startup and late startup results cannot revive its UI', async () => {
  const reply = deferred<LabRuntimeStatus>(); let stops = 0
  const adapter = createLabRuntimeAdapter(async <T>(command: string) => {
    if (command === 'lab_runtime_start') return await reply.promise as T
    if (command === 'lab_runtime_stop') { stops++; return { ...setup, phase: 'stopped' } as T }
    return setup as T
  })
  await mounted(adapter, async host => {
    await act(async () => buttonNamed(host, 'Start selected CTF').click())
    assert.equal(buttonNamed(host, 'Stop CTF').disabled, false)
    await act(async () => buttonNamed(host, 'Stop CTF').click())
    assert.equal(stops, 1)
    await act(async () => reply.resolve(running))
    assert.equal(host.querySelector('[aria-label="Target URL"]'), null)
    assert.doesNotMatch(host.textContent ?? '', /Working —/)
  })
})
test('CTF remount preserves the active room identity without stopping it', async () => {
  let stops = 0
  const adapter = { ...mock().adapter, status: async () => ({ ...running, labId: 'first-contact' }), stop: async () => { stops++; return setup } }
  await mounted(adapter, async host => {
    assert.equal(host.querySelector('[aria-label="Selected CTF runtime"] h2')?.textContent, 'First Contact runtime')
    assert.ok(host.querySelector('[aria-label="First Contact walkthrough"]'))
    assert.equal(stops, 0)
  }, { scenario: true })
})
test('console rooms display the actual mapped endpoint and startup completion after unmount is ignored', async () => {
  await mounted({ ...mock().adapter, status: async () => ({ ...running, labId: 'header-trail', consoleAddr: '127.0.0.1:42001' }) }, async host => {
    assert.equal((host.querySelector('[aria-label="TCP console"]') as HTMLInputElement).value, '127.0.0.1:42001')
    assert.match(host.textContent ?? '', /nc 127\.0\.0\.1 42001/)
  })
  const reply = deferred<LabRuntimeStatus>(); let stops = 0
  await mounted({ ...mock().adapter, start: () => reply.promise, stop: async () => { stops++; return setup } }, async host => {
    await act(async () => buttonNamed(host, 'Start selected CTF').click())
  })
  reply.resolve(running)
  await Promise.resolve()
  assert.equal(stops, 0)
})
async function mounted(adapter: LabRuntimeAdapter, run: (host: HTMLElement) => Promise<void>, options: { pollIntervalMs?: number; scenario?: boolean } = {}) {
  const browser = new Window({ url: 'http://localhost/' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Event', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? browser : (browser as unknown as Record<string, unknown>)[name] })
  const { createRoot } = await import('react-dom/client')
  const host = browser.document.createElement('div'); browser.document.body.append(host); const root = createRoot(host as unknown as Element)
  try { await act(async () => root.render(options.scenario ? createElement(ScenarioLabs, { runtimeAdapter: adapter }) : createElement(LabRuntimeWorkspace, { adapter, pollIntervalMs: options.pollIntervalMs ?? 60000 }))); await run(host as unknown as HTMLElement) }
  finally { await act(async () => root.unmount()); await browser.happyDOM.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) } }
}
