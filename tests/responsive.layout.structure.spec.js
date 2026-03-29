const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');
const { safeNavigate, waitForPageStability, safeElementInteraction } = require('../utils/test-helpers');
const { WordPressPageObjects } = require('../utils/wordpress-page-objects');
const { attachSummary, escapeHtml, attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

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

const buildResponsiveStructureSchemaPayloads = (summaries, viewportName, projectName) => {
  if (!Array.isArray(summaries) || summaries.length === 0) return null;

  const loadBreaches = summaries.filter(
    (entry) =>
      entry.loadTime != null &&
      entry.threshold != null &&
      entry.loadTime > entry.threshold
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
  const averageBlocks = entries.reduce((total, entry) => total + (entry.blockElements || 0), 0) /
    entries.length;

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

const resolveResponsiveViewports = () => {
  const raw = (process.env.RESPONSIVE_VIEWPORTS || 'desktop').trim();
  if (!raw) return ['desktop'];
  if (raw.toLowerCase() === 'all') return Object.keys(VIEWPORTS);

  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => Boolean(VIEWPORTS[entry]));
};

test.describe('Responsive Structure & UX', () => {
  let siteConfig;
  let errorContext;
  let wp;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');
    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
    errorContext = sharedErrorContext;
    wp = new WordPressPageObjects(page, siteConfig);
  });

  const enabledViewportKeys = resolveResponsiveViewports();
  if (enabledViewportKeys.length === 0) {
    throw new Error('No valid responsive viewports selected.');
  }

  enabledViewportKeys.forEach((viewportKey) => {
    const viewport = VIEWPORTS[viewportKey];
    const viewportName = viewport.name;
    test.describe(`Layout & critical elements - ${viewportName}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
      });

      test(`Layout and critical elements - ${viewportName}`, async ({ page }) => {
        test.setTimeout(7200000);
        const pagesToTest = process.env.SMOKE
          ? siteConfig.testPages.slice(0, 1)
          : siteConfig.testPages;
        const pageSummaries = [];
        const threshold = PERFORMANCE_THRESHOLDS[viewportName];

        for (const testPage of pagesToTest) {
          await test.step(`Structure ${viewportName}: ${testPage}`, async () => {
            const summaryEntry = {
              page: testPage,
              threshold,
              loadTime: null,
              status: null,
              elements: null,
              warnings: [],
              info: [],
              gatingIssues: [],
              h1Count: null,
            };

            try {
              const startTime = Date.now();
              const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
              summaryEntry.status = response.status();

              if (summaryEntry.status !== 200) {
                summaryEntry.warnings.push(`Received status ${summaryEntry.status}`);
                return;
              }

              await waitForPageStability(page, { timeout: 15000 });

              summaryEntry.loadTime = Date.now() - startTime;
              if (summaryEntry.loadTime > threshold) {
                console.log(
                  `⚠️  ${viewportName} load time ${summaryEntry.loadTime}ms exceeds threshold ${threshold}ms for ${testPage}`
                );
                summaryEntry.warnings.push(
                  `Load time ${summaryEntry.loadTime}ms exceeds threshold ${threshold}ms`
                );
              } else {
                console.log(
                  `✅ ${viewportName} load time ${summaryEntry.loadTime}ms within threshold for ${testPage}`
                );
                summaryEntry.info.push(
                  `Load time ${summaryEntry.loadTime}ms within threshold ${threshold}ms`
                );
              }

              const critical = await wp.verifyCriticalElements();
              expect.soft(critical.header).toBe(true);
              if (!critical.header) summaryEntry.gatingIssues.push('Header landmark missing');

              if (viewportName === 'mobile') {
                const mobileNavSelectors = [
                  '#mobile-burger',
                  '.menu-toggle',
                  '[aria-controls]',
                  '.hamburger',
                  '.navbar-toggler',
                  '.menu-button',
                  '[aria-label*="menu"]',
                ];
                let mobileNavFound = false;
                for (const s of mobileNavSelectors) {
                  if (await page.locator(s).isVisible()) {
                    mobileNavFound = true;
                    try {
                      await safeElementInteraction(page.locator(s).first(), 'click', {
                        timeout: 3000,
                      });
                      await page.waitForTimeout(400);
                    } catch (_) {}
                    break;
                  }
                }
                if (!mobileNavFound) {
                  const nav = await wp.verifyCriticalElements();
                  expect.soft(nav.navigation).toBe(true);
                  if (!nav.navigation) summaryEntry.gatingIssues.push('Navigation landmark missing');
                }
              } else {
                const nav = await wp.verifyCriticalElements();
                expect.soft(nav.navigation).toBe(true);
                if (!nav.navigation) summaryEntry.gatingIssues.push('Navigation landmark missing');
              }

              const again = await wp.verifyCriticalElements();
              expect.soft(again.content).toBe(true);
              expect.soft(again.footer).toBe(true);

              summaryEntry.elements = {
                header: Boolean(again.header ?? false),
                navigation: Boolean(again.navigation ?? false),
                content: Boolean(again.content ?? false),
                footer: Boolean(again.footer ?? false),
              };

              if (!summaryEntry.elements.content)
                summaryEntry.gatingIssues.push('Main content landmark missing');
              if (!summaryEntry.elements.footer)
                summaryEntry.info.push('Footer landmark not detected');

              summaryEntry.h1Count = await page.locator('h1').count();

              if (
                viewportName === 'mobile' &&
                siteConfig.forms &&
                siteConfig.forms.length > 0
              ) {
                const formPage = siteConfig.forms[0].page || testPage;
                if (testPage === formPage) {
                  const formSelector =
                    siteConfig.forms[0].selector || '.wpcf7-form, .contact-form, form';
                  if (await page.locator(formSelector).isVisible()) {
                    const fields = await page
                      .locator(`${formSelector} input, ${formSelector} textarea`)
                      .all();
                    for (let i = 0; i < Math.min(fields.length, 3); i++) {
                      try {
                        await fields[i].tap({ timeout: 1500 });
                      } catch (_) {}
                    }
                  }
                }
              }
            } catch (error) {
              summaryEntry.error = error?.message || String(error);
              summaryEntry.gatingIssues.push('Unexpected error encountered during responsive audit');
              throw error;
            } finally {
              pageSummaries.push(summaryEntry);
            }
          });
        }

        const rowsHtml = pageSummaries
          .map((e) => {
            const loadBreached =
              e.loadTime != null && e.threshold != null && e.loadTime > e.threshold;
            const className = e.error || loadBreached ? 'status-error' : 'status-ok';
            const boolCell = (v) => (v === true ? '✅' : v === false ? '⚠️' : '—');
            const loadDisplay = e.loadTime != null ? `${Math.round(e.loadTime)}ms` : '—';
            const thresholdDisplay = e.threshold != null ? `${e.threshold}ms` : '—';
            return `
              <tr class="${className}">
                <td><code>${escapeHtml(e.page)}</code></td>
                <td>${loadDisplay}</td>
                <td>${thresholdDisplay}</td>
                <td>${boolCell(e.elements?.header)}</td>
                <td>${boolCell(e.elements?.navigation)}</td>
                <td>${boolCell(e.elements?.content)}</td>
                <td>${boolCell(e.elements?.footer)}</td>
              </tr>
            `;
          })
          .join('');

        const htmlBody = `
          <section class="summary-report summary-responsive-structure">
            <h3>Responsive structure — ${escapeHtml(viewportName)}</h3>
            <table>
              <thead><tr><th>Page</th><th>Load</th><th>Threshold</th><th>Header</th><th>Nav</th><th>Content</th><th>Footer</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </section>
        `;

        const mdRows = pageSummaries.map((e) => {
          const loadDisplay = e.loadTime != null ? `${Math.round(e.loadTime)}ms` : '—';
          const thresholdDisplay = e.threshold != null ? `${e.threshold}ms` : '—';
          const bool = (v) => (v === true ? '✅' : v === false ? '⚠️' : '—');
          return `| \`${e.page}\` | ${loadDisplay} | ${thresholdDisplay} | ${bool(e.elements?.header)} | ${bool(e.elements?.navigation)} | ${bool(e.elements?.content)} | ${bool(e.elements?.footer)} |`;
        });

        const markdown = [
          `# Responsive structure — ${viewportName}`,
          '',
          '| Page | Load | Threshold | Header | Nav | Content | Footer |',
          '| --- | --- | --- | --- | --- | --- | --- |',
          ...mdRows,
        ].join('\n');

        await attachSummary({
          baseName: `responsive-structure-${viewportName}-summary`,
          htmlBody,
          markdown,
          setDescription: false,
        });

        const testInfo = test.info();
        const schemaPayloads = buildResponsiveStructureSchemaPayloads(
          pageSummaries,
          viewportName,
          testInfo.project.name
        );
        if (schemaPayloads) {
          await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
          for (const payload of schemaPayloads.pagePayloads) {
            await attachSchemaSummary(testInfo, payload);
          }
        }
      });
    });
  });

  test.describe('Cross-Viewport Consistency', () => {
    test('Content hierarchy consistency across viewports', async ({ page }) => {
      test.setTimeout(7200000);

      const testPage = siteConfig.testPages[0];
      const contentStructure = {};
      if (enabledViewportKeys.length < 2) {
        test.skip(true, 'Cross-viewport checks require multiple viewports.');
      }

      for (const viewportKey of enabledViewportKeys) {
        const viewport = VIEWPORTS[viewportKey];
        const viewportName = viewport.name;
        await test.step(`Analyzing ${viewportName}`, async () => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
          if (response.status() !== 200) return;
          await waitForPageStability(page);

          const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents();
          contentStructure[viewportName] = {
            headingCount: headings.length,
            headings: headings.slice(0, 5),
            hasNav: await page.locator('nav').isVisible(),
            hasMain: await page.locator('main').isVisible(),
            hasFooter: await page.locator('footer').isVisible(),
          };
        });
      }

      const names = Object.keys(contentStructure);
      if (names.length > 1) {
        const base = contentStructure[names[0]];
        for (let i = 1; i < names.length; i++) {
          const cmp = contentStructure[names[i]];
          const diff = Math.abs(base.headingCount - cmp.headingCount);
          if (diff > 2)
            console.log(
              `⚠️  Significant heading count difference between ${names[0]} and ${names[i]}`
            );
          expect.soft(cmp.hasNav).toBe(base.hasNav);
          expect.soft(cmp.hasMain).toBe(base.hasMain);
          expect.soft(cmp.hasFooter).toBe(base.hasFooter);
        }
      }

      // Attach report summary for cross-viewport consistency
      const rowsHtml = names
        .map((vp) => {
          const d = contentStructure[vp] || {};
          const b = (v) => (v ? '✅' : '⚠️');
          const headings = (d.headings || []).map((h) => `<code>${escapeHtml(String(h))}</code>`).join('<br />');
          return `
            <tr>
              <td>${escapeHtml(vp)}</td>
              <td>${d.headingCount ?? 0}</td>
              <td>${b(Boolean(d.hasNav))}</td>
              <td>${b(Boolean(d.hasMain))}</td>
              <td>${b(Boolean(d.hasFooter))}</td>
              <td>${headings || '—'}</td>
            </tr>
          `;
        })
        .join('');
      const htmlBody = `
        <section class="summary-report summary-responsive-consistency">
          <h3>Cross-viewport content consistency</h3>
          <p>Page: <code>${escapeHtml(testPage)}</code></p>
          <table>
            <thead><tr><th>Viewport</th><th>Heading count</th><th>Nav</th><th>Main</th><th>Footer</th><th>Sample headings</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </section>
      `;
      const mdRows = names.map((vp) => {
        const d = contentStructure[vp] || {};
        return `| ${vp} | ${d.headingCount ?? 0} | ${d.hasNav ? '✅' : '⚠️'} | ${d.hasMain ? '✅' : '⚠️'} | ${d.hasFooter ? '✅' : '⚠️'} | ${(d.headings || []).slice(0, 3).join(' / ') || '—'} |`;
      });
      const markdown = [
        `# Cross-viewport content consistency`,
        '',
        `Page: \`${testPage}\``,
        '',
        '| Viewport | Headings | Nav | Main | Footer | Sample headings |',
        '| --- | --- | --- | --- | --- | --- |',
        ...mdRows,
      ].join('\n');
      await attachSummary({
        baseName: 'responsive-consistency-summary',
        htmlBody,
        markdown,
        setDescription: false,
      });
    });
  });

  test.describe('WordPress-Specific Responsive Features', () => {
    test('WordPress theme responsive patterns', async ({ page }) => {
      test.setTimeout(7200000);
      const features = [];

      for (const viewportKey of enabledViewportKeys) {
        const viewport = VIEWPORTS[viewportKey];
        const viewportName = viewport.name;
        await test.step(`WP features: ${viewportName}`, async () => {
          const entry = {
            viewport: viewportName,
            status: null,
            hasWpResponsive: false,
            blockElements: 0,
            widgets: 0,
            error: null,
            warnings: [],
            info: [],
          };

          try {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const response = await safeNavigate(page, siteConfig.baseUrl);
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
              console.log(`✅ WordPress responsive elements detected on ${viewportName}`);
              entry.info.push('Responsive block classes detected');
            } else {
              entry.warnings.push('Responsive block classes not detected');
            }

            entry.blockElements = await page.locator('[class*="wp-block-"]').count();
            if (entry.blockElements > 0) {
              console.log(`📊 ${entry.blockElements} Gutenberg blocks found on ${viewportName}`);
              entry.info.push(`${entry.blockElements} Gutenberg block element(s)`);
            } else {
              entry.info.push('No Gutenberg block elements detected');
            }

            entry.widgets = await page.locator('.widget').count();
            if (entry.widgets > 0) {
              console.log(`📊 ${entry.widgets} widgets found on ${viewportName}`);
              entry.info.push(`${entry.widgets} widget(s) found`);
            } else {
              entry.info.push('No WordPress widgets detected');
            }
          } catch (error) {
            entry.error = error?.message || String(error);
            throw error;
          } finally {
            features.push(entry);
          }
        });
      }

      const rowsHtml = features
        .map((f) => {
          const responsive = f.hasWpResponsive ? '✅' : f.status === 200 ? '⚠️' : '—';
          return `
            <tr>
              <td>${escapeHtml(f.viewport)}</td>
              <td>${responsive}</td>
              <td>${f.blockElements}</td>
              <td>${f.widgets}</td>
            </tr>
          `;
        })
        .join('');

      const htmlBody = `
        <section class="summary-report summary-wp-responsive">
          <h3>WordPress responsive features</h3>
          <table>
            <thead><tr><th>Viewport</th><th>Responsive elems</th><th>Block elements</th><th>Widgets</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </section>
      `;

      const mdRows = features.map((f) => {
        const responsive = f.hasWpResponsive ? '✅' : f.status === 200 ? '⚠️' : '—';
        return `| ${f.viewport} | ${responsive} | ${f.blockElements} | ${f.widgets} |`;
      });
      const markdown = [
        '# WordPress responsive features',
        '',
        '| Viewport | Responsive | Block elements | Widgets |',
        '| --- | --- | --- | --- |',
        ...mdRows,
      ].join('\n');

      await attachSummary({
        baseName: 'responsive-wp-features-summary',
        htmlBody,
        markdown,
        setDescription: false,
      });

      const testInfo = test.info();
      const schemaPayloads = buildResponsiveWpSchemaPayloads(features, testInfo.project.name);
      if (schemaPayloads) {
        await attachSchemaSummary(testInfo, schemaPayloads.runPayload);
        for (const payload of schemaPayloads.pagePayloads) {
          await attachSchemaSummary(testInfo, payload);
        }
      }
    });
  });
});
