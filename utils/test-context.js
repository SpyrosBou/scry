'use strict';

const SiteLoader = require('./site-loader');

let cachedContext = null;

const getActiveSiteContext = () => {
  if (cachedContext) return cachedContext;
  const siteName = process.env.SITE_NAME;
  if (!siteName) {
    throw new Error('SITE_NAME environment variable is required');
  }
  const siteConfig = SiteLoader.loadSite(siteName);
  SiteLoader.validateSiteConfig(siteConfig);
  cachedContext = { siteName, siteConfig };
  return cachedContext;
};

const resetActiveSiteContext = () => {
  cachedContext = null;
};

module.exports = {
  getActiveSiteContext,
  resetActiveSiteContext,
};
