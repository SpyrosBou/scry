const path = require('path');
const { test, expect } = require('../utils/test-fixtures');
const { waitForPageStability } = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { getActiveSiteContext } = require('../utils/test-context');
const { createAggregationStore } = require('../utils/report-aggregation-store');
const { waitForReports: waitForReportsHelper } = require('../utils/a11y-aggregation-waiter');
const {
  buildAvailabilitySchemaPayloads,
  buildHttpSchemaPayloads,
  buildPerformanceSchemaPayloads,
} = require('../utils/report-payloads/site-quality');
const {
  collectCriticalElements,
  detect404LikePage,
  getPageTitle,
  waitForWordPressReady,
} = require('../utils/page-audit-helpers');

const { siteConfig } = getActiveSiteContext();
const configuredPages = process.env.SMOKE
  ? Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/')
    ? ['/']
    : [siteConfig.testPages[0]].filter(Boolean)
  : siteConfig.testPages;
const performancePages = process.env.SMOKE
  ? configuredPages
  : configuredPages.slice(0, Math.min(configuredPages.length, 5));

const extractStatusFromError = (error) => {
  const message = String(error?.message || '');
  const match = message.match(/status:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
};

const navigateForAudit = async (page, url) => {
  const response = await page.goto(url, {
    timeout: 20000,
    waitUntil: 'domcontentloaded',
  });

  if (!response) {
    throw new Error(`Navigation to ${url} returned null response`);
  }

  return response;
};

const capturePerformanceMetrics = async (page) => {
  return await page.evaluate(() => {
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const legacyTiming = performance.timing;

    const navigationStart =
      typeof navigationEntry?.startTime === 'number'
        ? navigationEntry.startTime
        : typeof legacyTiming?.navigationStart === 'number'
          ? legacyTiming.navigationStart
          : 0;

    const domContentLoaded = (() => {
      if (typeof navigationEntry?.domContentLoadedEventEnd === 'number') {
        return navigationEntry.domContentLoadedEventEnd - navigationStart;
      }
      if (legacyTiming && typeof legacyTiming.domContentLoadedEventEnd === 'number') {
        return legacyTiming.domContentLoadedEventEnd - legacyTiming.navigationStart;
      }
      return Number.NaN;
    })();

    const loadComplete = (() => {
      if (typeof navigationEntry?.loadEventEnd === 'number') {
        return navigationEntry.loadEventEnd - navigationStart;
      }
      if (legacyTiming && typeof legacyTiming.loadEventEnd === 'number') {
        return legacyTiming.loadEventEnd - legacyTiming.navigationStart;
      }
      return Number.NaN;
    })();

    const paints = performance.getEntriesByType('paint');
    const firstPaint = paints.find((entry) => entry.name === 'first-paint')?.startTime;
    const firstContentfulPaint = paints.find(
      (entry) => entry.name === 'first-contentful-paint'
    )?.startTime;

    return {
      domContentLoaded,
      loadComplete,
      firstPaint,
      firstContentfulPaint,
    };
  });
};

const normaliseMetric = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
};

const AVAILABILITY_RUN_TOKEN = process.env.INFRA_AVAILABILITY_RUN_TOKEN || `${Date.now()}`;
if (!process.env.INFRA_AVAILABILITY_RUN_TOKEN) {
  process.env.INFRA_AVAILABILITY_RUN_TOKEN = AVAILABILITY_RUN_TOKEN;
}
const HTTP_RUN_TOKEN = process.env.INFRA_HTTP_RUN_TOKEN || `${Date.now()}`;
if (!process.env.INFRA_HTTP_RUN_TOKEN) {
  process.env.INFRA_HTTP_RUN_TOKEN = HTTP_RUN_TOKEN;
}
const PERFORMANCE_RUN_TOKEN = process.env.INFRA_PERFORMANCE_RUN_TOKEN || `${Date.now()}`;
if (!process.env.INFRA_PERFORMANCE_RUN_TOKEN) {
  process.env.INFRA_PERFORMANCE_RUN_TOKEN = PERFORMANCE_RUN_TOKEN;
}

const availabilityStore = createAggregationStore({
  persistRoot: path.join(process.cwd(), 'test-results', '.infra-availability-aggregation'),
  runToken: AVAILABILITY_RUN_TOKEN,
});
const httpStore = createAggregationStore({
  persistRoot: path.join(process.cwd(), 'test-results', '.infra-http-aggregation'),
  runToken: HTTP_RUN_TOKEN,
});
const performanceStore = createAggregationStore({
  persistRoot: path.join(process.cwd(), 'test-results', '.infra-performance-aggregation'),
  runToken: PERFORMANCE_RUN_TOKEN,
});

const waitForReports = ({ store, projectName, expectedCount }) =>
  waitForReportsHelper({
    store,
    projectName,
    expectedCount,
    timeoutMs: Math.max(60000, expectedCount * 5000),
  });

test.describe('Functionality: Core Infrastructure', () => {
  configuredPages.forEach((testPage, index) => {
    test(`Page availability ${index + 1}/${configuredPages.length}: ${testPage}`, async ({
      page,
    }, testInfo) => {
      const pageReport = {
        page: testPage,
        status: null,
        elements: null,
        notes: [],
        index: index + 1,
        runToken: AVAILABILITY_RUN_TOKEN,
      };
      let pageTitle = '';

      try {
        const response = await navigateForAudit(page, `${siteConfig.baseUrl}${testPage}`);
        pageReport.status = response.status();
        await waitForWordPressReady(page);

        const is404 = await detect404LikePage(page);
        if (is404) {
          pageReport.notes.push({ type: 'warning', message: '404 page detected' });
        }

        if (pageReport.status >= 500) {
          throw new Error(`Server error on ${testPage}: ${pageReport.status}`);
        }
        if (pageReport.status >= 400) {
          pageReport.notes.push({ type: 'warning', message: `Client error ${pageReport.status}` });
        }

        if (pageReport.status >= 200 && pageReport.status < 300) {
          pageReport.elements = await collectCriticalElements(page);
          pageTitle = await getPageTitle(page);
          pageReport.notes.push({ type: 'info', message: `Title present: ${Boolean(pageTitle)}` });
          Object.entries(pageReport.elements).forEach(([key, value]) => {
            if (!value) {
              pageReport.notes.push({ type: 'warning', message: `${key} missing` });
            }
          });
        }
      } catch (error) {
        pageReport.error = error?.message || String(error);
        pageReport.status ??= extractStatusFromError(error);
      } finally {
        availabilityStore.record(testInfo.project.name, pageReport);
        const schemaPayloads = buildAvailabilitySchemaPayloads([pageReport], testInfo.project.name);
        const pagePayload = schemaPayloads?.pagePayloads?.[0];
        if (pagePayload) {
          await attachSchemaSummary(testInfo, pagePayload);
        }
      }

      if (pageReport.status && pageReport.status >= 500) {
        expect.soft(pageReport.status).toBeLessThan(500);
      }
      if (pageReport.status >= 200 && pageReport.status < 300) {
        expect.soft(pageTitle).toBeTruthy();
      }
    });
  });

  configuredPages.forEach((testPage, index) => {
    test(`HTTP response validation ${index + 1}/${configuredPages.length}: ${testPage}`, async ({
      page,
    }, testInfo) => {
      const pageReport = {
        page: testPage,
        status: null,
        statusText: '',
        checks: [],
        index: index + 1,
        runToken: HTTP_RUN_TOKEN,
      };

      const recordCheck = (label, passed, details = null) => {
        pageReport.checks.push({
          label,
          passed,
          details: details ? String(details) : null,
        });
      };

      try {
        const response = await navigateForAudit(page, `${siteConfig.baseUrl}${testPage}`);
        pageReport.status = response.status();
        pageReport.statusText = response.statusText ? response.statusText() : '';

        const acceptableStatus = [200, 301, 302].includes(pageReport.status);
        recordCheck('HTTP status is acceptable (200/301/302)', acceptableStatus, pageReport.status);

        if (pageReport.status === 200) {
          const contentType = response.headers()['content-type'] || '';
          recordCheck(
            'Content-Type includes text/html',
            contentType.includes('text/html'),
            contentType || 'missing'
          );
          recordCheck(
            'html[lang] attribute present',
            (await page.locator('html[lang]').count()) > 0
          );
          recordCheck(
            'charset meta tag present',
            (await page.locator('meta[charset], meta[http-equiv="Content-Type"]').count()) > 0
          );
          recordCheck(
            'viewport meta tag present',
            (await page.locator('meta[name="viewport"]').count()) > 0
          );

          const bodyText = await page.locator('body').textContent();
          const fatalErrorPresent = /Fatal error/i.test(bodyText || '');
          const warningPresent = /Warning:/i.test(bodyText || '');
          const noticePresent = /Notice:/i.test(bodyText || '');
          recordCheck(
            'No PHP fatal/warning/notice text',
            !fatalErrorPresent && !warningPresent && !noticePresent
          );
        }

        if (pageReport.status >= 300 && pageReport.status < 400) {
          pageReport.location = response.headers()['location'] || '';
        }
      } catch (error) {
        pageReport.error = error?.message || String(error);
        pageReport.status ??= extractStatusFromError(error);
      } finally {
        httpStore.record(testInfo.project.name, pageReport);
        const schemaPayloads = buildHttpSchemaPayloads([pageReport], testInfo.project.name);
        const pagePayload = schemaPayloads?.pagePayloads?.[0];
        if (pagePayload) {
          await attachSchemaSummary(testInfo, pagePayload);
        }
      }

      expect.soft(pageReport.checks.filter((check) => !check.passed)).toHaveLength(0);
      expect.soft(pageReport.error || null).toBeNull();
    });
  });

  const perfBudgets =
    typeof siteConfig.performanceBudgets === 'object' && siteConfig.performanceBudgets !== null
      ? siteConfig.performanceBudgets
      : null;

  performancePages.forEach((testPage, index) => {
    test(`Performance monitoring ${index + 1}/${performancePages.length}: ${testPage}`, async ({
      page,
    }, testInfo) => {
      const pageReport = {
        page: testPage,
        status: null,
        loadTime: null,
        domContentLoaded: null,
        loadComplete: null,
        firstPaint: null,
        firstContentfulPaint: null,
        notes: [],
        breaches: [],
        index: index + 1,
        runToken: PERFORMANCE_RUN_TOKEN,
      };

      try {
        const startTime = Date.now();
        const response = await navigateForAudit(page, `${siteConfig.baseUrl}${testPage}`);
        pageReport.status = response.status();
        if (pageReport.status !== 200) {
          pageReport.notes.push({
            type: 'warning',
            message: `Performance metrics skipped because navigation returned ${pageReport.status}`,
          });
          return;
        }

        await waitForPageStability(page, { timeout: 10000 });
        pageReport.loadTime = Date.now() - startTime;

        const metrics = await capturePerformanceMetrics(page);
        pageReport.domContentLoaded = normaliseMetric(metrics.domContentLoaded);
        pageReport.loadComplete = normaliseMetric(metrics.loadComplete);
        pageReport.firstPaint = normaliseMetric(metrics.firstPaint);
        pageReport.firstContentfulPaint = normaliseMetric(metrics.firstContentfulPaint);

        if (perfBudgets) {
          const budgetChecks = {
            domContentLoaded: pageReport.domContentLoaded,
            loadComplete: pageReport.loadComplete,
            firstContentfulPaint: pageReport.firstContentfulPaint,
          };

          for (const [budgetKey, value] of Object.entries(budgetChecks)) {
            if (!Object.prototype.hasOwnProperty.call(perfBudgets, budgetKey)) continue;
            const budget = Number(perfBudgets[budgetKey]);
            if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(value)) continue;
            if (value > budget) {
              pageReport.breaches.push({ page: testPage, metric: budgetKey, value, budget });
              expect.soft(value).toBeLessThanOrEqual(budget);
            }
          }
        }
      } catch (error) {
        pageReport.error = error?.message || String(error);
        pageReport.status ??= extractStatusFromError(error);
      } finally {
        performanceStore.record(testInfo.project.name, pageReport);
        const schemaPayloads = buildPerformanceSchemaPayloads(
          [pageReport],
          pageReport.breaches,
          testInfo.project.name
        );
        const pagePayload = schemaPayloads?.pagePayloads?.[0];
        if (pagePayload) {
          await attachSchemaSummary(testInfo, pagePayload);
        }
      }

      expect.soft(pageReport.error || null).toBeNull();
    });
  });

  test.describe.serial('Infrastructure summaries', () => {
    test('Availability summary', async ({}, testInfo) => {
      const reports = (
        await waitForReports({
          store: availabilityStore,
          projectName: testInfo.project.name,
          expectedCount: configuredPages.length,
        })
      ).filter((report) => report.runToken === AVAILABILITY_RUN_TOKEN);
      const schemaPayloads = buildAvailabilitySchemaPayloads(reports, testInfo.project.name);
      if (!schemaPayloads) return;
      await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      for (const payload of schemaPayloads.pagePayloads) {
        await attachSchemaSummary(testInfo, payload);
      }
    });

    test('HTTP summary', async ({}, testInfo) => {
      const reports = (
        await waitForReports({
          store: httpStore,
          projectName: testInfo.project.name,
          expectedCount: configuredPages.length,
        })
      ).filter((report) => report.runToken === HTTP_RUN_TOKEN);
      const schemaPayloads = buildHttpSchemaPayloads(reports, testInfo.project.name);
      if (!schemaPayloads) return;
      await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      for (const payload of schemaPayloads.pagePayloads) {
        await attachSchemaSummary(testInfo, payload);
      }
    });

    test('Performance summary', async ({}, testInfo) => {
      const reports = (
        await waitForReports({
          store: performanceStore,
          projectName: testInfo.project.name,
          expectedCount: performancePages.length,
        })
      ).filter((report) => report.runToken === PERFORMANCE_RUN_TOKEN);
      const allBreaches = reports.flatMap((report) => report.breaches || []);
      const schemaPayloads = buildPerformanceSchemaPayloads(
        reports,
        allBreaches,
        testInfo.project.name
      );
      if (!schemaPayloads) return;
      await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      for (const payload of schemaPayloads.pagePayloads) {
        await attachSchemaSummary(testInfo, payload);
      }
    });
  });
});
