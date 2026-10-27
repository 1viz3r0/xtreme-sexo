import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { EduInspectorModal } from './EduInspectorModal';
import type { EduExplanation } from '../services/tauri/edu';

test('Field Guide labels unavailable guidance honestly and ignores stale native explanations', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name],
  });
  const { createRoot } = await import('react-dom/client');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const render = async (selectedField: string, currentValue: string) => { await act(async () => {
    root.render(React.createElement(EduInspectorModal, { selectedField, currentValue, onClose: () => {} }));
  }); };
  const pending: Array<{ fieldId: string; resolve: (value: EduExplanation) => void }> = [];
  const explanation = (field: string, title: string): EduExplanation => ({
    field_id: field, title, category: 'NETWORK', short_description: title,
    detailed_explanation: '', current_value: '', interpretation: '', status_level: 'OBSERVED',
    evidence: [], related_entities: [], analyst_next_steps: [],
  });
  try {
    await render('dst_port', '443');
    assert.match(host.textContent ?? '', /STATUS: UNAVAILABLE/);
    assert.match(host.textContent ?? '', /Native field guidance is unavailable/);
    assert.doesNotMatch(host.textContent ?? '', /STATUS: OBSERVED/);
    const skills = [...host.querySelectorAll('button')].find(button => button.textContent === 'Skill matrix');
    assert.ok(skills);
    await act(async () => { skills.click(); });
    assert.match(host.textContent ?? '', /Practice status: not assessed in NET0ZE/);
    assert.equal(host.querySelector('[style*="width:"]'), null, 'skill progress must not be fabricated');

    Object.assign(window, { __TAURI_INTERNALS__: { invoke: (command: string, args: { fieldId: string }) => {
      assert.equal(command, 'get_field_explanation');
      return new Promise<EduExplanation>(resolve => { pending.push({ fieldId: args.fieldId, resolve }); });
    } } });
    await render('src_ip', '192.0.2.1');
    await render('protocol', 'TCP');
    assert.deepEqual(pending.map(request => request.fieldId), ['src_ip', 'protocol']);
    await act(async () => { pending[1].resolve(explanation('protocol', 'Latest protocol explanation')); });
    assert.match(host.textContent ?? '', /Latest protocol explanation/);
    await act(async () => { pending[0].resolve(explanation('src_ip', 'STALE address explanation')); });
    assert.match(host.textContent ?? '', /Latest protocol explanation/);
    assert.doesNotMatch(host.textContent ?? '', /STALE address explanation/);
  } finally {
    await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
