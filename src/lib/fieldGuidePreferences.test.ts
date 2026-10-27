import assert from 'node:assert/strict';
import test from 'node:test';
import { ALL_CAREER_PATHS } from './fieldGuideCatalog';
import { loadFieldGuideCareer, saveFieldGuideCareer } from './fieldGuidePreferences';

test('career preferences accept catalog IDs, isolate scopes, and tolerate invalid or unavailable storage', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const key = 'netoze_field_guide_preferences_v1:guest';
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
  } });
  try {
    assert.equal(loadFieldGuideCareer(), 'explorer');
    for (const path of ALL_CAREER_PATHS) {
      saveFieldGuideCareer(path.id);
      assert.equal(loadFieldGuideCareer(), path.id);
    }
    saveFieldGuideCareer('soc-analyst', 'account-fixture');
    assert.equal(loadFieldGuideCareer('account-fixture'), 'soc-analyst');
    for (const raw of ['{', 'null', '{}', '{"careerId":123}', '{"careerId":"unknown-career"}']) {
      values.set(key, raw);
      assert.equal(loadFieldGuideCareer(), 'explorer');
    }
    saveFieldGuideCareer('explorer');
    const saved = values.get(key);
    saveFieldGuideCareer('unknown-career');
    assert.equal(values.get(key), saved, 'invalid writes must not overwrite valid preferences');
    assert.equal(loadFieldGuideCareer('account-fixture'), 'soc-analyst');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage disabled'); } });
    assert.equal(loadFieldGuideCareer(), 'explorer');
    assert.doesNotThrow(() => saveFieldGuideCareer('explorer'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
