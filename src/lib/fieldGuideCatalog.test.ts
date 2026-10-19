import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CAREER_PATHS, CAREER_LEVELS, CAREER_PATHS, GUIDE_TOPICS, searchCareerPaths, topicsForCareer } from './fieldGuideCatalog';

test('field guide career map has valid topic links and meaningful milestones', () => {
  const ids = new Set(GUIDE_TOPICS.map(topic => topic.id));
  assert.ok(CAREER_PATHS.length >= 6);
  for (const path of CAREER_PATHS) {
    assert.ok(path.milestones.length >= 3);
    assert.ok(path.projects.length >= 1);
    assert.ok(path.tools.length >= 2);
    assert.ok(path.topics.every(topic => ids.has(topic)));
    assert.ok(topicsForCareer(path.id).length > 0);
  }
});

test('all career topics remain grounded in the approved field catalog', () => {
  const all = new Set(GUIDE_TOPICS.map(topic => topic.id));
  assert.deepEqual(new Set(CAREER_PATHS.flatMap(path => path.topics)).intersection(all), all);
});

test('career search matches role, skill, family, and level filters', () => {
  assert.ok(searchCareerPaths('cloud').some(path => path.id === 'cloud-security'));
  assert.ok(searchCareerPaths('detection').some(path => path.id === 'threat-hunter'));
  assert.ok(searchCareerPaths('', 'Application and Product Security').every(path => path.family === 'Application and Product Security'));
  assert.ok(searchCareerPaths('', 'all', 'entry').some(path => path.id === 'soc-analyst'));
});

test('expanded role directory keeps its expected size and covers every role family', () => {
  const rolePaths = ALL_CAREER_PATHS.filter(path => path.id.startsWith('role-'));
  const expectedFamilies = new Map([
    ['Security Operations and Monitoring', 'SOC Analyst Tier 1'],
    ['Network and Infrastructure Security', 'Network Security Engineer'],
    ['Incident Response and Digital Forensics', 'Incident Response Analyst'],
    ['Threat Intelligence and Threat Hunting', 'Threat Intelligence Analyst'],
    ['Offensive Security and Adversary Emulation', 'Penetration Tester'],
    ['Application and Product Security', 'Application Security Engineer'],
    ['Cloud, Platform, and DevSecOps', 'Cloud Security Engineer'],
    ['Identity and Access Security', 'IAM Analyst'],
    ['Governance, Risk, Compliance, and Privacy', 'GRC Analyst'],
    ['Research, Hardware, OT, Wireless, and Leadership', 'Malware Analyst'],
  ]);

   assert.ok(rolePaths.length >= 113);
   assert.equal(new Set(ALL_CAREER_PATHS.map(path => path.id)).size, ALL_CAREER_PATHS.length);
  for (const [family, title] of expectedFamilies) {
    assert.ok(rolePaths.some(path => path.family === family && path.title === title));
  }
});

test('every career family has searchable roles at every career level', () => {
  const families = new Set(ALL_CAREER_PATHS.filter(path => path.id.startsWith('role-') || path.id.startsWith('track-')).map(path => path.family));
  for (const family of families) {
    for (const level of CAREER_LEVELS) {
      assert.ok(searchCareerPaths('', family, level).some(path => path.family === family && path.level === level), `${family} is missing ${level}`);
    }
  }
});

test('expanded roles are searchable through aliases, tools, and skills', () => {
  assert.ok(searchCareerPaths('ciso').some(path => path.id === 'role-ciso'));
  assert.ok(searchCareerPaths('Wireshark').some(path => path.id === 'role-soc-analyst-tier-1'));
  assert.ok(searchCareerPaths('Evidence-based reporting').some(path => path.id === 'role-malware-analyst'));
});

test('expanded role profiles retain the metadata required by the detail view', () => {
   const rolePaths = ALL_CAREER_PATHS.filter(path => path.id.startsWith('role-') || path.id.startsWith('track-'));
  for (const path of rolePaths) {
    assert.ok(path.summary.length > 0);
    assert.ok(path.bestFor.length > 0);
    assert.ok(path.overview.length > 0);
    assert.ok(path.skills.length > 0);
    assert.ok(path.roadmap.length > 0);
    assert.ok(path.milestones.length > 0);
    assert.ok(path.projects.length > 0);
    assert.ok(path.tools.length > 0);
    assert.ok(path.workStyles.length > 0);
    assert.ok(path.environments.length > 0);
    assert.ok(path.ethics.length > 0);
    assert.ok(path.workflow.length >= 5);
    assert.ok(path.profileStatus === 'curated' || path.profileStatus === 'directory');
    assert.ok(path.sources.length > 0);
  }
});

test('the role profile is a first-class workflow view for more than fifty jobs', () => {
  const rolePaths = ALL_CAREER_PATHS.filter(path => path.id.startsWith('role-'));
  assert.ok(rolePaths.length >= 50);
  assert.ok(rolePaths.every(path => path.workflow.length === 5));
  assert.ok(rolePaths.some(path => path.title === 'Firewall Engineer' && path.profileStatus === 'curated'));
  assert.ok(rolePaths.some(path => path.title === 'Detection Engineer' && path.profileStatus === 'curated'));
});
