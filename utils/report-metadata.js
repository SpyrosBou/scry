'use strict';

const resolveReportMetadata = (siteConfig, testInfo, { defaultViewport = 'Chrome' } = {}) => {
  const siteLabel = siteConfig?.name || process.env.SITE_NAME || 'default';
  const viewportLabel = (testInfo?.project?.name || defaultViewport).trim() || defaultViewport;
  return { siteLabel, viewportLabel };
};

const applyViewportMetadata = (items, options = {}) => {
  const viewport = (options.viewportLabel || 'Chrome').trim() || 'Chrome';
  const site = (options.siteLabel || 'default').trim() || 'default';
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    item.browser = viewport;
    item.viewport = viewport;
    item.viewports =
      Array.isArray(item.viewports) && item.viewports.length > 0 ? item.viewports : [viewport];
    item.projectName = item.projectName || site;
    item.siteName = item.siteName || site;
  }
};

module.exports = {
  resolveReportMetadata,
  applyViewportMetadata,
};
