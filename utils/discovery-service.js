'use strict';

const fs = require('fs');
const path = require('path');
const { discoverFromSitemap } = require('./sitemap-loader');
const {
  ensureHomepagePresence,
  hostsShareBaseLabel,
  normaliseBaseUrlString,
  resolveUrl,
} = require('./site-config-utils');
const { assertValidSiteConfig } = require('./site-config-validator');

function loadSiteConfig(sitePath) {
  const raw = fs.readFileSync(sitePath, 'utf8');
  return JSON.parse(raw);
}

function writeSiteConfig(sitePath, siteConfig) {
  fs.writeFileSync(sitePath, `${JSON.stringify(siteConfig, null, 2)}\n`);
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function withDefaultDiscoverConfig(siteConfig) {
  if (siteConfig.discover && siteConfig.discover.strategy) {
    return {
      siteConfig,
      createdDefaultDiscover: false,
    };
  }

  if (!siteConfig.baseUrl) {
    throw new Error('Site config has no baseUrl, so sitemap discovery cannot be configured.');
  }

  const defaultSitemapUrl = `${siteConfig.baseUrl.replace(/\/$/, '')}/sitemap.xml`;
  return {
    siteConfig: {
      ...siteConfig,
      discover: {
        strategy: 'sitemap',
        sitemapUrl: defaultSitemapUrl,
      },
    },
    createdDefaultDiscover: true,
  };
}

async function refreshSiteConfig(sitePath, options = {}) {
  const discoverPages = options.discoverPages || discoverFromSitemap;
  const logger = options.logger || console;
  const persisted = loadSiteConfig(sitePath);
  const siteLabel = persisted.name || path.basename(sitePath, '.json');

  const { siteConfig: hydratedSiteConfig, createdDefaultDiscover } = withDefaultDiscoverConfig({
    ...persisted,
  });
  const siteConfig = hydratedSiteConfig;
  siteConfig.testPages = ensureHomepagePresence(
    siteConfig.testPages,
    siteLabel,
    'discovery config',
    siteConfig.includeHomepage,
    logger
  );
  const initialPagesNormalized = !arraysEqual(siteConfig.testPages, persisted.testPages);

  assertValidSiteConfig(siteConfig, {
    contextLabel: `Discovery config ${path.basename(sitePath)}`,
  });

  if (createdDefaultDiscover) {
    logger.log(
      `ℹ️  Discovery: default sitemap strategy enabled using ${siteConfig.discover.sitemapUrl}`
    );
  }

  if (!siteConfig.discover || siteConfig.discover.strategy !== 'sitemap') {
    throw new Error('Only sitemap discovery is currently supported by the discovery command.');
  }

  const discovered = await discoverPages(siteConfig, siteConfig.discover);
  const discoveryMeta = discovered && typeof discovered === 'object' ? discovered.meta || {} : {};
  const currentBaseUrl = normaliseBaseUrlString(siteConfig.baseUrl);

  let baseUrlUpdated = false;
  let sitemapUrlUpdated = false;

  if (discoveryMeta.hostAdjusted && discoveryMeta.resolvedBaseUrl) {
    const resolvedBase = normaliseBaseUrlString(discoveryMeta.resolvedBaseUrl);
    if (resolvedBase && resolvedBase !== currentBaseUrl) {
      logger.log(
        `ℹ️  Aligning baseUrl host from ${currentBaseUrl} to ${resolvedBase} based on sitemap discovery.`
      );
      siteConfig.baseUrl = resolvedBase;
      baseUrlUpdated = true;
    }
  }

  if (
    discoveryMeta.hostAdjusted &&
    discoveryMeta.resolvedHost &&
    siteConfig.discover &&
    siteConfig.discover.sitemapUrl
  ) {
    const sitemapUrlObj = resolveUrl(siteConfig.discover.sitemapUrl, siteConfig.baseUrl);
    if (sitemapUrlObj) {
      const previousHost = sitemapUrlObj.host;
      if (
        previousHost !== discoveryMeta.resolvedHost &&
        hostsShareBaseLabel(previousHost, discoveryMeta.resolvedHost)
      ) {
        sitemapUrlObj.host = discoveryMeta.resolvedHost;
        siteConfig.discover.sitemapUrl = sitemapUrlObj.toString();
        sitemapUrlUpdated = true;
        logger.log(
          `ℹ️  Aligning sitemapUrl host from ${previousHost} to ${discoveryMeta.resolvedHost} based on sitemap discovery.`
        );
      }
    }
  }

  const changes = {
    baseUrlUpdated,
    sitemapUrlUpdated,
    pagesUpdated: initialPagesNormalized,
    createdDefaultDiscover,
  };

  if (Array.isArray(discovered) && discovered.length > 0) {
    const previous = Array.isArray(siteConfig.testPages) ? [...siteConfig.testPages] : [];
    const discoveredSet = new Set(discovered);
    const updated = [...discoveredSet].sort((a, b) => a.localeCompare(b));

    const added = updated.filter((pathItem) => !previous.includes(pathItem));
    const removed = previous.filter((pathItem) => !discoveredSet.has(pathItem));

    siteConfig.testPages = ensureHomepagePresence(
      updated,
      siteLabel,
      'sitemap discovery',
      siteConfig.includeHomepage,
      logger
    );

    if (added.length === 0 && removed.length === 0) {
      logger.log(`ℹ️  Sitemap discovery found ${updated.length} page(s); no changes.`);
    } else {
      const parts = [];
      if (added.length > 0) parts.push(`${added.length} added`);
      if (removed.length > 0) parts.push(`${removed.length} removed`);
      logger.log(`🔍 Sitemap discovery updated test pages (${parts.join(', ')}).`);
      changes.pagesUpdated = true;
    }
  } else {
    logger.log('ℹ️  Sitemap discovery returned no pages. Test list unchanged.');
  }

  const nextConfig = {
    ...persisted,
    ...(baseUrlUpdated ? { baseUrl: siteConfig.baseUrl } : {}),
    ...(siteConfig.discover
      ? { discover: { ...(persisted.discover || {}), ...siteConfig.discover } }
      : {}),
    ...(Array.isArray(siteConfig.testPages) && (discovered.length > 0 || initialPagesNormalized)
      ? { testPages: siteConfig.testPages }
      : {}),
  };
  assertValidSiteConfig(nextConfig, {
    contextLabel: `Discovery output ${path.basename(sitePath)}`,
  });

  if (
    createdDefaultDiscover ||
    baseUrlUpdated ||
    sitemapUrlUpdated ||
    initialPagesNormalized ||
    discovered.length > 0
  ) {
    writeSiteConfig(sitePath, nextConfig);
    logger.log(`📄 Updated ${path.relative(process.cwd(), sitePath)}.`);
  }

  return {
    siteConfig: nextConfig,
    changes,
    discoveredCount: Array.isArray(discovered) ? discovered.length : 0,
  };
}

module.exports = {
  refreshSiteConfig,
};
