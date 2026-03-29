'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert');

const {
  getManifestSiteContext,
  loadManifest,
  requireManifest,
} = require('../../utils/run-manifest');

const ORIGINAL_INLINE = process.env.SITE_RUN_MANIFEST_INLINE;
const ORIGINAL_PATH = process.env.SITE_RUN_MANIFEST;

afterEach(() => {
  if (ORIGINAL_INLINE === undefined) {
    delete process.env.SITE_RUN_MANIFEST_INLINE;
  } else {
    process.env.SITE_RUN_MANIFEST_INLINE = ORIGINAL_INLINE;
  }

  if (ORIGINAL_PATH === undefined) {
    delete process.env.SITE_RUN_MANIFEST;
  } else {
    process.env.SITE_RUN_MANIFEST = ORIGINAL_PATH;
  }
});

test('requireManifest reads inline manifests and resolves site context', () => {
  process.env.SITE_RUN_MANIFEST_INLINE = JSON.stringify({
    site: {
      name: 'example-live',
      title: 'Example Live',
      baseUrl: 'https://example.com',
    },
    siteConfig: {
      name: 'Example Live',
      baseUrl: 'https://example.com',
      includeHomepage: false,
      testPages: ['/contact'],
    },
    pages: ['/contact'],
  });
  delete process.env.SITE_RUN_MANIFEST;

  const manifest = requireManifest();
  assert.ok(loadManifest());
  assert.strictEqual(manifest.site.name, 'example-live');

  const context = getManifestSiteContext(manifest);
  assert.deepStrictEqual(context, {
    manifest,
    siteName: 'example-live',
    siteConfig: {
      name: 'Example Live',
      baseUrl: 'https://example.com',
      includeHomepage: false,
      testPages: ['/contact'],
    },
  });
});
