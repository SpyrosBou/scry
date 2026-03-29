'use strict';

const { resolveUrl } = require('./site-config-utils');

const ACCESSIBILITY_SAMPLE_KEYS = [
  'a11yResponsiveSampleSize',
  'a11yStructureSampleSize',
  'a11yMotionSampleSize',
  'a11yReflowSampleSize',
  'a11yIframeSampleSize',
  'a11yKeyboardSampleSize',
];

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertString = (value, label) => {
  assert(isNonEmptyString(value), `${label} must be a non-empty string.`);
};

const assertBoolean = (value, label) => {
  assert(typeof value === 'boolean', `${label} must be a boolean.`);
};

const assertFiniteNumber = (value, label, { min = null, max = null } = {}) => {
  assert(Number.isFinite(value), `${label} must be a finite number.`);
  if (min !== null) {
    assert(value >= min, `${label} must be greater than or equal to ${min}.`);
  }
  if (max !== null) {
    assert(value <= max, `${label} must be less than or equal to ${max}.`);
  }
};

const assertPositiveIntegerLike = (value, label) => {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    assert(
      trimmed === 'all' || /^\d+$/.test(trimmed),
      `${label} must be "all" or a positive integer.`
    );
    if (trimmed !== 'all') {
      assert(Number.parseInt(trimmed, 10) > 0, `${label} must be greater than 0.`);
    }
    return;
  }

  assert(Number.isInteger(value) && value > 0, `${label} must be a positive integer.`);
};

const assertStringArray = (value, label) => {
  assert(Array.isArray(value), `${label} must be an array.`);
  value.forEach((entry, index) => {
    assertString(entry, `${label}[${index}]`);
  });
};

const assertPagePath = (value, label) => {
  assertString(value, label);
  assert(
    value === '/' || value.startsWith('/'),
    `${label} must be a site-relative path beginning with "/".`
  );
};

const assertUrl = (value, label) => {
  assertString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new Error(`${label} must be a valid absolute URL.`);
  }

  assert(
    parsed.protocol === 'http:' || parsed.protocol === 'https:',
    `${label} must use http:// or https://.`
  );
};

const validateForms = (forms) => {
  assert(Array.isArray(forms), '`forms` must be an array.');

  forms.forEach((formConfig, index) => {
    const label = `forms[${index}]`;
    assert(isPlainObject(formConfig), `${label} must be an object.`);
    assertString(formConfig.name, `${label}.name`);
    assertPagePath(formConfig.page || '/', `${label}.page`);
    if (formConfig.selector !== undefined) {
      assertString(formConfig.selector, `${label}.selector`);
    }
    if (formConfig.submitButton !== undefined) {
      assertString(formConfig.submitButton, `${label}.submitButton`);
    }
    if (formConfig.submitSelector !== undefined) {
      assertString(formConfig.submitSelector, `${label}.submitSelector`);
    }
    if (formConfig.fields !== undefined) {
      assert(isPlainObject(formConfig.fields), `${label}.fields must be an object.`);
      Object.entries(formConfig.fields).forEach(([fieldName, selector]) => {
        assertString(selector, `${label}.fields.${fieldName}`);
      });
    }
  });
};

const validateVisualThresholds = (thresholds) => {
  assert(isPlainObject(thresholds), '`visualThresholds` must be an object.');
  Object.entries(thresholds).forEach(([key, value]) => {
    assertFiniteNumber(value, `visualThresholds.${key}`, { min: 0, max: 1 });
  });
};

const validateVisualOverrides = (overrides) => {
  assert(Array.isArray(overrides), '`visualOverrides` must be an array.');

  overrides.forEach((override, index) => {
    const label = `visualOverrides[${index}]`;
    assert(isPlainObject(override), `${label} must be an object.`);
    const hasMatcher =
      isNonEmptyString(override.match) ||
      isNonEmptyString(override.page) ||
      isNonEmptyString(override.pattern);
    assert(
      hasMatcher,
      `${label} must declare one of "match", "page", or "pattern" to identify pages.`
    );
    if (override.match !== undefined) assertString(override.match, `${label}.match`);
    if (override.page !== undefined) assertPagePath(override.page, `${label}.page`);
    if (override.pattern !== undefined) assertString(override.pattern, `${label}.pattern`);
    if (override.threshold !== undefined) {
      assertFiniteNumber(override.threshold, `${label}.threshold`, { min: 0, max: 1 });
    }
    if (override.masks !== undefined) assertStringArray(override.masks, `${label}.masks`);
    if (override.maskSelectors !== undefined) {
      assertStringArray(override.maskSelectors, `${label}.maskSelectors`);
    }
  });
};

const validateDiscoverConfig = (discover, baseUrl) => {
  assert(isPlainObject(discover), '`discover` must be an object.');
  assert(discover.strategy === 'sitemap', '`discover.strategy` must be "sitemap".');

  if (discover.sitemapUrl !== undefined) {
    assertUrl(discover.sitemapUrl, '`discover.sitemapUrl`');
    assert(
      Boolean(resolveUrl(discover.sitemapUrl, baseUrl)),
      '`discover.sitemapUrl` must resolve to a valid URL.'
    );
  }
  if (discover.include !== undefined) assertStringArray(discover.include, '`discover.include`');
  if (discover.exclude !== undefined) assertStringArray(discover.exclude, '`discover.exclude`');
  if (discover.maxPages !== undefined) {
    assertPositiveIntegerLike(discover.maxPages, '`discover.maxPages`');
  }
  if (discover.maxDepth !== undefined) {
    assertPositiveIntegerLike(discover.maxDepth, '`discover.maxDepth`');
  }
};

function assertValidSiteConfig(config, options = {}) {
  const contextLabel = options.contextLabel || 'Site config';
  assert(isPlainObject(config), `${contextLabel} must be a JSON object.`);

  assertString(config.name, `${contextLabel}.name`);
  assertUrl(config.baseUrl, `${contextLabel}.baseUrl`);
  assert(Array.isArray(config.testPages), `${contextLabel}.testPages must be an array.`);
  assert(config.testPages.length > 0, `${contextLabel}.testPages must contain at least one page.`);
  config.testPages.forEach((page, index) => {
    assertPagePath(page, `${contextLabel}.testPages[${index}]`);
  });

  if (config.includeHomepage !== undefined) {
    assertBoolean(config.includeHomepage, `${contextLabel}.includeHomepage`);
  }

  if (config.includeHomepage !== false) {
    assert(
      config.testPages.includes('/'),
      `${contextLabel}.testPages must include "/" unless includeHomepage is false.`
    );
  }

  if (config.forms !== undefined) validateForms(config.forms);
  if (config.visualThresholds !== undefined) validateVisualThresholds(config.visualThresholds);
  if (config.visualOverrides !== undefined) validateVisualOverrides(config.visualOverrides);
  if (config.dynamicMasks !== undefined) assertStringArray(config.dynamicMasks, '`dynamicMasks`');
  if (config.discover !== undefined) validateDiscoverConfig(config.discover, config.baseUrl);
  if (config.a11yFailOn !== undefined) assertStringArray(config.a11yFailOn, '`a11yFailOn`');
  if (config.a11yIgnoreRules !== undefined) {
    assertStringArray(config.a11yIgnoreRules, '`a11yIgnoreRules`');
  }
  if (config.a11yMode !== undefined) {
    assert(
      config.a11yMode === 'audit' || config.a11yMode === 'gate',
      '`a11yMode` must be "audit" or "gate".'
    );
  }
  if (config.ignoreConsoleErrors !== undefined) {
    assertStringArray(config.ignoreConsoleErrors, '`ignoreConsoleErrors`');
  }
  if (config.ignoreResourceErrors !== undefined) {
    assertStringArray(config.ignoreResourceErrors, '`ignoreResourceErrors`');
  }
  if (config.resourceErrorBudget !== undefined) {
    assertFiniteNumber(config.resourceErrorBudget, '`resourceErrorBudget`', { min: 0 });
  }

  ACCESSIBILITY_SAMPLE_KEYS.forEach((key) => {
    if (config[key] !== undefined) {
      assertPositiveIntegerLike(config[key], `\`${key}\``);
    }
  });

  return true;
}

module.exports = {
  ACCESSIBILITY_SAMPLE_KEYS,
  assertValidSiteConfig,
};
