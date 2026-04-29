const path = require('path');
const fs = require('fs');
const { test, expect } = require('../utils/test-fixtures');
const { safeNavigate, waitForPageStability } = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { getActiveSiteContext } = require('../utils/test-context');
const { createAggregationStore } = require('../utils/report-aggregation-store');
const { waitForReports: waitForReportsHelper } = require('../utils/a11y-aggregation-waiter');
const { parseDiffMetrics } = require('../utils/report-classification/site-quality');
const { buildVisualSchemaPayloads } = require('../utils/report-payloads/site-quality');

const { siteConfig } = getActiveSiteContext();
const configuredPages = process.env.SMOKE ? siteConfig.testPages.slice(0, 1) : siteConfig.testPages;
const totalPages = configuredPages.length;
const RUN_TOKEN = process.env.VISUAL_REGRESSION_RUN_TOKEN || `${Date.now()}`;
if (!process.env.VISUAL_REGRESSION_RUN_TOKEN) {
  process.env.VISUAL_REGRESSION_RUN_TOKEN = RUN_TOKEN;
}
const AGGREGATION_PERSIST_ROOT = path.join(process.cwd(), 'test-results', '.visual-aggregation');
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

const VIEWPORTS = {
  mobile: { width: 375, height: 667, name: 'mobile' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  desktop: { width: 1920, height: 1080, name: 'desktop' },
};

const resolveViewports = () => {
  const raw = (process.env.VISUAL_VIEWPORTS || 'desktop').trim();
  if (!raw) return ['desktop'];
  if (raw.toLowerCase() === 'all') return Object.keys(VIEWPORTS);
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => Boolean(VIEWPORTS[entry]));
};

const DEFAULT_VISUAL_THRESHOLDS = {
  ui_elements: 0.05,
  content: 0.05,
  dynamic: 0.05,
};

const waitForVisualSettle = async (page) => {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
};

test.describe('Visual Regression', () => {
  const enabledViewportKeys = resolveViewports();

  if (enabledViewportKeys.length === 0) {
    throw new Error('No valid viewports selected for visual regression');
  }

  enabledViewportKeys.forEach((viewportKey) => {
    const viewport = VIEWPORTS[viewportKey];
    const viewportName = viewport.name;

    test.describe(`Visuals: ${viewportName} (${viewport.width}x${viewport.height})`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
      });

      configuredPages.forEach((testPage, index) => {
        test(`Visual regression ${viewportName} ${index + 1}/${totalPages}: ${testPage}`, async ({
          page,
          browserName,
          errorContext,
        }, testInfo) => {
          errorContext.setTest(`Visual Regression - ${viewportName}`);
          errorContext.setPage(testPage);

          const pendingAttachments = [];
          const pageReport = {
            page: testPage,
            viewportName,
            status: null,
            result: 'skipped',
            threshold: null,
            screenshot: null,
            diffMetrics: null,
            artifacts: null,
            error: null,
            index: index + 1,
            runToken: RUN_TOKEN,
          };
          let failureMessage = null;

          const pageName = testPage.replace(/\//g, '') || 'home';
          const screenshotName = `${siteConfig.name
            .toLowerCase()
            .replace(/\s+/g, '-')}-${pageName}-${viewportName}-${browserName}.png`;
          const artifactsLabel = `${screenshotName.replace(/\.png$/i, '')}`;

          const collectVisualArtifacts = async (includeDiffArtifacts = false) => {
            const artifactInfo = { baseline: null, actual: null, diff: null };
            const registerAttachment = (label, filePath) => {
              if (!filePath || !fs.existsSync(filePath)) return null;
              const attachmentName = `${artifactsLabel}-${label}.png`;
              pendingAttachments.push({ name: attachmentName, path: filePath });
              return { name: attachmentName };
            };

            if (includeDiffArtifacts) {
              const baselinePath = testInfo.snapshotPath(screenshotName);
              artifactInfo.baseline = registerAttachment('baseline', baselinePath);

              const baseName = artifactsLabel;
              const actualCandidates = [
                testInfo.outputPath(`${baseName}-actual.png`),
                testInfo.outputPath(`${screenshotName}-actual.png`),
              ];
              const diffCandidates = [
                testInfo.outputPath(`${baseName}-diff.png`),
                testInfo.outputPath(`${screenshotName}-diff.png`),
              ];

              const findExisting = (candidates) =>
                candidates.find((candidate) => candidate && fs.existsSync(candidate));

              const actualPath = findExisting(actualCandidates);
              const diffPath = findExisting(diffCandidates);

              artifactInfo.actual = registerAttachment('actual', actualPath);
              artifactInfo.diff = registerAttachment('diff', diffPath);
            }

            return artifactInfo;
          };

          try {
            const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
            pageReport.status = response.status();
            if (pageReport.status !== 200) {
              pageReport.error = `HTTP ${pageReport.status}; screenshot skipped.`;
              return;
            }
            await waitForPageStability(page);

            await page.addStyleTag({
              content: `
                  *, *::before, *::after {
                    animation-duration: 0s !important;
                    animation-delay: 0s !important;
                    transition-duration: 0s !important;
                    transition-delay: 0s !important;
                  }
                `,
            });
            await waitForVisualSettle(page);

            const thresholds = siteConfig.visualThresholds || DEFAULT_VISUAL_THRESHOLDS;
            let threshold =
              testPage === '/' || testPage.includes('home')
                ? thresholds.dynamic
                : thresholds.content;
            pageReport.threshold = threshold;
            pageReport.screenshot = screenshotName;

            const overrides = Array.isArray(siteConfig.visualOverrides)
              ? siteConfig.visualOverrides
              : [];
            const matchOverride = overrides.find((ovr) => {
              if (ovr && typeof ovr.match === 'string' && ovr.match === testPage) return true;
              if (ovr && typeof ovr.page === 'string' && ovr.page === testPage) return true;
              if (ovr && typeof ovr.pattern === 'string') {
                try {
                  return new RegExp(ovr.pattern).test(testPage);
                } catch (_error) {
                  return false;
                }
              }
              return false;
            });

            const maskSelectors = [
              'time',
              '.wp-block-latest-posts__post-date',
              '.wp-block-latest-comments__comment-date',
              '.carousel',
              '.slider',
              '.ticker',
              'iframe',
              'video',
              'canvas',
            ]
              .concat(siteConfig.dynamicMasks || [])
              .concat(matchOverride?.masks || matchOverride?.maskSelectors || []);
            if (typeof matchOverride?.threshold === 'number') {
              threshold = matchOverride.threshold;
              pageReport.threshold = threshold;
            }
            const masks = maskSelectors.map((selector) => page.locator(selector));

            try {
              await expect(page).toHaveScreenshot(screenshotName, {
                fullPage: true,
                threshold,
                maxDiffPixels: 1000,
                animations: 'disabled',
                mask: masks,
              });
              console.log(`✅ Visual regression passed for ${testPage} (${viewportName})`);
              pageReport.result = 'pass';
            } catch (error) {
              console.log(
                `⚠️  Visual difference detected for ${testPage} (${viewportName}): ${error.message}`
              );
              pageReport.result = 'diff';
              pageReport.artifacts = await collectVisualArtifacts(true);
              pageReport.diffMetrics = parseDiffMetrics(String(error.message || ''));
              pageReport.error = String(error.message || '').slice(0, 200);
              failureMessage = `Visual differences detected on \`${testPage}\` (${viewportName}). Review attachments for details.`;
            }
          } finally {
            aggregationStore.record(testInfo.project.name, pageReport);
          }

          const pagePayload = buildVisualSchemaPayloads({
            summaries: [pageReport],
            viewportName,
            projectName: testInfo.project.name,
          })?.pagePayloads?.[0];
          if (pagePayload) {
            await attachSchemaSummary(testInfo, pagePayload);
          }

          for (const artifact of pendingAttachments) {
            await testInfo.attach(artifact.name, {
              path: artifact.path,
              contentType: 'image/png',
            });
          }

          if (failureMessage) {
            throw new Error(failureMessage);
          }
        });
      });

      test.describe.serial(`Visual summary ${viewportName}`, () => {
        test('Aggregate results', async ({}, testInfo) => {
          if (totalPages === 0) {
            console.warn(`ℹ️  Visual suite executed with no configured pages for ${viewportName}.`);
            return;
          }

          const reports = (await waitForReports(testInfo.project.name)).filter(
            (report) =>
              report.runToken === RUN_TOKEN &&
              report.viewportName === viewportName &&
              typeof report.index === 'number'
          );
          if (reports.length === 0) {
            console.warn(`ℹ️  Visual suite produced no page reports for ${viewportName}.`);
            return;
          }

          const schemaPayloads = buildVisualSchemaPayloads({
            summaries: reports,
            viewportName,
            projectName: testInfo.project.name,
          });
          if (schemaPayloads?.runPayload) {
            await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
          }
        });
      });
    });
  });
});
