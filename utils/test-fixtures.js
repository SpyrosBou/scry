'use strict';

const base = require('@playwright/test');
const { setupTestPage, teardownTestPage } = require('./test-helpers');
const { getActiveSiteContext } = require('./test-context');

const test = base.test.extend({
  errorContext: async ({ page, context }, use, testInfo) => {
    const contextInstance = await setupTestPage(page, context, testInfo);
    try {
      await use(contextInstance);
    } finally {
      await teardownTestPage(page, context, contextInstance, testInfo);
    }
  },
  siteContext: async ({}, use) => {
    await use(getActiveSiteContext());
  },
  siteConfig: async ({ siteContext }, use) => {
    await use(siteContext.siteConfig);
  },
  siteName: async ({ siteContext }, use) => {
    await use(siteContext.siteName);
  },
});

module.exports = {
  test,
  expect: base.expect,
};
