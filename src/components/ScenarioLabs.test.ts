import test from 'node:test'
import assert from 'node:assert/strict'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Window } from 'happy-dom'
import { ScenarioLabs } from './ScenarioLabs'
import { LabRuntimeWorkspace } from './LabRuntimeWorkspace'
import { createLabRuntimeAdapter, type LabRuntimeAdapter, type LabRuntimeStatus } from '../services/tauri/labRuntime'

const setup: LabRuntimeStatus = { running: false, labId: null, phase: 'setup-required', targetUrl: null, message: 'Docker engine unavailable', runtime: 'docker', completed: false }
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
test('fresh compact catalog uses category and level, with no fabricated readiness or answers', () => {
  const markup = renderToStaticMarkup(createElement(ScenarioLabs, { runtimeAdapter: mock().adapter }))
  assert.match(markup, /Web Exposure/); assert.match(markup, /Ready to provision/); assert.match(markup, /Planned/)
  for (const label of ['Web', 'Network', 'Linux', 'Forensics', 'Beginner', 'Intermediate', 'Advanced']) assert.match(markup, new RegExp(label))
  assert.doesNotMatch(markup, /Working|Red Team|Blue Team|red-|blue-|Purple|asset-aurora|NET0ZE\{/)
})
test('setup guidance precedes confirmed start and backend-verified flag completion', async () => {
  const fixture = mock()
  await mounted(fixture.adapter, async host => {
    assert.match(host.textContent ?? '', /Docker setup/)
    assert.match(host.textContent ?? '', /28 or newer/)
    assert.doesNotMatch(host.textContent ?? '', /Working/)
    const click = async (text: string) => { const b = [...host.querySelectorAll('button')].find(item => item.textContent === text) as HTMLButtonElement; assert.equal(b.disabled, false); await act(async () => b.click()) }
    await click('Start')
    assert.ok(fixture.calls.some(call => JSON.stringify(call) === JSON.stringify(['lab_runtime_start', { labId: 'web-exposure' }])))
    assert.match(host.textContent ?? '', /Working/)
    assert.match(host.textContent ?? '', /curl -i http:\/\/127.0.0.1:42000\//)
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
    await click('Open target'); await click('Reset'); await click('Stop')
    assert.equal(host.querySelector('[aria-label="Target URL"]'), null)
    assert.doesNotMatch(host.textContent ?? '', /Working/)
  })
})
test('category and level filters expose planned labs and empty results', async () => {
  await mounted(mock().adapter, async host => {
    const change = async (label: string, value: string) => { const select = host.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement; await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) }) }
    assert.equal(host.querySelectorAll('[data-topic-id]').length, 4)
    await change('Category', 'Linux'); assert.equal(host.querySelectorAll('[data-topic-id]').length, 1)
    assert.match(host.querySelector('[data-topic-id]')?.textContent ?? '', /Planned/)
    await change('Level', 'Beginner'); assert.equal(host.querySelectorAll('[data-topic-id]').length, 0)
    assert.match(host.textContent ?? '', /No labs match/)
  })
})
test('start returning setup-required never fabricates a running target', async () => {
  const adapter = { ...mock().adapter, start: async () => setup }
  await mounted(adapter, async host => {
    await act(async () => ([...host.querySelectorAll('button')].find(item => item.textContent === 'Start') as HTMLButtonElement).click())
    assert.match(host.textContent ?? '', /Setup required/)
    assert.doesNotMatch(host.textContent ?? '', /Working/)
    assert.equal(host.querySelector('[aria-label="Target URL"]'), null)
    assert.equal(([...host.querySelectorAll('button')].find(item => item.textContent === 'Open target') as HTMLButtonElement).disabled, true)
  })
})
async function mounted(adapter: LabRuntimeAdapter, run: (host: HTMLElement) => Promise<void>) {
  const browser = new Window({ url: 'http://localhost/' })
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Event', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? browser : (browser as unknown as Record<string, unknown>)[name] })
  const { createRoot } = await import('react-dom/client')
  const host = browser.document.createElement('div'); browser.document.body.append(host); const root = createRoot(host as unknown as Element)
  try { await act(async () => root.render(createElement(LabRuntimeWorkspace, { adapter, pollIntervalMs: 60000 }))); await run(host as unknown as HTMLElement) }
  finally { await act(async () => root.unmount()); await browser.happyDOM.close(); for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name) } }
}
