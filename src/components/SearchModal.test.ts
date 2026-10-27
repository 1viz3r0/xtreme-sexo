import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import { SearchModal } from './SearchModal';
import type { GeoSearchResult } from '../lib/geoSearch';

test('search retries failed data loads, cancels obsolete results and selects the current match', async context => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (window as unknown as Record<string, unknown>)[name],
  });
  let countryReads = 0;
  let release!: (response: Response) => void;
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/countries.json')) {
      countryReads++;
      if (countryReads === 1) return new Response('', { status: 503 });
      return new Promise<Response>(resolve => { release = resolve; });
    }
    return Response.json([]);
  });
  const errors = context.mock.method(console, 'error', () => {});
  const { createRoot } = await import('react-dom/client');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const picks: GeoSearchResult[] = [];
  let closed = 0;
  let unmounted = false;
  const render = async (isOpen: boolean) => { await act(async () => {
    root.render(React.createElement(SearchModal, { isOpen, onClose: () => { closed++; }, onSelectGeo: result => { picks.push(result); } }));
  }); };
  const type = async (query: string) => { await act(async () => {
    const input = host.querySelector('input');
    assert.ok(input);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, query);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }); };
  const settle = async () => { await act(async () => { await wait(250); }); };
  const countries = [
    { n: 'India', iso: 'IN', la: 20.6, lo: 78.9 },
    { n: 'Japan', iso: 'JP', la: 36.2, lo: 138.2 },
  ];
  try {
    await render(true);
    await type('India');
    await settle();
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? '', /search is unavailable/);
    await type('Japan');
    await settle();
    assert.equal(countryReads, 2, 'a rejected dataset promise must not permanently poison search');
    await type('India');
    await settle();
    await act(async () => { release(Response.json(countries)); });
    assert.match(host.textContent ?? '', /India/);
    assert.doesNotMatch(host.textContent ?? '', /Japan/, 'late results must not replace the current query');
    await act(async () => { host.querySelector('input')!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    assert.equal(picks.length, 1);
    assert.equal(picks[0].name, 'India');
    assert.equal(closed, 1);
    await type('Japan');
    await render(false);
    await settle();
    assert.equal(host.textContent, '');
    await render(true);
    assert.equal(host.querySelector('input')?.value, '', 'reopening starts with a clean query');
    await type('Japan');
    await act(async () => { root.unmount(); });
    unmounted = true;
    await settle();
    assert.equal(errors.mock.callCount(), 0, 'cancelled work must not update an unmounted component');
  } finally {
    if (!unmounted) await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
