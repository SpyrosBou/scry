const path = require('path');
const { test, expect } = require('../utils/test-fixtures');
const { safeNavigate, waitForPageStability } = require('../utils/test-helpers');
const { createTestData } = require('../utils/test-data-factory');
const {
  clearFormFields,
  fillFormFields,
  getFormLocator,
  getSubmitLocator,
  waitForFormValidationState,
} = require('../utils/form-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const {
  buildRunSummaryPayload,
  buildPageSummaryPayload,
} = require('../utils/report-summary-builder');
const { getActiveSiteContext } = require('../utils/test-context');
const { createAggregationStore } = require('../utils/report-aggregation-store');
const { waitForReports: waitForReportsHelper } = require('../utils/a11y-aggregation-waiter');

const { siteConfig } = getActiveSiteContext();
const configuredPages = process.env.SMOKE
  ? Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/')
    ? ['/']
    : [siteConfig.testPages[0]].filter(Boolean)
  : siteConfig.testPages;
const totalPages = configuredPages.length;
const RUN_TOKEN = process.env.INTERACTIVE_SMOKE_RUN_TOKEN || `${Date.now()}`;
if (!process.env.INTERACTIVE_SMOKE_RUN_TOKEN) {
  process.env.INTERACTIVE_SMOKE_RUN_TOKEN = RUN_TOKEN;
}
const AGGREGATION_PERSIST_ROOT = path.join(
  process.cwd(),
  'test-results',
  '.interactive-aggregation'
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

const buildInteractiveSchemaPayloads = ({ pages, resourceBudget, projectName }) => {
  if (!Array.isArray(pages) || pages.length === 0) return null;

  const enrichedPages = pages.map((entry) => {
    const warningNotes = entry.notes
      .filter((note) => note.type === 'warning')
      .map((note) => note.message);
    const infoNotes = entry.notes
      .filter((note) => note.type !== 'warning')
      .map((note) => note.message);
    const gatingIssues = [
      ...entry.consoleErrors.map((error) => `Console error: ${error.message}`),
      ...entry.resourceErrors.map((error) => {
        if (error.status) {
          return `Resource ${error.type || 'response'} ${error.status} on ${error.url}`;
        }
        if (error.failure) {
          return `Resource ${error.type || 'request'} failed (${error.failure}) on ${error.url}`;
        }
        return `Resource ${error.type || 'request'} issue on ${error.url}`;
      }),
    ];
    return {
      page: entry.page,
      status: entry.status,
      consoleErrors: entry.consoleErrors,
      resourceErrors: entry.resourceErrors,
      gating: gatingIssues,
      warnings: warningNotes,
      advisories: [],
      notes: infoNotes,
    };
  });

  const totalConsoleErrors = enrichedPages.reduce(
    (total, entry) => total + entry.consoleErrors.length,
    0
  );
  const totalResourceErrors = enrichedPages.reduce(
    (total, entry) => total + entry.resourceErrors.length,
    0
  );
  const pagesWithConsoleErrors = enrichedPages.filter(
    (entry) => entry.consoleErrors.length > 0
  ).length;
  const pagesWithResourceErrors = enrichedPages.filter(
    (entry) => entry.resourceErrors.length > 0
  ).length;
  const pagesWithWarnings = enrichedPages.filter((entry) => entry.warnings.length > 0).length;
  const pagesWithGatingIssues = enrichedPages.filter((entry) => entry.gating.length > 0).length;

  const runPayload = buildRunSummaryPayload({
    prefix: 'interactive',
    key: projectName,
    title: 'Interactive smoke summary',
    overview: {
      totalPages: pages.length,
      totalConsoleErrors,
      totalResourceErrors,
      pagesWithConsoleErrors,
      pagesWithResourceErrors,
      pagesWithGatingIssues,
      pagesWithWarnings,
      resourceErrorBudget: resourceBudget,
      budgetExceeded: totalResourceErrors > resourceBudget,
    },
    metadata: {
      spec: 'functionality.interactive.smoke',
      summaryType: 'interactive',
      projectName,
      scope: 'project',
    },
  });

  runPayload.details = {
    pages: enrichedPages.map((entry) => ({
      page: entry.page,
      status: entry.status,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
      consoleErrors: entry.consoleErrors.length,
      resourceErrors: entry.resourceErrors.length,
    })),
  };

  const MAX_SAMPLE = 10;
  const pagePayloads = enrichedPages.map((entry) => {
    const consoleSample = entry.consoleErrors.slice(0, MAX_SAMPLE).map((error) => ({
      message: error.message,
      url: error.url || null,
    }));
    const resourceSample = entry.resourceErrors.slice(0, MAX_SAMPLE).map((error) => ({
      type: error.type,
      status: error.status ?? null,
      method: error.method || null,
      url: error.url,
      failure: error.failure || null,
    }));

    return buildPageSummaryPayload({
      prefix: 'interactive',
      projectName,
      viewport: projectName,
      page: entry.page,
      title: `Interactive checks – ${entry.page}`,
      summary: {
        status: entry.status,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
        consoleErrors: entry.consoleErrors.length,
        resourceErrors: entry.resourceErrors.length,
        consoleSample,
        resourceSample,
      },
      metadata: {
        spec: 'functionality.interactive.smoke',
        summaryType: 'interactive',
        projectName,
        resourceErrorBudget: resourceBudget,
      },
    });
  });

  return { runPayload, pagePayloads };
};

const buildIgnoreMatchers = (patterns) => {
  return patterns.map((pattern) => {
    try {
      return new RegExp(pattern, 'i');
    } catch (_error) {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(escaped, 'i');
    }
  });
};

test.describe('Functionality: Interactive Elements', () => {
  const defaultIgnored = ['analytics', 'google-analytics', 'gtag', 'facebook', 'twitter'];
  const consoleIgnoreMatchers = buildIgnoreMatchers([
    ...defaultIgnored,
    ...(Array.isArray(siteConfig.ignoreConsoleErrors) ? siteConfig.ignoreConsoleErrors : []),
  ]);
  const resourceIgnoreMatchers = buildIgnoreMatchers([
    ...defaultIgnored,
    ...(Array.isArray(siteConfig.ignoreResourceErrors)
      ? siteConfig.ignoreResourceErrors
      : Array.isArray(siteConfig.ignoreConsoleErrors)
        ? siteConfig.ignoreConsoleErrors
        : []),
  ]);

  const resourceBudget =
    typeof siteConfig.resourceErrorBudget === 'number' ? siteConfig.resourceErrorBudget : 0;

  configuredPages.forEach((testPage, index) => {
    test(`JavaScript error detection ${index + 1}/${totalPages}: ${testPage}`, async ({
      context,
    }, testInfo) => {
      const pageReport = {
        page: testPage,
        status: null,
        consoleErrors: [],
        resourceErrors: [],
        notes: [],
        index: index + 1,
        runToken: RUN_TOKEN,
      };

      try {
        let attempts = 0;
        while (attempts < 2) {
          const activePage = await context.newPage();
          const listener = (msg) => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            if (consoleIgnoreMatchers.some((re) => re.test(text))) return;
            pageReport.consoleErrors.push({ message: text, url: activePage.url() });
          };
          activePage.on('console', listener);

          const recordResourceError = (type, url, extra = {}) => {
            const resourceSignature = `${type || ''} ${url || ''} ${extra.failure || ''} ${extra.status || ''}`;
            if (resourceIgnoreMatchers.some((re) => re.test(resourceSignature))) return;
            pageReport.resourceErrors.push({ type, url, ...extra });
          };

          const requestFailedListener = (request) => {
            recordResourceError('requestfailed', request.url(), {
              failure: request.failure()?.errorText || 'unknown',
            });
          };
          const responseListener = (response) => {
            const status = response.status();
            if (status >= 400) {
              recordResourceError('response', response.url(), {
                status,
                method: response.request().method(),
              });
            }
          };
          activePage.on('requestfailed', requestFailedListener);
          activePage.on('response', responseListener);

          try {
            const response = await safeNavigate(activePage, `${siteConfig.baseUrl}${testPage}`);
            pageReport.status = response.status();
            if (pageReport.status !== 200) {
              pageReport.notes.push({
                type: 'warning',
                message: `Navigation returned ${pageReport.status}`,
              });
              await activePage.close();
              break;
            }
            await waitForPageStability(activePage);
            const interactiveSelectors = ['button', 'a', 'input', 'select', 'textarea'];
            for (const selector of interactiveSelectors) {
              const locator = activePage.locator(selector);
              for (let i = 0; i < 3; i++) {
                let element;
                try {
                  element = locator.nth(i);
                  await element.waitFor({ state: 'attached', timeout: 1500 });
                } catch {
                  break;
                }
                try {
                  await element.scrollIntoViewIfNeeded({ timeout: 1500 });
                  if (selector === 'a') {
                    await element.hover({ timeout: 1500 });
                  } else {
                    await element.dispatchEvent('focus');
                  }
                } catch (error) {
                  const message = `Interaction skipped for ${selector} #${i}: ${error.message}`;
                  console.log(`⚠️  ${message}`);
                  pageReport.notes.push({ type: 'warning', message });
                }
              }
            }
            pageReport.notes.push({ type: 'info', message: 'Interaction cycle executed' });
            await activePage.close();
            break;
          } catch (error) {
            attempts += 1;
            await activePage.close();
            if (/page is closed/i.test(error.message) && attempts < 2) {
              const note = `Retry due to closed page (${error.message})`;
              console.log(`⚠️  ${note}`);
              pageReport.notes.push({ type: 'warning', message: note });
              continue;
            }
            throw error;
          } finally {
            activePage.off('console', listener);
            activePage.off('requestfailed', requestFailedListener);
            activePage.off('response', responseListener);
          }
        }

        if (pageReport.status === null) {
          pageReport.notes.push({ type: 'warning', message: 'Navigation did not complete' });
        } else if (pageReport.status === 200 && pageReport.consoleErrors.length === 0) {
          pageReport.notes.push({ type: 'info', message: 'No console errors detected' });
        }
      } finally {
        aggregationStore.record(testInfo.project.name, pageReport);
      }

      const schemaPayloads = buildInteractiveSchemaPayloads({
        pages: [pageReport],
        resourceBudget,
        projectName: testInfo.project.name,
      });
      const pagePayload = schemaPayloads?.pagePayloads?.[0];
      if (pagePayload) {
        await attachSchemaSummary(testInfo, pagePayload);
      }

      if (pageReport.consoleErrors.length > 0) {
        console.error(
          `❌ JavaScript errors detected on ${testPage}: ${pageReport.consoleErrors.length}`
        );
      } else {
        console.log(`✅ No JavaScript errors detected during interactions on ${testPage}`);
      }

      expect.soft(pageReport.consoleErrors.length).toBe(0);
    });
  });

  test.describe.serial('Interactive smoke summary', () => {
    test('Aggregate results', async ({}, testInfo) => {
      if (totalPages === 0) {
        console.warn('ℹ️  Interactive smoke suite executed with no configured pages.');
        return;
      }

      const reports = (await waitForReports(testInfo.project.name)).filter(
        (report) => report.runToken === RUN_TOKEN && typeof report.index === 'number'
      );
      if (reports.length === 0) {
        console.warn('ℹ️  Interactive smoke suite produced no page reports.');
        return;
      }

      const schemaPayloads = buildInteractiveSchemaPayloads({
        pages: reports,
        resourceBudget,
        projectName: testInfo.project.name,
      });
      if (schemaPayloads?.runPayload) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      }

      const totalResourceErrors = reports.reduce(
        (total, entry) => total + (entry.resourceErrors?.length || 0),
        0
      );
      if (totalResourceErrors > 0) {
        const summary = reports
          .flatMap((entry) => entry.resourceErrors || [])
          .slice(0, 5)
          .map((entry) =>
            entry.type === 'requestfailed'
              ? `requestfailed ${entry.url} (${entry.failure})`
              : `response ${entry.status} ${entry.url}`
          )
          .join('\n');
        console.error(
          `❌ Resource load issues detected: ${totalResourceErrors} (showing up to 5)\n${summary}`
        );
      }
      expect.soft(totalResourceErrors).toBeLessThanOrEqual(resourceBudget);
    });
  });

  test('Form interactions and validation (if configured)', async ({ page }) => {
    if (!siteConfig.forms || siteConfig.forms.length === 0) {
      console.log('ℹ️  No forms configured for testing');
      return;
    }

    const testData = createTestData('contact');
    for (const formConfig of siteConfig.forms) {
      await test.step(`Testing form: ${formConfig.name}`, async () => {
        const formPage = formConfig.page || '/contact';
        try {
          const response = await safeNavigate(page, `${siteConfig.baseUrl}${formPage}`);
          if (response.status() !== 200) return;
          await waitForPageStability(page);

          const formLocator = await fillFormFields(page, formConfig, {
            name: testData.formData.name,
            email: testData.formData.email,
            message: testData.formData.message,
          });
          const resolvedForm = formLocator || getFormLocator(page, formConfig);

          await test.step('Testing form validation', async () => {
            await clearFormFields(resolvedForm);
            const submitButton = getSubmitLocator(page, formConfig);
            await submitButton.click({ timeout: 5000 });
            const hasValidationFeedback = await waitForFormValidationState(page, resolvedForm);
            if (!hasValidationFeedback) {
              console.log('⚠️  Form validation may not be working as expected');
            }
            await expect.soft(resolvedForm).toBeVisible();
          });
        } catch (error) {
          console.log(`⚠️  Form testing failed for ${formConfig.name}: ${error.message}`);
        }
      });
    }
  });
});
