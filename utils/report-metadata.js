'use strict';

const resolveReportMetadata = (siteConfig, testInfo, { defaultViewport = 'Chrome' } = {}) => {
  const siteLabel = siteConfig?.name || 'default';
  const viewportLabel = (testInfo?.project?.name || defaultViewport).trim() || defaultViewport;
  return { siteLabel, viewportLabel };
};

const normaliseApplyOptions = (options) => {
  if (options == null) return {};
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError(
      'applyViewportMetadata expects an options object with viewportLabel and siteLabel.'
    );
  }
  return options;
};

const applyViewportMetadata = (items, options = {}) => {
  const resolvedOptions = normaliseApplyOptions(options);
  const viewport = (resolvedOptions.viewportLabel || 'Chrome').trim() || 'Chrome';
  const site = (resolvedOptions.siteLabel || 'default').trim() || 'default';
  if (!Array.isArray(items)) return;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    item.browser = item.browser || viewport;
    item.viewport = item.viewport || viewport;
    item.viewports =
      Array.isArray(item.viewports) && item.viewports.length > 0 ? item.viewports : [viewport];
    item.projectName = item.projectName || viewport;
    item.siteName = item.siteName || site;
  }
};

module.exports = {
  resolveReportMetadata,
  applyViewportMetadata,
};
