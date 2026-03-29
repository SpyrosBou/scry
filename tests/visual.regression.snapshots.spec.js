const { test, expect } = require('../utils/test-fixtures');
const fs = require('fs');
const SiteLoader = require('../utils/site-loader');
const {
  setupTestPage,
  teardownTestPage,
  safeNavigate,
  waitForPageStability,
  ErrorContext,
} = require('../utils/test-helpers');
const { attachSchemaSummary, escapeHtml } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';

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

const parseDiffMetrics = (message) => {
  if (typeof message !== 'string' || message.length === 0) return null;

  const pixelsRegex = /([\d,]+)\s+pixels\s+\(ratio\s+([\d.]+)\s+of all image pixels\) are different/gi;
  let pixelsMatch;
  let lastPixelsMatch = null;
  while ((pixelsMatch = pixelsRegex.exec(message))) {
    lastPixelsMatch = pixelsMatch;
  }

  const dimensionsRegex = /Expected an image\s+(\d+)px by (\d+)px,\s+received\s+(\d+)px by (\d+)px/gi;
  let dimMatch;
  let lastDimensionsMatch = null;
  while ((dimMatch = dimensionsRegex.exec(message))) {
    lastDimensionsMatch = dimMatch;
  }

  if (!lastPixelsMatch && !lastDimensionsMatch) return null;

  const metrics = {};
  if (lastPixelsMatch) {
    metrics.pixelDiff = Number(lastPixelsMatch[1].replace(/,/g, ''));
    metrics.pixelRatio = Number(lastPixelsMatch[2]);
  }
  if (lastDimensionsMatch) {
    metrics.expectedSize = {
      width: Number(lastDimensionsMatch[1]),
      height: Number(lastDimensionsMatch[2]),
    };
    metrics.actualSize = {
      width: Number(lastDimensionsMatch[3]),
      height: Number(lastDimensionsMatch[4]),
    };
  }

  return metrics;
};

const buildVisualSchemaPayloads = ({ summaries, viewportName, projectName }) => {
  if (!Array.isArray(summaries) || summaries.length === 0) return null;

  const enrichedSummaries = summaries.map((entry) => {
    const diffMetrics = entry.diffMetrics || {};
    const pixelDiff = Number.isFinite(diffMetrics.pixelDiff) ? diffMetrics.pixelDiff : null;
    const pixelRatio = Number.isFinite(diffMetrics.pixelRatio) ? diffMetrics.pixelRatio : null;
    const deltaPercent =
      pixelRatio !== null ? Math.round(pixelRatio * 10000) / 100 : null;
    const thresholdPercent =
      typeof entry.threshold === 'number'
        ? Math.round(entry.threshold * 10000) / 100
        : null;
    const gating =
      entry.result === 'diff'
        ? [
            deltaPercent !== null && thresholdPercent !== null
              ? `Visual delta ${deltaPercent}% exceeds ${thresholdPercent}% threshold.`
              : 'Visual difference exceeded configured threshold.',
          ]
        : [];
    const notes = [];
    if (entry.result === 'pass') {
      notes.push('Screenshot matched baseline within configured threshold.');
    } else if (entry.error) {
      notes.push(entry.error);
    }
    const artifactRefs = {
      baseline: entry.artifacts?.baseline?.name || null,
      actual: entry.artifacts?.actual?.name || null,
      diff: entry.artifacts?.diff?.name || null,
    };
    return {
      ...entry,
      diffMetrics,
      pixelDiff,
      pixelRatio,
      deltaPercent,
      thresholdPercent,
      gating,
      warnings: [],
      advisories: [],
      notes,
      artifactRefs,
    };
  });

  const diffs = enrichedSummaries.filter((entry) => entry.result !== 'pass');
  const passes = enrichedSummaries.length - diffs.length;
  const thresholds = Array.from(
    new Set(
      enrichedSummaries
        .map((entry) => (typeof entry.threshold === 'number' ? entry.threshold : null))
        .filter((value) => value !== null)
    )
  );

  const pixelDiffs = diffs.map((entry) => entry.pixelDiff).filter((value) => Number.isFinite(value));
  const pixelRatios = diffs
    .map((entry) => entry.pixelRatio)
    .filter((value) => Number.isFinite(value));
  const deltaPercents = diffs
    .map((entry) => entry.deltaPercent)
    .filter((value) => Number.isFinite(value));

  const runPayload = createRunSummaryPayload({
    baseName: `visual-${slugify(projectName)}-${slugify(viewportName)}`,
    title: `Visual regression summary — ${viewportName}`,
    overview: {
      viewport: viewportName,
      totalPages: enrichedSummaries.length,
      passes,
      diffs: diffs.length,
      thresholdsUsed: thresholds,
      maxPixelDiff: pixelDiffs.length > 0 ? Math.max(...pixelDiffs) : null,
      maxPixelRatio: pixelRatios.length > 0 ? Math.max(...pixelRatios) : null,
      maxDeltaPercent: deltaPercents.length > 0 ? Math.max(...deltaPercents) : null,
      pagesWithGatingIssues: diffs.length,
      diffPages: diffs.map((entry) => entry.page),
    },
    metadata: {
      spec: 'visual.regression.snapshots',
      summaryType: 'visual',
      projectName,
      scope: 'project',
      viewport: viewportName,
    },
  });

  runPayload.details = {
    pages: enrichedSummaries.map((entry) => ({
      page: entry.page,
      viewport: viewportName,
      result: entry.result,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
      deltaPercent: entry.deltaPercent,
      thresholdPercent: entry.thresholdPercent,
      pixelDiff: entry.pixelDiff,
      artifacts: entry.artifactRefs,
    })),
  };

  const pagePayloads = enrichedSummaries.map((entry) => {
    return createPageSummaryPayload({
      baseName: `visual-${slugify(projectName)}-${slugify(viewportName)}-${slugify(entry.page)}`,
      title: `Visual regression – ${entry.page} (${viewportName})`,
      page: entry.page,
      viewport: viewportName,
      summary: {
        result: entry.result,
        threshold: entry.threshold,
        thresholdPercent: entry.thresholdPercent,
        pixelDiff: entry.pixelDiff,
        pixelRatio: entry.pixelRatio,
        deltaPercent: entry.deltaPercent,
        expectedSize: entry.diffMetrics.expectedSize || null,
        actualSize: entry.diffMetrics.actualSize || null,
        artifacts: entry.artifactRefs,
        screenshot: entry.screenshot || null,
        error: entry.error || null,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'visual.regression.snapshots',
        summaryType: 'visual',
        projectName,
        viewport: viewportName,
      },
    });
  });

  return { runPayload, pagePayloads };
};

test.describe('Visual Regression', () => {
  let siteConfig;
  let errorContext;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');
    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
    errorContext = sharedErrorContext;
  });

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

      test(`Visual regression - ${viewportName}`, async ({ page, browserName }, testInfo) => {
        test.setTimeout(7200000);
        errorContext.setTest(`Visual Regression - ${viewportName}`);

        const pagesToTest = process.env.SMOKE
          ? siteConfig.testPages.slice(0, 1)
          : siteConfig.testPages;
        const visualSummaries = [];
        const diffEntries = [];
        const pendingAttachments = [];

        for (const testPage of pagesToTest) {
          await test.step(`Visual ${viewportName}: ${testPage}`, async () => {
            errorContext.setPage(testPage);

            const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
            if (response.status() !== 200) return;
            await waitForPageStability(page);

            // Disable animations for consistent screenshots
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
            await page.waitForTimeout(300);

            const pageName = testPage.replace(/\//g, '') || 'home';
            const screenshotName = `${siteConfig.name
              .toLowerCase()
              .replace(/\s+/g, '-')}-${pageName}-${viewportName}-${browserName}.png`;

            const thresholds = siteConfig.visualThresholds || DEFAULT_VISUAL_THRESHOLDS;
            let threshold = testPage === '/' || testPage.includes('home')
              ? thresholds.dynamic
              : thresholds.content;

            // Per-page visual overrides
            const overrides = Array.isArray(siteConfig.visualOverrides) ? siteConfig.visualOverrides : [];
            const matchOverride = overrides.find((ovr) => {
              if (ovr && typeof ovr.match === 'string' && ovr.match === testPage) return true;
              if (ovr && typeof ovr.page === 'string' && ovr.page === testPage) return true;
              if (ovr && typeof ovr.pattern === 'string') {
                try { return new RegExp(ovr.pattern).test(testPage); } catch (_) { return false; }
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
            ].concat(siteConfig.dynamicMasks || [])
              .concat(matchOverride?.masks || matchOverride?.maskSelectors || []);
            if (typeof matchOverride?.threshold === 'number') {
              threshold = matchOverride.threshold;
            }
            const masks = maskSelectors.map((sel) => page.locator(sel));

            const artifactsLabel = `${screenshotName.replace(/\.png$/i, '')}`;

            const toDataUri = (filePath) => {
              try {
                const content = fs.readFileSync(filePath);
                return `data:image/png;base64,${content.toString('base64')}`;
              } catch (_error) {
                return null;
              }
            };

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
              await expect(page).toHaveScreenshot(screenshotName, {
                fullPage: true,
                threshold,
                maxDiffPixels: 1000,
                animations: 'disabled',
                mask: masks,
              });
              console.log(`✅ Visual regression passed for ${testPage} (${viewportName})`);
              visualSummaries.push({
                page: testPage,
                result: 'pass',
                threshold,
                screenshot: screenshotName,
                artifacts: null,
              });
            } catch (error) {
              console.log(
                `⚠️  Visual difference detected for ${testPage} (${viewportName}): ${error.message}`
              );
              const artifacts = await collectVisualArtifacts(true);
              const diffMetrics = parseDiffMetrics(String(error.message || ''));
              visualSummaries.push({
                page: testPage,
                result: 'diff',
                threshold,
                screenshot: screenshotName,
                error: String(error.message || '').slice(0, 200),
                diffMetrics,
                artifacts,
              });
              diffEntries.push({ page: testPage, metrics: diffMetrics });
            }
          });
        }


        const schemaPayloads = buildVisualSchemaPayloads({
          summaries: visualSummaries,
          viewportName,
          projectName: testInfo.project.name,
        });
        if (schemaPayloads) {
          await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
          for (const payload of schemaPayloads.pagePayloads) {
            await attachSchemaSummary(testInfo, payload);
          }
        }

        for (const artifact of pendingAttachments) {
          await testInfo.attach(artifact.name, {
            path: artifact.path,
            contentType: 'image/png',
          });
        }

        if (diffEntries.length > 0) {
          const pageList = diffEntries.map((entry) => `\`${entry.page}\``).join(', ');
          throw new Error(
            `Visual differences detected on ${pageList}. Review attachments for details.`
          );
        }
      });
    });
  });
});
