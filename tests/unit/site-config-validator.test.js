'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { assertValidSiteConfig } = require('../../utils/site-config-validator');

const makeConfig = (overrides = {}) => ({
  name: 'Example Site',
  baseUrl: 'https://example.com',
  testPages: ['/'],
  ...overrides,
});

test('assertValidSiteConfig accepts a minimal valid site config', () => {
  assert.doesNotThrow(() => {
    assertValidSiteConfig(makeConfig(), { contextLabel: 'example' });
  });
});

test('assertValidSiteConfig rejects configs that omit homepage coverage by default', () => {
  assert.throws(
    () => {
      assertValidSiteConfig(makeConfig({ testPages: ['/about'] }), {
        contextLabel: 'example',
      });
    },
    /must include "\/" unless includeHomepage is false/
  );
});

test('assertValidSiteConfig allows homepage opt-out when includeHomepage is false', () => {
  assert.doesNotThrow(() => {
    assertValidSiteConfig(
      makeConfig({
        includeHomepage: false,
        testPages: ['/landing'],
      }),
      { contextLabel: 'example' }
    );
  });
});

test('assertValidSiteConfig rejects malformed discovery config', () => {
  assert.throws(
    () => {
      assertValidSiteConfig(
        makeConfig({
          discover: {
            strategy: 'sitemap',
            sitemapUrl: 'not-a-url',
          },
        }),
        { contextLabel: 'example' }
      );
    },
    /discover\.sitemapUrl/
  );
});

test('assertValidSiteConfig rejects malformed form selectors', () => {
  assert.throws(
    () => {
      assertValidSiteConfig(
        makeConfig({
          includeHomepage: false,
          testPages: ['/contact'],
          forms: [
            {
              name: 'Contact',
              page: '/contact',
              fields: {
                email: '',
              },
            },
          ],
        }),
        { contextLabel: 'example' }
      );
    },
    /fields\.email/
  );
});
