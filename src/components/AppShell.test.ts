import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { TopNavbar } from './TopNavbar';
import { Sidebar } from './Sidebar';
import type { TabType } from './Sidebar';

const noop = () => {};
const headerProps = { onOpenSearch: noop, onOpenAuth: noop, onLogout: noop, user: null, isFullyHidden: false, setIsFullyHidden: noop };
const sidebarProps = { activeTab: 'conversations' as TabType, setActiveTab: noop, user: null, isCollapsed: false, setIsCollapsed: noop, isFullyHidden: false, setIsFullyHidden: noop };

test('Studio header and monitoring navigation are accessible and concise', () => {
  const header = renderToStaticMarkup(React.createElement(TopNavbar, headerProps));
  assert.match(header, /aria-label="NET0ZE application header"/);
  assert.match(header, /Studio UI/);
  assert.match(header, /Browser/);
  assert.match(header, /aria-label="Search locations"/);
  assert.match(header, /Sign in/);
  assert.equal((header.match(/<header/g) || []).length, 1);
  assert.doesNotMatch(header, /UTC|Host:|Detected|Unavailable|v2\.0\.0/);
  const sidebar = renderToStaticMarkup(React.createElement(Sidebar, sidebarProps));
  assert.match(sidebar, /aria-label="Primary navigation"/);
  assert.match(sidebar, /Monitoring/);
  assert.match(sidebar, /aria-label="Overview"/);
  assert.ok(sidebar.indexOf('Overview') < sidebar.indexOf('Watchtower'));
  assert.match(sidebar, /aria-label="Watchtower"/);
  assert.ok(sidebar.indexOf('Watchtower') < sidebar.indexOf('Capture Buddy'));
  assert.match(sidebar, /aria-current="page" aria-label="Capture Buddy"/);
  assert.ok(sidebar.indexOf('Capture Buddy') < sidebar.indexOf('Scan Buddy'));
   assert.ok(sidebar.indexOf('Scan Buddy') < sidebar.indexOf('Dashboard'));
   assert.match(sidebar, /aria-label="Dashboard"/);
   assert.match(sidebar, /aria-label="Labs"/);
   assert.ok(sidebar.indexOf('Labs') < sidebar.indexOf('Additional tools'));
   assert.doesNotMatch(sidebar, />Experimental</);
   assert.doesNotMatch(sidebar, /aria-label="Host &amp; Logs"/);
  assert.doesNotMatch(sidebar, /<details[^>]* open/);
  const experimental = sidebar.match(/<details class="studio-experimental"[\s\S]*?<\/details>/)?.[0] ?? '';
  assert.doesNotMatch(experimental, /aria-label="Overview"/);
  assert.doesNotMatch(sidebar, /aria-label="Users"/);
  const admin = renderToStaticMarkup(React.createElement(Sidebar, { ...sidebarProps, user: { name: 'Admin fixture', email: 'fixture@example.test', isVerified: true, role: 'admin' } }));
  assert.match(admin, /aria-label="Users"/);
  assert.equal(renderToStaticMarkup(React.createElement(Sidebar, { ...sidebarProps, isFullyHidden: true })), '');
});

test('App opens Capture Buddy while keeping overview search and authenticated routing', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /useState<TabType>\('conversations'\)/);
  assert.match(app, /const Watchtower = lazy\(\(\) => import\('\.\/components\/Watchtower'\)/);
  assert.match(app, /activeTab === 'watchtower'[\s\S]*?<Watchtower flows=\{flows\} events=\{events\} graph=\{graphData\} \/>/);
  assert.match(app, /activeTab === 'watchtower'[\s\S]*?flows: true, detections: true, graph: true/);
  assert.match(app, /activeTab === 'conversations'[\s\S]*?<CaptureBuddy \/>/);
  assert.match(app, /onOpenSearch=\{\(\) => \{ setActiveTab\('global_intel'\); setSearchOpenToken/);
  assert.match(app, /authSession\(stored\)/);
  assert.match(app, /authLogout\(stored\)/);
  assert.doesNotMatch(app, /animate-pulse/);
});

test('Studio shell uses a neutral monochrome palette', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const studioCss = css.slice(css.indexOf('/* Studio shell:'));
  assert.match(studioCss, /--studio-panel:\s*#141414/);
  assert.match(studioCss, /--studio-border:\s*#333333/);
  assert.match(css, /\.studio-brand-mark\s*\{[^}]*grayscale\(1\)/);
  assert.doesNotMatch(studioCss, /\b(?:blue|cyan|navy)\b/i);
  assert.doesNotMatch(studioCss, /#(?:101e34|293d59|0b1424|14233b|223c60|3c5b83|0e1b30|354b6b|93b7ff|27466f|4c74a9|a3c6ff|5275a2|1b2d49|22334d)/i);
});

test('mounted shell preserves navigation, hiding, search, sign-in and sign-out callbacks', async () => {
  const window = new Window({ url: 'http://localhost/' });
  const names = ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? window : (window as unknown as Record<string, unknown>)[name] });
  const { createRoot } = await import('react-dom/client');
  const host = window.document.createElement('div');
  window.document.body.append(host);
  const root = createRoot(host as unknown as Element);
  const calls: string[] = [];
  function ShellFixture() {
    const [tab, setTab] = React.useState<TabType>('conversations');
    const [hidden, setHidden] = React.useState(false);
    const [collapsed, setCollapsed] = React.useState(false);
    const [user, setUser] = React.useState<null | { name: string; email: string; isVerified: boolean; role: string }>(null);
    return React.createElement(React.Fragment, null,
      React.createElement(TopNavbar, { ...headerProps, user, isFullyHidden: hidden, setIsFullyHidden: setHidden,
        onOpenSearch: () => { calls.push('search'); setTab('global_intel'); },
        onOpenAuth: () => { calls.push('auth'); setUser({ name: 'Fixture', email: 'fixture@example.test', isVerified: true, role: 'admin' }); },
        onLogout: () => { calls.push('logout'); setUser(null); },
      }),
      React.createElement(Sidebar, { ...sidebarProps, user, activeTab: tab, setActiveTab: setTab, isFullyHidden: hidden, setIsFullyHidden: setHidden, isCollapsed: collapsed, setIsCollapsed: setCollapsed }),
    );
  }
  const click = async (label: string) => {
    const button = host.querySelector(`[aria-label="${label}"]`) || [...host.querySelectorAll('button')].find(element => element.textContent === label);
    assert.ok(button, `Missing ${label}`);
    await act(async () => { (button as unknown as { click: () => void }).click(); });
  };
  try {
    await act(async () => { root.render(React.createElement(ShellFixture)); });
    await click('Scan Buddy');
    assert.equal(host.querySelector('[aria-current="page"]')?.getAttribute('aria-label'), 'Scan Buddy');
    await click('Watchtower');
    assert.equal(host.querySelector('[aria-current="page"]')?.getAttribute('aria-label'), 'Watchtower');
    await click('Collapse navigation');
    assert.ok(host.querySelector('.studio-sidebar.is-collapsed'));
     await click('Dashboard');
     assert.equal(host.querySelector('[aria-current="page"]')?.getAttribute('aria-label'), 'Dashboard');
    await click('Hide navigation');
    assert.equal(host.querySelector('aside'), null);
    await click('Show navigation');
    await click('Search locations');
    assert.equal(host.querySelector('details')?.hasAttribute('open'), false);
    assert.equal(host.querySelector('[aria-current="page"]')?.getAttribute('aria-label'), 'Overview');
    await click('Sign in');
    assert.ok(host.querySelector('[aria-label="Users"]'));
    assert.match(host.textContent, /Admin/);
    await click('Sign out');
    assert.equal(host.querySelector('[aria-label="Users"]'), null);
    assert.deepEqual(calls, ['search', 'auth', 'logout']);
  } finally {
    await act(async () => { root.unmount(); });
    await window.happyDOM.close();
    for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  }
});
