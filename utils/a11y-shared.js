const DEFAULT_ACCESSIBILITY_SAMPLE = 'all';

const ensureHomepageFirst = (pages = []) => {
  const filtered = Array.isArray(pages) ? pages.filter((page) => typeof page === 'string') : [];
  const unique = Array.from(new Set(filtered));

  if (unique.includes('/')) {
    const idx = unique.indexOf('/');
    if (idx > 0) {
      unique.splice(idx, 1);
      unique.unshift('/');
    }
  } else {
    unique.unshift('/');
  }

  return unique;
};

const parseSampleSetting = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'all') return 'all';

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.floor(numeric);
  }

  return null;
};

const resolveSampleSetting = (
  siteConfig,
  {
    envKey = 'A11Y_SAMPLE',
    configKeys = ['a11yResponsiveSampleSize'],
    defaultSize = DEFAULT_ACCESSIBILITY_SAMPLE,
    smokeSize = 1,
  } = {}
) => {
  if (process.env.SMOKE) return smokeSize;

  const envSettingRaw = process.env[envKey];
  const envSetting = parseSampleSetting(envSettingRaw);
  if (envSetting !== null) return envSetting;

  for (const key of configKeys) {
    if (key in (siteConfig || {})) {
      const configSetting = parseSampleSetting(siteConfig[key]);
      if (configSetting !== null) return configSetting;
    }
  }

  return defaultSize;
};

const selectAccessibilityTestPages = (siteConfig, options = {}) => {
  const pages = ensureHomepageFirst(siteConfig?.testPages || []);
  const sampleSetting = resolveSampleSetting(siteConfig, options);

  if (sampleSetting === 'all') {
    return pages;
  }

  const limitedPages = pages.slice(0, sampleSetting);
  if (pages.length > limitedPages.length) {
    const envKey = options.envKey || 'A11Y_SAMPLE';
    const envOverride = process.env[envKey];
    let limiter = 'default accessibility sampling limit';

    if (process.env.SMOKE) {
      limiter = 'smoke profile (SMOKE=1)';
    } else if (envOverride) {
      limiter = `${envKey}=${envOverride}`;
    } else if (Array.isArray(options.configKeys)) {
      const matchedKey = options.configKeys.find((key) => parseSampleSetting(siteConfig?.[key]));
      if (matchedKey) {
        limiter = `site config ${matchedKey}=${siteConfig[matchedKey]}`;
      }
    }

    console.log(
      `ℹ️  Accessibility sampling limited to ${limitedPages.length} page(s) (${limiter}).`
    );
  }

  return limitedPages;
};

const resolveAccessibilityMetadata = (siteConfig, testInfo) => {
  const siteLabel = siteConfig?.name || process.env.SITE_NAME || 'default';
  const viewportLabel = (testInfo?.project?.name || 'Chrome').trim() || 'Chrome';
  return { siteLabel, viewportLabel };
};

const applyViewportMetadata = (items = [], viewportLabel) => {
  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    item.projectName = viewportLabel;
    item.browser = viewportLabel;
    item.viewport = viewportLabel;
    item.viewports = [viewportLabel];
  });
};

module.exports = {
  DEFAULT_ACCESSIBILITY_SAMPLE,
  ensureHomepageFirst,
  parseSampleSetting,
  resolveSampleSetting,
  selectAccessibilityTestPages,
  resolveAccessibilityMetadata,
  applyViewportMetadata,
};
