const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { WordPressPageObjects } = require('../utils/wordpress-page-objects');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';

const buildAvailabilitySchemaPayloads = (results, projectName) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  const runBaseName = `infra-availability-${slugify(projectName)}`;
  const enrichedResults = results.map((entry) => {
    const warnings = entry.notes
      .filter((note) => note.type === 'warning')
      .map((note) => note.message);
    const notes = entry.notes
      .filter((note) => note.type !== 'warning')
      .map((note) => note.message);
    const gating = [];
    if (entry.status === null || entry.status === undefined) {
      gating.push('No HTTP response status captured for this request.');
    } else if (entry.status >= 500) {
      gating.push(`Server responded with ${entry.status}; page unavailable.`);
    }
    const missingStructural = [];
    if (entry.elements) {
      Object.entries(entry.elements).forEach(([key, value]) => {
        if (value === false) {
          const message = `${key} landmark missing`;
          missingStructural.push(message);
          gating.push(message);
        }
      });
    }
    return {
      page: entry.page,
      status: entry.status,
      elements: entry.elements || null,
      gating,
      warnings,
      advisories: [],
      notes,
      missingStructural,
    };
  });
  const pagesWithWarnings = enrichedResults.filter((entry) => entry.warnings.length > 0).length;
  const pagesWithErrors = enrichedResults.filter((entry) => (entry.status || 0) >= 400).length;
  const missingElements = enrichedResults.reduce(
    (total, entry) => total + entry.missingStructural.length,
    0
  );

  const runPayload = createRunSummaryPayload({
    baseName: runBaseName,
    title: 'Availability & uptime summary',
    overview: {
      totalPages: enrichedResults.length,
      pagesWithErrors,
      pagesWithWarnings,
      missingStructureElements: missingElements,
      pagesWithGatingIssues: enrichedResults.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.infrastructure.health',
      summaryType: 'availability',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
    },
  });

  runPayload.details = {
    pages: enrichedResults.map((entry) => ({
      page: entry.page,
      status: entry.status,
      elements: entry.elements || null,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedResults.map((entry) =>
    createPageSummaryPayload({
      baseName: runBaseName,
      title: `Availability – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        status: entry.status,
        elements: entry.elements || null,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'functionality.infrastructure.health',
        summaryType: 'availability',
        projectName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildHttpSchemaPayloads = (results, projectName) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  const runBaseName = `infra-http-${slugify(projectName)}`;
  const enrichedResults = results.map((entry) => {
    const failedChecks = entry.checks
      .filter((check) => !check.passed)
      .map((check) => ({
        label: check.label,
        details: check.details || null,
      }));
    const gating = [];
    const warnings = [];
    if (entry.status >= 500) {
      gating.push(`Received ${entry.status} ${entry.statusText || ''}`.trim());
    } else if (entry.status >= 400) {
      warnings.push(`Client error ${entry.status} ${entry.statusText || ''}`.trim());
    }
    if (failedChecks.length > 0) {
      gating.push(...failedChecks.map((check) => `Failed check: ${check.label}`));
    }
    if (entry.error) {
      gating.push(entry.error);
    }
    const notes = [];
    if (entry.status >= 300 && entry.status < 400 && entry.location) {
      notes.push(`Redirects to ${entry.location}`);
    }
    return {
      page: entry.page,
      status: entry.status,
      statusText: entry.statusText,
      redirectLocation: entry.location || null,
      failedChecks,
      gating,
      warnings,
      advisories: [],
      notes,
    };
  });
  const redirects = enrichedResults.filter(
    (entry) => entry.status >= 300 && entry.status < 400
  ).length;
  const errors = enrichedResults.filter((entry) => entry.status >= 400).length;
  const failedChecks = enrichedResults.filter((entry) => entry.failedChecks.length > 0).length;

  const runPayload = createRunSummaryPayload({
    baseName: runBaseName,
    title: 'HTTP response validation summary',
    overview: {
      totalPages: enrichedResults.length,
      success2xx: enrichedResults.filter((entry) => entry.status === 200).length,
      redirects,
      errors,
      pagesWithFailedChecks: failedChecks,
      pagesWithGatingIssues: enrichedResults.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.infrastructure.health',
      summaryType: 'http',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
    },
  });

  runPayload.details = {
    pages: enrichedResults.map((entry) => ({
      page: entry.page,
      status: entry.status,
      statusText: entry.statusText,
      redirectLocation: entry.redirectLocation,
      failedChecks: entry.failedChecks,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedResults.map((entry) =>
    createPageSummaryPayload({
      baseName: runBaseName,
      title: `HTTP validation – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        status: entry.status,
        statusText: entry.statusText,
        redirectLocation: entry.redirectLocation,
        failedChecks: entry.failedChecks,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'functionality.infrastructure.health',
        summaryType: 'http',
        projectName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildPerformanceSchemaPayloads = (data, breaches, projectName) => {
  if (!Array.isArray(data) || data.length === 0) return null;

  const averageLoadTime = data.reduce((acc, entry) => acc + entry.loadTime, 0) / data.length;

  const roundMetric = (value) => {
    if (value === null || value === undefined) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.round(numeric);
  };

  const breachMap = new Map();
  breaches.forEach((entry) => {
    const list = breachMap.get(entry.page) || [];
    list.push({ metric: entry.metric, value: entry.value, budget: entry.budget });
    breachMap.set(entry.page, list);
  });

  const runBaseName = `infra-performance-${slugify(projectName)}`;
  const pageSummaries = data.map((entry) => {
    const breachesForPage = breachMap.get(entry.page) || [];
    const gating = breachesForPage.map(
      (breach) =>
        `${breach.metric} exceeded budget (${Math.round(breach.value)}ms > ${Math.round(
          breach.budget
        )}ms)`
    );
    const notes = [];
    const loadTime = roundMetric(entry.loadTime);
    if (Number.isFinite(loadTime)) {
      notes.push(`Observed load time: ${loadTime}ms`);
    }
    return {
      page: entry.page,
      metrics: {
        loadTimeMs: roundMetric(entry.loadTime),
        domContentLoadedMs: roundMetric(entry.domContentLoaded),
        loadCompleteMs: roundMetric(entry.loadComplete),
        firstContentfulPaintMs: roundMetric(entry.firstContentfulPaint),
        firstPaintMs: roundMetric(entry.firstPaint),
      },
      breaches: breachesForPage,
      gating,
      warnings: [],
      advisories: [],
      notes,
    };
  });

  const runPayload = createRunSummaryPayload({
    baseName: runBaseName,
    title: 'Performance monitoring summary',
    overview: {
      pagesSampled: pageSummaries.length,
      averageLoadTimeMs: Math.round(averageLoadTime),
      budgetBreaches: breaches.length,
      pagesWithGatingIssues: pageSummaries.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.infrastructure.health',
      summaryType: 'performance',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
    },
  });

  runPayload.details = {
    pages: pageSummaries.map((entry) => ({
      page: entry.page,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
      budgetBreaches: entry.breaches,
      metrics: entry.metrics,
    })),
  };

  const pagePayloads = pageSummaries.map((entry) =>
    createPageSummaryPayload({
      baseName: runBaseName,
      title: `Performance – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        loadTimeMs: entry.metrics.loadTimeMs,
        domContentLoadedMs: entry.metrics.domContentLoadedMs,
        loadCompleteMs: entry.metrics.loadCompleteMs,
        firstContentfulPaintMs: entry.metrics.firstContentfulPaintMs,
        firstPaintMs: entry.metrics.firstPaintMs,
        budgetBreaches: entry.breaches,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'functionality.infrastructure.health',
        summaryType: 'performance',
        projectName,
      },
    })
  );

  runPayload.details = {
    pages: data.map((entry) => ({
      page: entry.page,
      loadTimeMs: roundMetric(entry.loadTime),
      domContentLoadedMs: roundMetric(entry.domContentLoaded),
      loadCompleteMs: roundMetric(entry.loadComplete),
      firstPaintMs: roundMetric(entry.firstPaint),
      firstContentfulPaintMs: roundMetric(entry.firstContentfulPaint),
      budgetBreaches: breachMap.get(entry.page) || [],
    })),
  };

  return { runPayload, pagePayloads };
};

test.describe('Functionality: Core Infrastructure', () => {
  let siteConfig;
  let errorContext;
  let wpPageObjects;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');

    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);

    errorContext = sharedErrorContext;
    wpPageObjects = new WordPressPageObjects(page, siteConfig);
  });

  test('Page availability across configured pages', async ({ page }) => {
    test.setTimeout(7200000);
    errorContext.setTest('Page Availability Check');
    const availabilityResults = [];

    const pagesToTest = process.env.SMOKE
      ? (Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/'))
        ? ['/']
        : [siteConfig.testPages[0]]
      : siteConfig.testPages;

    for (const testPage of pagesToTest) {
      await test.step(`Checking page availability: ${testPage}`, async () => {
        errorContext.setPage(testPage);
        errorContext.setAction('navigating to page');

        const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        const entry = {
          page: testPage,
          status: response ? response.status() : null,
          elements: null,
          notes: [],
        };
        await wpPageObjects.basePage.waitForWordPressReady();
        const is404 = await wpPageObjects.is404Page();
        if (is404) {
          entry.notes.push({ type: 'warning', message: '404 page detected' });
          console.log(`⚠️  Page not found: ${testPage}`);
          await page.screenshot({ path: `test-results/404-${testPage.replace(/\//g, '-')}.png` });
          availabilityResults.push(entry);
          return;
        }
        if (entry.status >= 500)
          throw new Error(`Server error on ${testPage}: ${entry.status}`);
        if (entry.status >= 400) {
          console.log(`⚠️  Client error on ${testPage}: ${entry.status}`);
          entry.notes.push({ type: 'warning', message: `Client error ${entry.status}` });
        }

        if (entry.status >= 200 && entry.status < 300) {
          const elements = await wpPageObjects.verifyCriticalElements();
          console.log(`✅ Page structure check for ${testPage}:`, elements);
          const title = await wpPageObjects.getTitle();
          expect(title).toBeTruthy();
          entry.elements = elements;
          entry.notes.push({ type: 'info', message: `Title present: ${Boolean(title)}` });
          Object.entries(elements).forEach(([key, value]) => {
            if (!value) entry.notes.push({ type: 'warning', message: `${key} missing` });
          });
        }
        availabilityResults.push(entry);
      });
    }

    if (availabilityResults.length > 0) {
      const testInfo = test.info();
      const schemaPayloads = buildAvailabilitySchemaPayloads(availabilityResults, testInfo.project.name);
      if (schemaPayloads) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
        for (const payload of schemaPayloads.pagePayloads) {
          await attachSchemaSummary(testInfo, payload);
        }
      }
    }
  });

  test('HTTP response and content integrity', async ({ page }) => {
    test.setTimeout(7200000);
    errorContext.setTest('HTTP Response Validation');
    const responseResults = [];
    const pagesToTest = process.env.SMOKE
      ? (Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/'))
        ? ['/']
        : [siteConfig.testPages[0]]
      : siteConfig.testPages;

    let deferredError = null;
    for (const testPage of pagesToTest) {
      try {
        await test.step(`Validating response for: ${testPage}`, async () => {
          errorContext.setPage(testPage);
          const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
          if (!response) {
            throw new Error(`No HTTP response received for ${testPage}`);
          }

        const status = response.status();
        const statusText = response.statusText ? response.statusText() : '';
        const entry = {
          page: testPage,
          status,
          statusText,
          checks: [],
        };

        const recordCheck = (label, passed, details) => {
          entry.checks.push({
            label,
            passed,
            details: details ? String(details) : null,
          });
        };

        const runCheck = async (label, assertion) => {
          try {
            await assertion();
            recordCheck(label, true);
          } catch (error) {
            recordCheck(label, false, error?.message || error);
            throw error;
          }
        };

        try {
          await runCheck('HTTP status is acceptable (200/301/302)', () =>
            expect([200, 301, 302]).toContain(status)
          );

          if (status === 200) {
            const contentType = response.headers()['content-type'] || '';
            await runCheck('Content-Type includes text/html', () =>
              expect(contentType).toContain('text/html')
            );

            await runCheck('html[lang] attribute present', () =>
              expect(page.locator('html[lang]')).toBeAttached()
            );

            await runCheck('charset meta tag present', () =>
              expect(page.locator('meta[charset], meta[http-equiv="Content-Type"]')).toBeAttached()
            );

            await runCheck('viewport meta tag present', () =>
              expect(page.locator('meta[name="viewport"]')).toBeAttached()
            );

            await runCheck('No PHP fatal/warning/notice text', async () => {
              const bodyText = await page.locator('body').textContent();
              const fatalErrorPresent = /Fatal error/i.test(bodyText || '');
              const warningPresent = /Warning:/i.test(bodyText || '');
              const noticePresent = /Notice:/i.test(bodyText || '');
              expect(fatalErrorPresent).toBe(false);
              expect(warningPresent).toBe(false);
              expect(noticePresent).toBe(false);
            });

            console.log(`✅ Response validation passed for ${testPage}`);
          }

          if (status >= 300 && status < 400) {
            entry.location = response.headers()['location'] || '';
          }
        } catch (error) {
          entry.error = error?.message || String(error);
          throw error;
        } finally {
          responseResults.push(entry);
        }
      });
      } catch (error) {
        if (!deferredError) {
          deferredError = error;
        }
      }
    }

    if (responseResults.length > 0) {
      const testInfo = test.info();
      const schemaPayloads = buildHttpSchemaPayloads(responseResults, testInfo.project.name);
      if (schemaPayloads) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
        for (const payload of schemaPayloads.pagePayloads) {
          await attachSchemaSummary(testInfo, payload);
        }
      }
    }

    if (deferredError) {
      throw deferredError;
    }
  });

  test('Performance monitoring (sample up to 5 pages)', async ({ page }) => {
    test.setTimeout(7200000);
    errorContext.setTest('Performance Monitoring');
    const performanceData = [];
    const perfBudgets =
      typeof siteConfig.performanceBudgets === 'object' &&
      siteConfig.performanceBudgets !== null
        ? siteConfig.performanceBudgets
        : null;
    const performanceBreaches = [];
    const perfPages = process.env.SMOKE
      ? (Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/'))
        ? ['/']
        : [siteConfig.testPages[0]]
      : siteConfig.testPages.slice(0, 5);

    for (const testPage of perfPages) {
      await test.step(`Measuring performance for: ${testPage}`, async () => {
        errorContext.setPage(testPage);
        const startTime = Date.now();
        const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        if (response.status() !== 200) return;
        await waitForPageStability(page, { timeout: 10000 });
        const loadTime = Date.now() - startTime;
        const metrics = await page.evaluate(() => {
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
          const firstPaint = paints.find((p) => p.name === 'first-paint')?.startTime;
          const firstContentfulPaint = paints.find((p) => p.name === 'first-contentful-paint')?.startTime;

          return {
            domContentLoaded,
            loadComplete,
            firstPaint,
            firstContentfulPaint,
          };
        });
        const normaliseMetric = (value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric < 0) {
            return null;
          }
          return numeric;
        };

        const normalisedMetrics = {
          domContentLoaded: normaliseMetric(metrics.domContentLoaded),
          loadComplete: normaliseMetric(metrics.loadComplete),
          firstPaint: normaliseMetric(metrics.firstPaint),
          firstContentfulPaint: normaliseMetric(metrics.firstContentfulPaint),
        };

        performanceData.push({ page: testPage, loadTime, ...normalisedMetrics });

        if (loadTime > 3000) console.log(`⚠️  ${testPage} took ${loadTime}ms (>3s)`);
        else console.log(`✅ ${testPage} loaded in ${loadTime}ms`);

        if (perfBudgets) {
          const budgetChecks = {
            domContentLoaded: normalisedMetrics.domContentLoaded,
            loadComplete: normalisedMetrics.loadComplete,
            firstContentfulPaint: normalisedMetrics.firstContentfulPaint,
          };

          for (const [budgetKey, value] of Object.entries(budgetChecks)) {
            if (!Object.prototype.hasOwnProperty.call(perfBudgets, budgetKey)) continue;
            const budget = Number(perfBudgets[budgetKey]);
            if (!Number.isFinite(budget) || budget <= 0) continue;
            if (!Number.isFinite(value)) {
              console.log(
                `ℹ️  ${budgetKey} metric unavailable on ${testPage}; skipping budget comparison`
              );
              continue;
            }
            if (value > budget) {
              console.log(
                `❌  ${budgetKey} for ${testPage} exceeded budget: ${Math.round(value)}ms > ${budget}ms`
              );
              performanceBreaches.push({ page: testPage, metric: budgetKey, value, budget });
              expect.soft(value).toBeLessThanOrEqual(budget);
            } else {
              console.log(
                `✅  ${budgetKey} for ${testPage} within budget (${Math.round(value)}ms <= ${budget}ms)`
              );
            }
          }
        }
      });
    }
    if (performanceData.length > 0) {
      const avg = performanceData.reduce((s, d) => s + d.loadTime, 0) / performanceData.length;
      console.log(`📊 Average load time: ${Math.round(avg)}ms`);
      if (performanceBreaches.length > 0) {
        const details = performanceBreaches
          .map(
            (entry) =>
              `${entry.metric} on ${entry.page}: ${Math.round(entry.value)}ms (budget ${entry.budget}ms)`
          )
          .join('\n');
        console.error(`⚠️  Performance budgets exceeded:\n${details}`);
      }
      const testInfo = test.info();
      const schemaPayloads = buildPerformanceSchemaPayloads(
        performanceData,
        performanceBreaches,
        testInfo.project.name
      );
      if (schemaPayloads) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
        for (const payload of schemaPayloads.pagePayloads) {
          await attachSchemaSummary(testInfo, payload);
        }
      }
    }
  });
});
