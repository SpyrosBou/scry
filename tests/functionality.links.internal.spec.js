const path = require('path');
const { test, expect } = require('../utils/test-fixtures');
const { safeNavigate, waitForPageStability } = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { getActiveSiteContext } = require('../utils/test-context');
const { createAggregationStore } = require('../utils/report-aggregation-store');
const { waitForReports: waitForReportsHelper } = require('../utils/a11y-aggregation-waiter');
const {
  buildLinksSchemaPayloads,
  resolveLinkCheckConfig,
} = require('../utils/report-payloads/site-quality');

const { siteConfig } = getActiveSiteContext();
const configuredPages = process.env.SMOKE
  ? Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/')
    ? ['/']
    : [siteConfig.testPages[0]].filter(Boolean)
  : siteConfig.testPages;
const totalPages = configuredPages.length;
const RUN_TOKEN = process.env.INTERNAL_LINKS_RUN_TOKEN || `${Date.now()}`;
if (!process.env.INTERNAL_LINKS_RUN_TOKEN) {
  process.env.INTERNAL_LINKS_RUN_TOKEN = RUN_TOKEN;
}
const AGGREGATION_PERSIST_ROOT = path.join(
  process.cwd(),
  'test-results',
  '.internal-links-aggregation'
);
const aggregationStore = createAggregationStore({
  persistRoot: AGGREGATION_PERSIST_ROOT,
  runToken: RUN_TOKEN,
});
const waitForReports = (projectName) =>
  waitForReportsHelper({
    store: aggregationStore,
    projectName,
    expectedCount: totalPages,
    timeoutMs: Math.max(60000, totalPages * 5000),
  });

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

test.describe('Functionality: Internal Links', () => {
  const linkCheckConfig = resolveLinkCheckConfig(siteConfig);

  configuredPages.forEach((testPage, index) => {
    test(`Validate internal links ${index + 1}/${totalPages}: ${testPage}`, async ({
      page,
    }, testInfo) => {
      const checkedLinks = new Set();
      const pageReport = {
        page: testPage,
        status: null,
        totalLinks: 0,
        uniqueChecked: 0,
        checkedUrls: [],
        broken: [],
        index: index + 1,
        runToken: RUN_TOKEN,
      };

      try {
        const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        pageReport.status = response.status();
        if (pageReport.status !== 200) {
          return;
        }

        await waitForPageStability(page);

        const links = await page.locator('a[href]:visible').all();
        console.log(`Found ${links.length} internal links on ${testPage}`);
        pageReport.totalLinks = links.length;
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
            pageLinks.push({ normalized, url: fullUrl });
            if (pageLinks.length >= linkCheckConfig.maxPerPage) break;
          } catch (error) {
            console.log(`⚠️  Could not read link attribute: ${error.message}`);
          }
        }

        const concurrency = Math.min(5, pageLinks.length);
        let cursor = 0;
        const processNext = async () => {
          while (cursor < pageLinks.length) {
            const currentIndex = cursor++;
            const entry = pageLinks[currentIndex];
            if (!entry) continue;
            try {
              const result = await checkLink(page, entry.url, linkCheckConfig);
              if (!result.ok) {
                pageReport.broken.push({
                  url: entry.url,
                  status: result.status,
                  page: testPage,
                  method: result.method,
                  error: result.error,
                });
              }
            } catch (error) {
              console.log(`⚠️  Link probe failed for ${entry.url}: ${error.message}`);
            }
          }
        };

        await Promise.all(Array.from({ length: concurrency || 1 }, processNext));
        pageReport.uniqueChecked = pageLinks.length;
        pageReport.checkedUrls = Array.from(checkedLinks);
      } finally {
        aggregationStore.record(testInfo.project.name, pageReport);
      }

      const schemaPayloads = buildLinksSchemaPayloads(
        [pageReport],
        pageReport.broken,
        testInfo.project.name,
        linkCheckConfig
      );
      const pagePayload = schemaPayloads?.pagePayloads?.[0];
      if (pagePayload) {
        await attachSchemaSummary(testInfo, pagePayload);
      }

      if (pageReport.broken.length > 0) {
        const report = pageReport.broken
          .map((link) => {
            const statusText = link.status ? `Status: ${link.status}` : link.error;
            return `${link.url} (${statusText} via ${link.method || 'HEAD'})`;
          })
          .join('\n');
        console.error(
          `❌ Found ${pageReport.broken.length} broken links on ${testPage}:\n${report}`
        );
      } else {
        console.log(`✅ All internal links are functional on ${testPage}`);
      }

      expect.soft(pageReport.broken.length).toBe(0);
    });
  });

  test.describe.serial('Internal links summary', () => {
    test('Aggregate results', async ({}, testInfo) => {
      if (totalPages === 0) {
        console.warn('ℹ️  Internal link suite executed with no configured pages.');
        return;
      }

      const reports = (await waitForReports(testInfo.project.name)).filter(
        (report) => report.runToken === RUN_TOKEN && typeof report.index === 'number'
      );
      if (reports.length === 0) {
        console.warn('ℹ️  Internal link suite produced no page reports.');
        return;
      }

      const brokenLinks = reports.flatMap((report) =>
        Array.isArray(report.broken) ? report.broken : []
      );
      const schemaPayloads = buildLinksSchemaPayloads(
        reports,
        brokenLinks,
        testInfo.project.name,
        linkCheckConfig
      );
      if (schemaPayloads?.runPayload) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      }
    });
  });
});
