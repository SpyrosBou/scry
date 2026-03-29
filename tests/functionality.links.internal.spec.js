const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

const LINK_CHECK_DEFAULTS = {
  maxPerPage: 20,
  timeoutMs: 5000,
  followRedirects: true,
  methodFallback: true,
};

const normalizeInternalUrl = (url, baseUrl) => {
  try {
    const parsed = new URL(url, baseUrl);
    parsed.hash = '';
    parsed.search = '';
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch (error) {
    console.log(`⚠️  Could not normalize URL ${url}: ${error.message}`);
    return url;
  }
};

const checkLink = async (page, url, config) => {
  const buildFetchOptions = (method) => {
    const options = {
      method,
      timeout: config.timeoutMs,
    };
    if (!config.followRedirects) options.maxRedirects = 0;
    return options;
  };

  const methods = config.methodFallback ? ['HEAD', 'GET'] : ['HEAD'];
  let lastFailure = { status: undefined, method: 'HEAD', error: undefined };

  for (const method of methods) {
    try {
      const response = await page.request.fetch(url, buildFetchOptions(method));
      const status = response.status();
      await response.dispose();

      if (status < 400) {
        return { ok: true, status, method };
      }

      lastFailure = { status, method };
      if (method === 'HEAD' && config.methodFallback) continue;
      return { ok: false, status, method };
    } catch (error) {
      lastFailure = { error: error.message, method };
      if (method === 'HEAD' && config.methodFallback) continue;
      return { ok: false, error: error.message, method };
    }
  }

  return { ok: false, ...lastFailure };
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';

const buildLinksSchemaPayloads = (pages, brokenLinks, projectName, config = {}) => {
  if (!Array.isArray(pages) || pages.length === 0) return null;

  const normalisedConfig = {
    maxPerPage: Number.isFinite(config.maxPerPage) ? config.maxPerPage : null,
    timeoutMs: Number.isFinite(config.timeoutMs) ? config.timeoutMs : null,
    followRedirects: config.followRedirects !== false,
    methodFallback: config.methodFallback !== false,
  };

  const totalLinksFound = pages.reduce((total, entry) => total + (entry.totalLinks || 0), 0);
  const totalLinksChecked = pages.reduce((total, entry) => total + (entry.uniqueChecked || 0), 0);
  const pageDetails = pages.map((entry) => {
    const brokenEntries = Array.isArray(entry.broken) ? entry.broken : [];
    const gating = brokenEntries.map((issue) => {
      if (issue.error) {
        return `Request ${issue.method || 'HEAD'} failed for ${issue.url} (${issue.error})`;
      }
      if (issue.status) {
        return `Received ${issue.status} for ${issue.url} (via ${issue.method || 'HEAD'})`;
      }
      return `Broken link detected: ${issue.url}`;
    });
    const notes = [];
    if ((entry.totalLinks || 0) === 0) {
      notes.push('No <a> elements detected on this page.');
    } else if (entry.uniqueChecked < entry.totalLinks) {
      const maxPerPageLabel =
        normalisedConfig.maxPerPage ?? LINK_CHECK_DEFAULTS.maxPerPage ?? entry.uniqueChecked;
      notes.push(
        `Checked ${entry.uniqueChecked} of ${entry.totalLinks} links (cap maxPerPage=${maxPerPageLabel}).`
      );
    }
    return {
      page: entry.page,
      totalLinks: entry.totalLinks,
      uniqueChecked: entry.uniqueChecked,
      brokenCount: brokenEntries.length,
      gating,
      warnings: [],
      advisories: [],
      notes,
      broken: brokenEntries,
    };
  });
  const pagesWithBroken = pageDetails.filter((entry) => entry.brokenCount > 0).length;

  const runPayload = createRunSummaryPayload({
    baseName: `links-audit-${slugify(projectName)}`,
    title: 'Internal link audit summary',
    overview: {
      totalPages: pages.length,
      totalLinksFound,
      uniqueLinksChecked: totalLinksChecked,
      brokenLinksDetected: brokenLinks.length,
      pagesWithBrokenLinks: pagesWithBroken,
      maxChecksPerPage: normalisedConfig.maxPerPage,
      pagesWithGatingIssues: pageDetails.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.links.internal',
      summaryType: 'internal-links',
      projectName,
      scope: 'project',
      followRedirects: normalisedConfig.followRedirects,
      methodFallback: normalisedConfig.methodFallback,
      timeoutMs: normalisedConfig.timeoutMs,
    },
  });

  runPayload.details = {
    pages: pageDetails.map((entry) => ({
      page: entry.page,
      totalLinks: entry.totalLinks,
      uniqueChecked: entry.uniqueChecked,
      brokenCount: entry.brokenCount,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const MAX_BROKEN_DETAILS = 20;
  const pagePayloads = pageDetails.map((entry) => {
    const brokenSample = entry.broken.slice(0, MAX_BROKEN_DETAILS).map((issue) => ({
      url: issue.url,
      status: issue.status ?? null,
      methodTried: issue.method || null,
      error: issue.error || null,
    }));

    return createPageSummaryPayload({
      baseName: `links-audit-${slugify(projectName)}-${slugify(entry.page)}`,
      title: `Internal links – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        totalLinks: entry.totalLinks,
        uniqueChecked: entry.uniqueChecked,
        brokenCount: entry.brokenCount,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
        brokenSample,
      },
      metadata: {
        spec: 'functionality.links.internal',
        summaryType: 'internal-links',
        projectName,
      },
    });
  });

  return { runPayload, pagePayloads };
};

test.describe('Functionality: Internal Links', () => {
  let siteConfig;
  let errorContext;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');
    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
    errorContext = sharedErrorContext;
  });

  test('Validate internal links across pages (rate-limited)', async ({ page }) => {
    test.setTimeout(7200000);
    const brokenLinks = [];
    const checkedLinks = new Set();
    const pageSummaries = [];
    const linkCheckConfig = {
      ...LINK_CHECK_DEFAULTS,
      ...(typeof siteConfig.linkCheck === 'object' && siteConfig.linkCheck !== null
        ? siteConfig.linkCheck
        : {}),
    };
    const timeoutMsValue = Number(linkCheckConfig.timeoutMs);
    linkCheckConfig.timeoutMs = Number.isFinite(timeoutMsValue) && timeoutMsValue > 0
      ? timeoutMsValue
      : LINK_CHECK_DEFAULTS.timeoutMs;

    const maxPerPageValue = Number(linkCheckConfig.maxPerPage);
    const maxPerPage = Number.isFinite(maxPerPageValue) && maxPerPageValue > 0
      ? Math.floor(maxPerPageValue)
      : LINK_CHECK_DEFAULTS.maxPerPage;

    linkCheckConfig.followRedirects = linkCheckConfig.followRedirects !== false;
    linkCheckConfig.methodFallback = linkCheckConfig.methodFallback !== false;
    const pagesToTest = process.env.SMOKE
      ? (Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/'))
        ? ['/']
        : [siteConfig.testPages[0]]
      : siteConfig.testPages;

    for (const testPage of pagesToTest) {
      await test.step(`Checking internal links on: ${testPage}`, async () => {
        const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        if (response.status() !== 200) {
          // Still record a page entry so discovery/reporting renders this suite
          pageSummaries.push({
            page: testPage,
            totalLinks: 0,
            uniqueChecked: 0,
            broken: [],
          });
          return;
        }
        await waitForPageStability(page);

        const links = await page
          .locator('a[href]:visible')
          .all();
        console.log(`Found ${links.length} internal links on ${testPage}`);
        const perPage = {
          page: testPage,
          totalLinks: links.length,
          uniqueChecked: 0,
          broken: [],
        };
        const pageLinks = [];
        for (const link of links) {
          try {
            const href = await link.getAttribute('href');
            if (!href || href.startsWith('#')) continue;
            let fullUrl;
            try {
              const resolved = new URL(href, `${siteConfig.baseUrl}${testPage}`);
              fullUrl = resolved.href;
            } catch (error) {
              console.log(`⚠️  Skipping invalid href ${href}: ${error.message}`);
              continue;
            }
            if (!fullUrl.startsWith(siteConfig.baseUrl)) continue;
            const normalized = normalizeInternalUrl(fullUrl, siteConfig.baseUrl);
            if (checkedLinks.has(normalized)) continue;
            checkedLinks.add(normalized);
            pageLinks.push(fullUrl);
            if (pageLinks.length >= maxPerPage) break;
          } catch (error) {
            console.log(`⚠️  Could not read link attribute: ${error.message}`);
          }
        }

        const concurrency = Math.min(5, pageLinks.length);
        let index = 0;
        const processNext = async () => {
          while (index < pageLinks.length) {
            const currentIndex = index++;
            const url = pageLinks[currentIndex];
            try {
              const result = await checkLink(page, url, linkCheckConfig);
              if (!result.ok) {
                const brokenEntry = {
                  url,
                  status: result.status,
                  page: testPage,
                  method: result.method,
                  error: result.error,
                };
                brokenLinks.push(brokenEntry);
                perPage.broken.push(brokenEntry);
              }
            } catch (error) {
              console.log(`⚠️  Link probe failed for ${url}: ${error.message}`);
            }
            await page.waitForTimeout(100);
          }
        };

        await Promise.all(Array.from({ length: concurrency || 1 }, processNext));
        perPage.uniqueChecked = pageLinks.length;
        pageSummaries.push(perPage);
      });
    }
    if (brokenLinks.length > 0) {
      const report = brokenLinks
        .map((link) => {
          const statusText = link.status ? `Status: ${link.status}` : link.error;
          return `${link.url} (${statusText} via ${link.method || 'HEAD'}) on page ${link.page}`;
        })
        .join('\n');
      console.error(`❌ Found ${brokenLinks.length} broken links:\n${report}`);
      expect.soft(brokenLinks.length).toBe(0);
    } else {
      console.log('✅ All internal links are functional');
    }

    const schemaPayloads = buildLinksSchemaPayloads(pageSummaries, brokenLinks, test.info().project.name, {
      maxPerPage,
      timeoutMs: linkCheckConfig.timeoutMs,
      followRedirects: linkCheckConfig.followRedirects,
      methodFallback: linkCheckConfig.methodFallback,
    });
    if (schemaPayloads) {
      const testInfo = test.info();
      await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      for (const payload of schemaPayloads.pagePayloads) {
        await attachSchemaSummary(testInfo, payload);
      }
    }
  });
});
