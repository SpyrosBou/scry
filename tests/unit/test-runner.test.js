'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const TestRunner = require('../../utils/test-runner');

test('resolveLocalExecutionEnv returns a derived env without mutating the input object', () => {
  const baseEnv = {};
  const siteConfig = {
    baseUrl: 'https://example.ddev.site',
  };

  const resolved = TestRunner.resolveLocalExecutionEnv('example-local', siteConfig, baseEnv);

  assert.notStrictEqual(resolved, baseEnv);
  assert.strictEqual(baseEnv.ENABLE_DDEV, undefined);
  assert.strictEqual(baseEnv.DDEV_PROJECT_PATH, undefined);
  assert.strictEqual(resolved.ENABLE_DDEV, 'true');
});

test('prepareRunManifest keeps dry-run manifests inline', () => {
  const result = TestRunner.prepareRunManifest({
    siteName: 'example-live',
    siteConfig: {
      name: 'Example Live',
      baseUrl: 'https://example.com',
      testPages: ['/'],
    },
    appliedPageLimit: 1,
    options: {
      dryRun: true,
    },
    projectArgsList: ['Chrome'],
    projectSpecifier: 'Chrome',
    testTargets: ['tests/responsive.layout.structure.spec.js'],
    requestedSpecs: [],
  });

  assert.strictEqual(result.manifestPath, null);
  assert.ok(result.env.SITE_RUN_MANIFEST_INLINE);
  assert.strictEqual(result.env.SITE_RUN_MANIFEST, undefined);
});
