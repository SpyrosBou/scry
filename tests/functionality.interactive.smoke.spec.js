const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { TestDataFactory, createTestData } = require('../utils/test-data-factory');
const { WordPressPageObjects } = require('../utils/wordpress-page-objects');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';

const buildInteractiveSchemaPayloads = ({
  pages,
  consoleErrors,
  resourceErrors,
  resourceBudget,
  projectName,
}) => {
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
  const pagesWithConsoleErrors = enrichedPages.filter((entry) => entry.consoleErrors.length > 0).length;
  const pagesWithResourceErrors = enrichedPages.filter(
    (entry) => entry.resourceErrors.length > 0
  ).length;
  const pagesWithWarnings = enrichedPages.filter((entry) => entry.warnings.length > 0).length;
  const pagesWithGatingIssues = enrichedPages.filter((entry) => entry.gating.length > 0).length;

  const runPayload = createRunSummaryPayload({
    baseName: `interactive-${slugify(projectName)}`,
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

    return createPageSummaryPayload({
      baseName: `interactive-${slugify(projectName)}-${slugify(entry.page)}`,
      title: `Interactive checks – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
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

test.describe('Functionality: Interactive Elements', () => {
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

  test('JavaScript error detection during interactions', async ({ context }) => {
    test.setTimeout(7200000);
    const consoleErrors = [];
    const resourceErrors = [];
    const pageSummaries = [];
    const defaultIgnored = ['analytics', 'google-analytics', 'gtag', 'facebook', 'twitter'];
    const siteIgnored = Array.isArray(siteConfig.ignoreConsoleErrors)
      ? siteConfig.ignoreConsoleErrors
      : [];
    const ignoreMatchers = [...defaultIgnored, ...siteIgnored].map((pattern) => {
      try {
        return new RegExp(pattern, 'i');
      } catch (error) {
        const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(escaped, 'i');
      }
    });

    const pagesToTest = process.env.SMOKE
      ? (Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/'))
        ? ['/']
        : [siteConfig.testPages[0]]
      : siteConfig.testPages;

    for (const testPage of pagesToTest) {
      await test.step(`JS errors on: ${testPage}`, async () => {
        const perPage = {
          page: testPage,
          status: null,
          consoleErrors: [],
          resourceErrors: [],
          notes: [],
        };
        let attempts = 0;
        while (attempts < 2) {
          const activePage = await context.newPage();
          const listener = (msg) => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            if (ignoreMatchers.some((re) => re.test(text))) return;
            const entry = { message: text, url: activePage.url() };
            perPage.consoleErrors.push(entry);
            consoleErrors.push(entry);
          };
          activePage.on('console', listener);

          const recordResourceError = (type, url, extra = {}) => {
            const entry = { type, url, ...extra };
            perPage.resourceErrors.push(entry);
            resourceErrors.push(entry);
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
            perPage.status = response.status();
            if (perPage.status !== 200) {
              perPage.notes.push({ type: 'warning', message: `Navigation returned ${perPage.status}` });
              await activePage.close();
              break;
            }
            await waitForPageStability(activePage);
            const interactiveSelectors = ['button', 'a', 'input', 'select', 'textarea'];
            for (const s of interactiveSelectors) {
              const loc = activePage.locator(s);
              for (let i = 0; i < 3; i++) {
                let element;
                try {
                  element = loc.nth(i);
                  await element.waitFor({ state: 'attached', timeout: 1500 });
                } catch {
                  break;
                }
                try {
                  await element.scrollIntoViewIfNeeded({ timeout: 1500 });
                  if (s === 'a') await element.hover({ timeout: 1500 });
                  else await element.dispatchEvent('focus');
                } catch (error) {
                  const message = `Interaction skipped for ${s} #${i}: ${error.message}`;
                  console.log(`⚠️  ${message}`);
                  perPage.notes.push({ type: 'warning', message });
                }
              }
            }
            perPage.notes.push({ type: 'info', message: 'Interaction cycle executed' });
            await activePage.close();
            break;
          } catch (error) {
            attempts += 1;
            await activePage.close();
            if (/page is closed/i.test(error.message) && attempts < 2) {
              const note = `Retry due to closed page (${error.message})`;
              console.log(`⚠️  ${note}`);
              perPage.notes.push({ type: 'warning', message: note });
              continue;
            }
            throw error;
          } finally {
            activePage.off('console', listener);
            activePage.off('requestfailed', requestFailedListener);
            activePage.off('response', responseListener);
          }
        }
        if (perPage.status === null) {
          perPage.notes.push({ type: 'warning', message: 'Navigation did not complete' });
        } else if (perPage.status === 200 && perPage.consoleErrors.length === 0) {
          perPage.notes.push({ type: 'info', message: 'No console errors detected' });
        }
        pageSummaries.push(perPage);
      });
    }

    if (consoleErrors.length > 0) {
      console.error(`❌ JavaScript errors detected: ${consoleErrors.length}`);
      expect.soft(consoleErrors.length).toBe(0);
    } else {
      console.log('✅ No JavaScript errors detected during interactions');
    }

    const resourceBudget =
      typeof siteConfig.resourceErrorBudget === 'number' ? siteConfig.resourceErrorBudget : 0;
    if (resourceErrors.length > 0) {
      const summary = resourceErrors
        .slice(0, 5)
        .map((entry) =>
          entry.type === 'requestfailed'
            ? `requestfailed ${entry.url} (${entry.failure})`
            : `response ${entry.status} ${entry.url}`
        )
        .join('\n');
      console.error(
        `❌ Resource load issues detected: ${resourceErrors.length} (showing up to 5)\n${summary}`
      );
    }
    expect.soft(resourceErrors.length).toBeLessThanOrEqual(resourceBudget);

    const schemaPayloads = buildInteractiveSchemaPayloads({
      pages: pageSummaries,
      consoleErrors,
      resourceErrors,
      resourceBudget,
      projectName: test.info().project.name,
    });
    if (schemaPayloads) {
      const testInfo = test.info();
      await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      for (const payload of schemaPayloads.pagePayloads) {
        await attachSchemaSummary(testInfo, payload);
      }
    }
  });

  test('Form interactions and validation (if configured)', async ({ page }) => {
    test.setTimeout(7200000);
    if (!siteConfig.forms || siteConfig.forms.length === 0) {
      console.log('ℹ️  No forms configured for testing');
      return;
    }
    const testData = createTestData('contact');
    for (const formConfig of siteConfig.forms) {
      await test.step(`Testing form: ${formConfig.name}`, async () => {
        const formPage = formConfig.page || '/contact';
        const response = await wpPageObjects.navigate(`${siteConfig.baseUrl}${formPage}`);
        if (response.status() !== 200) return;
        const formInstance = wpPageObjects.createForm(formConfig);
        try {
          await formInstance.fillForm({
            name: testData.formData.name,
            email: testData.formData.email,
            message: testData.formData.message,
          });
          await test.step('Testing form validation', async () => {
            const ok = await formInstance.testValidation();
            if (!ok) console.log('⚠️  Form validation may not be working as expected');
          });
        } catch (error) {
          console.log(`⚠️  Form testing failed for ${formConfig.name}: ${error.message}`);
        }
      });
    }
  });
});
