const fs = require('fs');
const { assertValidSiteConfig } = require('./site-config-validator');

function parseJsonIfPossible(raw, contextLabel) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`${contextLabel} parse error: ${error.message}`);
    return null;
  }
}

function loadManifest() {
  const inline = process.env.SITE_RUN_MANIFEST_INLINE;
  if (inline) {
    const parsed = parseJsonIfPossible(inline, 'SITE_RUN_MANIFEST_INLINE');
    if (parsed) return parsed;
  }

  const manifestPath = process.env.SITE_RUN_MANIFEST;
  if (manifestPath) {
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const parsed = parseJsonIfPossible(raw, 'SITE_RUN_MANIFEST');
      if (parsed) {
        parsed.__path = manifestPath;
      }
      return parsed;
    } catch (error) {
      console.warn(`SITE_RUN_MANIFEST read error: ${error.message}`);
    }
  }

  return null;
}

function requireManifest() {
  const manifest = loadManifest();
  if (!manifest) {
    throw new Error(
      'SITE_RUN_MANIFEST or SITE_RUN_MANIFEST_INLINE is required for execution. Run specs through run-tests.js or baselines:update.'
    );
  }
  return manifest;
}

function getManifestSiteContext(manifestInput = null) {
  const manifest = manifestInput || requireManifest();
  const siteName = manifest?.site?.name;
  const siteConfig = manifest?.siteConfig;

  if (!siteName) {
    throw new Error('Run manifest is missing site.name.');
  }
  if (!siteConfig || typeof siteConfig !== 'object' || Array.isArray(siteConfig)) {
    throw new Error('Run manifest is missing siteConfig.');
  }

  const resolvedSiteConfig = {
    ...siteConfig,
    name: manifest?.site?.title || siteConfig.name,
    baseUrl: manifest?.site?.baseUrl || siteConfig.baseUrl,
    testPages: Array.isArray(manifest?.pages)
      ? manifest.pages.filter((page) => typeof page === 'string')
      : Array.isArray(siteConfig.testPages)
        ? siteConfig.testPages.filter((page) => typeof page === 'string')
        : [],
  };

  assertValidSiteConfig(resolvedSiteConfig, {
    contextLabel: `Run manifest siteConfig for ${siteName}`,
  });

  return {
    manifest,
    siteName,
    siteConfig: resolvedSiteConfig,
  };
}

function getManifestSummary() {
  const manifest = loadManifest();
  if (!manifest) return null;

  const pageCount = Array.isArray(manifest.pages) ? manifest.pages.length : 0;
  const projectCount = Array.isArray(manifest.projects) ? manifest.projects.length : 0;
  const specCount = Array.isArray(manifest.specs) ? manifest.specs.length : 0;

  return {
    manifest,
    pageCount,
    projectCount,
    specCount,
  };
}

module.exports = {
  loadManifest,
  requireManifest,
  getManifestSiteContext,
  getManifestSummary,
};
