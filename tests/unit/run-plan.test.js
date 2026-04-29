'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const {
  applyPageLimit,
  normaliseSpecPattern,
  prepareRunManifestPayload,
  selectProjects,
  selectSpecTargets,
} = require('../../utils/run-plan');

test('applyPageLimit returns a cloned site config and preserves the input', () => {
  const siteConfig = {
    name: 'Example',
    baseUrl: 'https://example.com',
    testPages: ['/', '/about', '/contact'],
  };

  const plan = applyPageLimit(siteConfig, '2');

  assert.deepStrictEqual(plan.siteConfig.testPages, ['/', '/about']);
  assert.deepStrictEqual(siteConfig.testPages, ['/', '/about', '/contact']);
  assert.strictEqual(plan.appliedPageLimit, 2);
});

test('normaliseSpecPattern resolves existing nested tests and prefixes plain spec names', () => {
  const cwd = '/repo';
  const existing = new Set([path.join(cwd, 'tests', 'functionality.forms.spec.js')]);
  const fileExists = (candidate) => existing.has(candidate);

  assert.strictEqual(
    normaliseSpecPattern('functionality.forms.spec.js', { cwd, fileExists }),
    'tests/functionality.forms.spec.js'
  );
  assert.strictEqual(
    normaliseSpecPattern('missing.spec.js', { cwd, fileExists }),
    'tests/missing.spec.js'
  );
  assert.strictEqual(
    normaliseSpecPattern('tests/*.spec.js', { cwd, fileExists }),
    'tests/*.spec.js'
  );
});

test('selectSpecTargets filters suites using existing runner naming rules', () => {
  const testEntries = [
    'tests/visual.regression.spec.js',
    'tests/responsive.layout.spec.js',
    'tests/responsive.a11y.spec.js',
    'tests/functionality.forms.spec.js',
    'tests/a11y.audit.spec.js',
  ];

  assert.deepStrictEqual(
    selectSpecTargets({ responsive: true }, { testEntries }).testTargets,
    ['tests/responsive.layout.spec.js']
  );
  assert.deepStrictEqual(
    selectSpecTargets({ accessibility: true }, { testEntries }).testTargets,
    ['tests/responsive.a11y.spec.js', 'tests/a11y.audit.spec.js']
  );
  assert.deepStrictEqual(
    selectSpecTargets({}, { testEntries }).testTargets,
    testEntries
  );
});

test('selectSpecTargets lets explicit specs override suite selection', () => {
  const plan = selectSpecTargets(
    {
      visual: true,
      specs: ['functionality.forms.spec.js'],
    },
    {
      testEntries: ['tests/visual.regression.spec.js'],
      cwd: '/repo',
    }
  );

  assert.deepStrictEqual(plan.requestedSpecs, ['tests/functionality.forms.spec.js']);
  assert.deepStrictEqual(plan.testTargets, ['tests/functionality.forms.spec.js']);
});

test('selectProjects mirrors default, explicit, and all project behavior', () => {
  assert.deepStrictEqual(selectProjects('').projectArgsList, ['Chrome']);
  assert.strictEqual(selectProjects('').usingDefaultProject, true);

  const explicit = selectProjects('Chrome,Firefox');
  assert.strictEqual(explicit.projectSpecifier, 'Chrome,Firefox');
  assert.deepStrictEqual(explicit.projectArgsList, ['Chrome', 'Firefox']);

  const all = selectProjects('all');
  assert.strictEqual(all.projectSpecifier, 'all');
  assert.deepStrictEqual(all.projectArgsList, []);
});

test('prepareRunManifestPayload captures selected pages, specs, and projects', () => {
  const manifest = prepareRunManifestPayload({
    siteName: 'example-live',
    siteConfig: {
      name: 'Example Live',
      baseUrl: 'https://example.com',
      testPages: ['/'],
    },
    appliedPageLimit: 1,
    projectArgsList: ['Firefox'],
    projectSpecifier: 'Firefox',
    testTargets: ['tests/functionality.forms.spec.js'],
    requestedSpecs: ['tests/functionality.forms.spec.js'],
  });

  assert.strictEqual(manifest.site.name, 'example-live');
  assert.strictEqual(manifest.limits.pageLimit, 1);
  assert.deepStrictEqual(manifest.pages, ['/']);
  assert.deepStrictEqual(manifest.specs, ['tests/functionality.forms.spec.js']);
  assert.deepStrictEqual(manifest.projects, ['Firefox']);
});
