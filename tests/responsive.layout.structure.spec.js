const path = require('path');
const { test, expect } = require('../utils/test-fixtures');
const { waitForPageStability } = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');
const { getActiveSiteContext } = require('../utils/test-context');
const { createAggregationStore } = require('../utils/report-aggregation-store');
const { waitForReports: waitForReportsHelper } = require('../utils/a11y-aggregation-waiter');
const { getFormLocator } = require('../utils/form-helpers');
const { collectCriticalElements, openMobileNavigation } = require('../utils/page-audit-helpers');

const VIEWPORTS = {
  mobile: { width: 375, height: 667, name: 'mobile' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  desktop: { width: 1920, height: 1080, name: 'desktop' },
};

const PERFORMANCE_THRESHOLDS = { mobile: 3000, tablet: 2500, desktop: 2000 };

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'value';

const { siteConfig } = getActiveSiteContext();
const configuredPages = process.env.SMOKE
  ? Array.isArray(siteConfig.testPages) && siteConfig.testPages.includes('/')
    ? ['/']
    : [siteConfig.testPages[0]].filter(Boolean)
  : siteConfig.testPages;

const resolveResponsiveViewports = () => {
  const raw = (process.env.RESPONSIVE_VIEWPORTS || 'desktop').trim();
  if (!raw) return ['desktop'];
  if (raw.toLowerCase() === 'all') return Object.keys(VIEWPORTS);

  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => Boolean(VIEWPORTS[entry]));
};

const enabledViewportKeys = resolveResponsiveViewports();
if (enabledViewportKeys.length === 0) {
  throw new Error('No valid responsive viewports selected.');
}

const comparisonPairs =
  enabledViewportKeys.length > 1
    ? enabledViewportKeys.slice(1).map((viewportKey) => ({
        baselineKey: enabledViewportKeys[0],
        compareKey: viewportKey,
      }))
    : [];
const comparisonPage = configuredPages[0] || '/';
const totalStructureTests = configuredPages.length * enabledViewportKeys.length;

const STRUCTURE_RUN_TOKEN = process.env.RESPONSIVE_STRUCTURE_RUN_TOKEN || `${Date.now()}`;
if (!process.env.RESPONSIVE_STRUCTURE_RUN_TOKEN) {
  process.env.RESPONSIVE_STRUCTURE_RUN_TOKEN = STRUCTURE_RUN_TOKEN;
}
const CONSISTENCY_RUN_TOKEN = process.env.RESPONSIVE_CONSISTENCY_RUN_TOKEN || `${Date.now()}`;
if (!process.env.RESPONSIVE_CONSISTENCY_RUN_TOKEN) {
  process.env.RESPONSIVE_CONSISTENCY_RUN_TOKEN = CONSISTENCY_RUN_TOKEN;
}
const WP_RUN_TOKEN = process.env.RESPONSIVE_WP_RUN_TOKEN || `${Date.now()}`;
if (!process.env.RESPONSIVE_WP_RUN_TOKEN) {
  process.env.RESPONSIVE_WP_RUN_TOKEN = WP_RUN_TOKEN;
}

const structureStore = createAggregationStore({
  persistRoot: path.join(process.cwd(), 'test-results', '.responsive-structure-aggregation'),
  runToken: STRUCTURE_RUN_TOKEN,
});
const consistencyStore = createAggregationStore({
  persistRoot: path.join(process.cwd(), 'test-results', '.responsive-consistency-aggregation'),
  runToken: CONSISTENCY_RUN_TOKEN,
});
const wpStore = createAggregationStore({
  persistRoot: path.join(process.cwd(), 'test-results', '.responsive-wp-aggregation'),
  runToken: WP_RUN_TOKEN,
});

const waitForReports = ({ store, projectName, expectedCount }) =>
  waitForReportsHelper({
    store,
    projectName,
    expectedCount,
    timeoutMs: Math.max(60000, expectedCount * 5000),
  });

const buildResponsiveStructureSchemaPayloads = (summaries, viewportName, projectName) => {
  if (!Array.isArray(summaries) || summaries.length === 0) return null;

  const loadBreaches = summaries.filter(
    (entry) => entry.loadTime != null && entry.threshold != null && entry.loadTime > entry.threshold
  ).length;
  const errorCount = summaries.filter((entry) => Boolean(entry.error)).length;
  const missingTotals = summaries.reduce(
    (totals, entry) => {
      const elements = entry.elements || {};
      if (elements.header === false) totals.headerMissing += 1;
      if (elements.navigation === false) totals.navigationMissing += 1;
      if (elements.content === false) totals.contentMissing += 1;
      if (elements.footer === false) totals.footerMissing += 1;
      return totals;
    },
    { headerMissing: 0, navigationMissing: 0, contentMissing: 0, footerMissing: 0 }
  );

  const baseName = `responsive-structure-${slugify(projectName)}-${slugify(viewportName)}`;
  const enrichedSummaries = summaries.map((entry) => {
    const gating = [...(entry.gatingIssues || [])];
    if (entry.error) gating.push(entry.error);
    const warnings = entry.warnings || [];
    const notes = entry.info || [];
    return {
      page: entry.page,
      loadTimeMs: entry.loadTime != null ? Math.round(entry.loadTime) : null,
      thresholdMs: entry.threshold != null ? entry.threshold : null,
      headerPresent: Boolean(entry.elements?.header),
      navigationPresent: Boolean(entry.elements?.navigation),
      contentPresent: Boolean(entry.elements?.content),
      footerPresent: Boolean(entry.elements?.footer),
      h1Count: entry.h1Count ?? null,
      gating,
      warnings,
      advisories: [],
      notes,
    };
  });

  const runPayload = createRunSummaryPayload({
    baseName,
    title: `Responsive structure summary – ${viewportName}`,
    overview: {
      totalPages: enrichedSummaries.length,
      loadBudgetBreaches: loadBreaches,
      pagesWithErrors: errorCount,
      headerMissing: missingTotals.headerMissing,
      navigationMissing: missingTotals.navigationMissing,
      contentMissing: missingTotals.contentMissing,
      footerMissing: missingTotals.footerMissing,
      pagesWithGatingIssues: enrichedSummaries.filter((entry) => entry.gating.length > 0).length,
      pagesWithWarnings: enrichedSummaries.filter((entry) => entry.warnings.length > 0).length,
    },
    metadata: {
      spec: 'responsive.layout.structure',
      summaryType: 'responsive-structure',
      projectName,
      viewport: viewportName,
      scope: 'project',
      suppressPageEntries: true,
      viewports: [viewportName],
    },
  });

  runPayload.details = {
    pages: enrichedSummaries.map((entry) => ({
      page: entry.page,
      loadTimeMs: entry.loadTimeMs,
      thresholdMs: entry.thresholdMs,
      headerPresent: entry.headerPresent,
      navigationPresent: entry.navigationPresent,
      contentPresent: entry.contentPresent,
      footerPresent: entry.footerPresent,
      h1Count: entry.h1Count,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedSummaries.map((entry) =>
    createPageSummaryPayload({
      baseName,
      title: `Responsive structure – ${entry.page} (${viewportName})`,
      page: entry.page,
      viewport: viewportName,
      summary: {
        loadTimeMs: entry.loadTimeMs,
        thresholdMs: entry.thresholdMs,
        headerPresent: entry.headerPresent,
        navigationPresent: entry.navigationPresent,
        contentPresent: entry.contentPresent,
        footerPresent: entry.footerPresent,
        h1Count: entry.h1Count,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'responsive.layout.structure',
        summaryType: 'responsive-structure',
        projectName,
        viewport: viewportName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildResponsiveWpSchemaPayloads = (entries, projectName) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const responsiveDetected = entries.filter((entry) => entry.hasWpResponsive).length;
  const viewportsWithWidgets = entries.filter((entry) => (entry.widgets || 0) > 0).length;
  const errorCount = entries.filter((entry) => Boolean(entry.error)).length;
  const averageBlocks =
    entries.reduce((total, entry) => total + (entry.blockElements || 0), 0) / entries.length;

  const baseName = `responsive-wp-${slugify(projectName)}`;
  const enrichedEntries = entries.map((entry) => {
    const gating = entry.error ? [entry.error] : [];
    const warnings = entry.warnings || [];
    const notes = entry.info || [];
    return {
      page: '/',
      viewport: entry.viewport,
      responsiveDetected: Boolean(entry.hasWpResponsive),
      blockElements: entry.blockElements || 0,
      widgets: entry.widgets || 0,
      status: entry.status ?? null,
      gating,
      warnings,
      advisories: [],
      notes,
    };
  });

  const runPayload = createRunSummaryPayload({
    baseName,
    title: 'WordPress responsive features summary',
    overview: {
      totalViewports: enrichedEntries.length,
      viewportsWithResponsiveElements: responsiveDetected,
      viewportsWithWidgets,
      viewportsWithErrors: errorCount,
      averageBlockElements: Number.isFinite(averageBlocks)
        ? Math.round(averageBlocks * 10) / 10
        : 0,
      viewportsWithGatingIssues: enrichedEntries.filter((entry) => entry.gating.length > 0).length,
      viewportsWithWarnings: enrichedEntries.filter((entry) => entry.warnings.length > 0).length,
    },
    metadata: {
      spec: 'responsive.layout.structure',
      summaryType: 'wp-features',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
      viewports: Array.from(new Set(entries.map((entry) => entry.viewport))).filter(Boolean),
    },
  });

  runPayload.details = {
    pages: enrichedEntries.map((entry) => ({
      page: entry.page,
      viewport: entry.viewport,
      responsiveDetected: entry.responsiveDetected,
      blockElements: entry.blockElements,
      widgets: entry.widgets,
      status: entry.status,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedEntries.map((entry) =>
    createPageSummaryPayload({
      baseName,
      title: `WordPress responsive – ${entry.viewport}`,
      page: '/',
      viewport: entry.viewport,
      summary: {
        responsiveDetected: entry.responsiveDetected,
        blockElements: entry.blockElements,
        widgets: entry.widgets,
        status: entry.status,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'responsive.layout.structure',
        summaryType: 'wp-features',
        projectName,
        viewport: entry.viewport,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildResponsiveConsistencySchemaPayloads = (entries, pagePath, projectName) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const baseName = `responsive-consistency-${slugify(projectName)}`;
  const enrichedEntries = entries.map((entry) => {
    const notes = [];
    if (entry.headingDiff != null) {
      notes.push(
        `Heading count difference between ${entry.baselineViewport} and ${entry.compareViewport}: ${entry.headingDiff}`
      );
    }
    const gating = [];
    if (entry.error) gating.push(entry.error);
    if (entry.compare && entry.baseline) {
      if (entry.compare.hasNav !== entry.baseline.hasNav) {
        gating.push(
          `Navigation presence differs between ${entry.baselineViewport} and ${entry.compareViewport}`
        );
      }
      if (entry.compare.hasMain !== entry.baseline.hasMain) {
        gating.push(
          `Main landmark presence differs between ${entry.baselineViewport} and ${entry.compareViewport}`
        );
      }
      if (entry.compare.hasFooter !== entry.baseline.hasFooter) {
        gating.push(
          `Footer presence differs between ${entry.baselineViewport} and ${entry.compareViewport}`
        );
      }
    }

    return {
      page: pagePath,
      viewport: `${entry.baselineViewport} vs ${entry.compareViewport}`,
      baselineViewport: entry.baselineViewport,
      compareViewport: entry.compareViewport,
      headingDiff: entry.headingDiff ?? null,
      baseline: entry.baseline || null,
      compare: entry.compare || null,
      gating,
      warnings: [],
      advisories: [],
      notes,
    };
  });

  const runPayload = createRunSummaryPayload({
    baseName,
    title: 'Cross-viewport consistency summary',
    overview: {
      totalComparisons: enrichedEntries.length,
      comparisonsWithGatingIssues: enrichedEntries.filter((entry) => entry.gating.length > 0)
        .length,
      maximumHeadingDifference: Math.max(
        0,
        ...enrichedEntries.map((entry) => Number(entry.headingDiff) || 0)
      ),
    },
    metadata: {
      spec: 'responsive.layout.structure',
      summaryType: 'responsive-consistency',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
      page: pagePath,
    },
  });

  runPayload.details = {
    page: pagePath,
    comparisons: enrichedEntries.map((entry) => ({
      baselineViewport: entry.baselineViewport,
      compareViewport: entry.compareViewport,
      headingDiff: entry.headingDiff,
      baseline: entry.baseline,
      compare: entry.compare,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedEntries.map((entry) =>
    createPageSummaryPayload({
      baseName,
      title: `Cross-viewport consistency – ${entry.baselineViewport} vs ${entry.compareViewport}`,
      page: pagePath,
      viewport: `${entry.baselineViewport} vs ${entry.compareViewport}`,
      summary: {
        baselineViewport: entry.baselineViewport,
        compareViewport: entry.compareViewport,
        headingDiff: entry.headingDiff,
        baseline: entry.baseline,
        compare: entry.compare,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'responsive.layout.structure',
        summaryType: 'responsive-consistency',
        projectName,
        page: pagePath,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const captureContentSnapshot = async (page) => {
  const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents();
  return {
    headingCount: headings.length,
    headings: headings.slice(0, 5),
    hasNav: await page
      .locator('nav')
      .first()
      .isVisible()
      .catch(() => false),
    hasMain: await page
      .locator('main')
      .first()
      .isVisible()
      .catch(() => false),
    hasFooter: await page
      .locator('footer')
      .first()
      .isVisible()
      .catch(() => false),
  };
};

test.describe('Responsive Structure & UX', () => {
  enabledViewportKeys.forEach((viewportKey, viewportIndex) => {
    const viewport = VIEWPORTS[viewportKey];
    const viewportName = viewport.name;
    const threshold = PERFORMANCE_THRESHOLDS[viewportName];

    configuredPages.forEach((testPage, pageIndex) => {
      test(`Layout & critical elements ${viewportName} ${pageIndex + 1}/${configuredPages.length}: ${testPage}`, async ({
        page,
      }, testInfo) => {
        const pageReport = {
          page: testPage,
          viewport: viewportName,
          threshold,
          loadTime: null,
          status: null,
          elements: null,
          warnings: [],
          info: [],
          gatingIssues: [],
          h1Count: null,
          index: viewportIndex * configuredPages.length + pageIndex + 1,
          runToken: STRUCTURE_RUN_TOKEN,
        };

        try {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const startTime = Date.now();
          const response = await page.goto(`${siteConfig.baseUrl}${testPage}`, {
            timeout: 20000,
            waitUntil: 'domcontentloaded',
          });
          if (!response) {
            throw new Error(`Navigation returned null response for ${testPage}`);
          }
          pageReport.status = response.status();
          if (pageReport.status !== 200) {
            pageReport.warnings.push(`Received status ${pageReport.status}`);
            return;
          }

          await waitForPageStability(page, { timeout: 15000 });
          pageReport.loadTime = Date.now() - startTime;
          if (pageReport.loadTime > threshold) {
            pageReport.warnings.push(
              `Load time ${pageReport.loadTime}ms exceeds threshold ${threshold}ms`
            );
          } else {
            pageReport.info.push(
              `Load time ${pageReport.loadTime}ms within threshold ${threshold}ms`
            );
          }

          pageReport.elements = await collectCriticalElements(page);
          expect.soft(pageReport.elements.header).toBe(true);
          if (!pageReport.elements.header) {
            pageReport.gatingIssues.push('Header landmark missing');
          }

          if (viewportName === 'mobile') {
            const menuState = await openMobileNavigation(page, { timeout: 3000 });
            if (!menuState.found && !pageReport.elements.navigation) {
              pageReport.gatingIssues.push('Navigation landmark missing');
            }
            if (menuState.found && !menuState.opened) {
              pageReport.info.push('Mobile navigation toggle interaction did not complete.');
            }
          } else if (!pageReport.elements.navigation) {
            pageReport.gatingIssues.push('Navigation landmark missing');
          }

          expect.soft(pageReport.elements.content).toBe(true);
          expect.soft(pageReport.elements.footer).toBe(true);
          if (!pageReport.elements.content) {
            pageReport.gatingIssues.push('Main content landmark missing');
          }
          if (!pageReport.elements.footer) {
            pageReport.info.push('Footer landmark not detected');
          }

          pageReport.h1Count = await page.locator('h1').count();

          if (viewportName === 'mobile' && siteConfig.forms && siteConfig.forms.length > 0) {
            const formConfig = siteConfig.forms[0];
            const formPage = formConfig.page || testPage;
            if (testPage === formPage) {
              const formLocator = getFormLocator(page, formConfig);
              if (await formLocator.isVisible({ timeout: 1500 }).catch(() => false)) {
                const fields = await formLocator.locator('input, textarea').all();
                for (let i = 0; i < Math.min(fields.length, 3); i += 1) {
                  try {
                    await fields[i].tap({ timeout: 1500 });
                  } catch (_tapError) {
                    pageReport.info.push(
                      'Form field tap interaction failed during responsive audit.'
                    );
                  }
                }
              }
            }
          }
        } catch (error) {
          pageReport.error = error?.message || String(error);
          pageReport.gatingIssues.push('Unexpected error encountered during responsive audit');
        } finally {
          structureStore.record(testInfo.project.name, pageReport);
          const schemaPayloads = buildResponsiveStructureSchemaPayloads(
            [pageReport],
            viewportName,
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
  });

  comparisonPairs.forEach((pair, pairIndex) => {
    const baselineViewport = VIEWPORTS[pair.baselineKey];
    const compareViewport = VIEWPORTS[pair.compareKey];

    test(`Cross-viewport consistency ${pairIndex + 1}/${comparisonPairs.length}: ${baselineViewport.name} vs ${compareViewport.name}`, async ({
      page,
    }, testInfo) => {
      const report = {
        page: comparisonPage,
        baselineViewport: baselineViewport.name,
        compareViewport: compareViewport.name,
        baseline: null,
        compare: null,
        headingDiff: null,
        index: pairIndex + 1,
        runToken: CONSISTENCY_RUN_TOKEN,
      };

      try {
        await page.setViewportSize({
          width: baselineViewport.width,
          height: baselineViewport.height,
        });
        let response = await page.goto(`${siteConfig.baseUrl}${comparisonPage}`, {
          timeout: 20000,
          waitUntil: 'domcontentloaded',
        });
        if (!response || response.status() !== 200) {
          throw new Error(
            `Baseline viewport navigation returned ${response ? response.status() : 'null'}`
          );
        }
        await waitForPageStability(page);
        report.baseline = await captureContentSnapshot(page);

        await page.setViewportSize({
          width: compareViewport.width,
          height: compareViewport.height,
        });
        response = await page.goto(`${siteConfig.baseUrl}${comparisonPage}`, {
          timeout: 20000,
          waitUntil: 'domcontentloaded',
        });
        if (!response || response.status() !== 200) {
          throw new Error(
            `Comparison viewport navigation returned ${response ? response.status() : 'null'}`
          );
        }
        await waitForPageStability(page);
        report.compare = await captureContentSnapshot(page);
        report.headingDiff = Math.abs(report.baseline.headingCount - report.compare.headingCount);

        expect.soft(report.compare.hasNav).toBe(report.baseline.hasNav);
        expect.soft(report.compare.hasMain).toBe(report.baseline.hasMain);
        expect.soft(report.compare.hasFooter).toBe(report.baseline.hasFooter);
      } catch (error) {
        report.error = error?.message || String(error);
      } finally {
        consistencyStore.record(testInfo.project.name, report);
      }

      expect.soft(report.error || null).toBeNull();
    });
  });

  enabledViewportKeys.forEach((viewportKey, index) => {
    const viewport = VIEWPORTS[viewportKey];
    const viewportName = viewport.name;

    test(`WordPress responsive features ${index + 1}/${enabledViewportKeys.length}: ${viewportName}`, async ({
      page,
    }, testInfo) => {
      const entry = {
        viewport: viewportName,
        status: null,
        hasWpResponsive: false,
        blockElements: 0,
        widgets: 0,
        warnings: [],
        info: [],
        index: index + 1,
        runToken: WP_RUN_TOKEN,
      };

      try {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const response = await page.goto(siteConfig.baseUrl, {
          timeout: 20000,
          waitUntil: 'domcontentloaded',
        });
        if (!response) {
          throw new Error('Navigation returned null response for homepage');
        }
        entry.status = response.status();
        if (entry.status !== 200) {
          entry.warnings.push(`Received status ${entry.status}`);
          return;
        }

        await waitForPageStability(page);

        const responsiveLocator = page.locator('[class*="wp-block"], [class*="responsive"]');
        const responsiveCount = await responsiveLocator.count();
        if (responsiveCount > 0) {
          entry.hasWpResponsive = await responsiveLocator
            .first()
            .isVisible()
            .catch(() => false);
        }
        if (entry.hasWpResponsive) {
          entry.info.push('Responsive block classes detected');
        } else {
          entry.warnings.push('Responsive block classes not detected');
        }

        entry.blockElements = await page.locator('[class*="wp-block-"]').count();
        if (entry.blockElements > 0) {
          entry.info.push(`${entry.blockElements} Gutenberg block element(s)`);
        } else {
          entry.info.push('No Gutenberg block elements detected');
        }

        entry.widgets = await page.locator('.widget').count();
        if (entry.widgets > 0) {
          entry.info.push(`${entry.widgets} widget(s) found`);
        } else {
          entry.info.push('No WordPress widgets detected');
        }
      } catch (error) {
        entry.error = error?.message || String(error);
      } finally {
        wpStore.record(testInfo.project.name, entry);
        const schemaPayloads = buildResponsiveWpSchemaPayloads([entry], testInfo.project.name);
        const pagePayload = schemaPayloads?.pagePayloads?.[0];
        if (pagePayload) {
          await attachSchemaSummary(testInfo, pagePayload);
        }
      }

      expect.soft(entry.error || null).toBeNull();
    });
  });

  test.describe.serial('Responsive summaries', () => {
    enabledViewportKeys.forEach((viewportKey) => {
      const viewportName = VIEWPORTS[viewportKey].name;
      test(`Responsive structure summary ${viewportName}`, async ({}, testInfo) => {
        const reports = (
          await waitForReports({
            store: structureStore,
            projectName: testInfo.project.name,
            expectedCount: totalStructureTests,
          })
        )
          .filter((report) => report.runToken === STRUCTURE_RUN_TOKEN)
          .filter((report) => report.viewport === viewportName);

        if (reports.length === 0) return;
        const schemaPayloads = buildResponsiveStructureSchemaPayloads(
          reports,
          viewportName,
          testInfo.project.name
        );
        if (schemaPayloads?.runPayload) {
          await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
        }
      });
    });

    test('Cross-viewport consistency summary', async ({}, testInfo) => {
      if (comparisonPairs.length === 0) {
        test.skip(true, 'Cross-viewport checks require multiple viewports.');
      }

      const reports = (
        await waitForReports({
          store: consistencyStore,
          projectName: testInfo.project.name,
          expectedCount: comparisonPairs.length,
        })
      ).filter((report) => report.runToken === CONSISTENCY_RUN_TOKEN);
      if (reports.length === 0) return;

      const schemaPayloads = buildResponsiveConsistencySchemaPayloads(
        reports,
        comparisonPage,
        testInfo.project.name
      );
      if (schemaPayloads?.runPayload) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      }
      for (const payload of schemaPayloads?.pagePayloads || []) {
        await attachSchemaSummary(testInfo, payload);
      }
    });

    test('WordPress responsive features summary', async ({}, testInfo) => {
      const reports = (
        await waitForReports({
          store: wpStore,
          projectName: testInfo.project.name,
          expectedCount: enabledViewportKeys.length,
        })
      ).filter((report) => report.runToken === WP_RUN_TOKEN);
      if (reports.length === 0) return;

      const schemaPayloads = buildResponsiveWpSchemaPayloads(reports, testInfo.project.name);
      if (schemaPayloads?.runPayload) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
      }
    });
  });
});
