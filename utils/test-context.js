'use strict';

const { getManifestSiteContext } = require('./run-manifest');

let cachedContext = null;

const getActiveSiteContext = () => {
  if (cachedContext) return cachedContext;
  const { siteName, siteConfig } = getManifestSiteContext();
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
