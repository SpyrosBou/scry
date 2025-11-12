const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');
const { runPageTasks, resolveConcurrencyLimit } = require('../utils/concurrency-helpers');

test.use({ trace: 'off', video: 'off' });
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');
const {
  selectAccessibilityTestPages,
  DEFAULT_ACCESSIBILITY_SAMPLE,
} = require('../utils/a11y-shared');
const {
  resolveReportMetadata,
  applyViewportMetadata,
} = require('../utils/report-metadata');

const STRUCTURE_WCAG_REFERENCES = [
  { id: '1.3.1', name: 'Info and Relationships', level: 'A' },
  { id: '2.4.1', name: 'Bypass Blocks', level: 'A' },
  { id: '2.4.6', name: 'Headings and Labels', level: 'AA' },
  { id: '2.4.10', name: 'Section Headings', level: 'AAA' },
];

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

const findStructureReference = (id) =>
  STRUCTURE_WCAG_REFERENCES.find((reference) => reference.id === id) || null;

const formatStructureBadgeLabel = (reference) => {
  if (!reference || !reference.id) return null;
  const { id, level } = reference;
  const levelSuffix = level ? ` ${level.toUpperCase()}` : '';
  return `WCAG ${id}${levelSuffix}`;
};

const createStructureFinding = (message, wcagId, extras = {}) => {
  const { summary, sample, samples, nodes, details, impact = 'minor', tags: extraTags } = extras;
  const reference = wcagId ? findStructureReference(wcagId) : null;
  const badge = reference ? formatStructureBadgeLabel(reference) : null;
  const tags = Array.isArray(extraTags) ? extraTags.filter(Boolean) : [];
  if (badge) tags.unshift(badge);
  if (reference) {
    tags.push(`${reference.id} ${reference.name}`);
  }
  const uniqueTags = Array.from(new Set(tags));

  const collectedSamples = [];
  if (Array.isArray(samples)) {
    for (const value of samples) {
      if (value != null && String(value).trim()) {
        collectedSamples.push(String(value).trim());
      }
    }
  }
  if (sample != null && String(sample).trim()) {
    collectedSamples.push(String(sample).trim());
  }

  return {
    message,
    summary: summary || message,
    impact,
    wcag: badge || null,
    tags: uniqueTags,
    sample: collectedSamples.length === 1 ? collectedSamples[0] : null,
    samples: collectedSamples.length > 1 ? collectedSamples : null,
    // allow callers to attach structured nodes (with screenshotDataUri/target/html)
    nodes: Array.isArray(nodes) ? nodes.filter(Boolean) : undefined,
    details: details ? String(details) : undefined,
  };
};

const evaluateStructure = async (page) => {
  return page.evaluate(() => {
    const headingNodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const headings = headingNodes.map((heading, index) => ({
      index,
      level: Number(heading.tagName.substring(1)),
      text: (heading.textContent || '').trim(),
    }));

    const h1Count = headings.filter((heading) => heading.level === 1).length;
    const hasMain = Boolean(document.querySelector('main,[role="main"]'));
    const navigationCount = document.querySelectorAll('nav,[role="navigation"]').length;
    const headerCount = document.querySelectorAll('header,[role="banner"]').length;
    const footerCount = document.querySelectorAll('footer,[role="contentinfo"]').length;

    const headingSkips = [];
    let previousLevel = null;
    headings.forEach((heading) => {
      if (previousLevel !== null) {
        const delta = heading.level - previousLevel;
        if (delta > 1) {
          const text = heading.text || 'Untitled heading';
          const message = `Level jumps from H${previousLevel} to H${heading.level} — "${text}"`;
          headingSkips.push({
            index: heading.index,
            level: heading.level,
            prevLevel: previousLevel,
            text,
            message,
          });
        }
      }
      previousLevel = heading.level;
    });

    return {
      headings,
      h1Count,
      hasMain,
      navigationCount,
      headerCount,
      footerCount,
      headingSkips,
    };
  });
};

test.describe('Accessibility: Structural landmarks', () => {
  let siteConfig;

  test.beforeEach(() => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');

    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
  });

  test('Landmarks and headings meet baseline accessibility expectations', async ({ browser }, testInfo) => {
    test.setTimeout(7200000);

    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yStructureSampleSize', 'a11yResponsiveSampleSize'],
    });

    const concurrency = resolveConcurrencyLimit(
      process.env.A11Y_STRUCTURE_CONCURRENCY,
      process.env.A11Y_PARALLEL_PAGES
    );

    const reports = await runPageTasks(
      browser,
      pages,
      async ({ page, pagePath }) => runStructureAudit(page, siteConfig, pagePath),
      { concurrency, testInfo, logLabel: 'Structure audit' }
    );

    const gatingTotal = reports.reduce((sum, report) => sum + report.gating.length, 0);
    const { siteLabel, viewportLabel } = resolveReportMetadata(siteConfig, testInfo);
    applyViewportMetadata(reports, { viewportLabel, siteLabel });

    const runPayload = createRunSummaryPayload({
      baseName: `a11y-structure-summary-${slugify(siteLabel)}`,
      title: 'Landmark & heading structure summary',
      overview: {
        totalPagesAudited: reports.length,
        pagesMissingMain: reports.filter((report) => !report.hasMain).length,
        pagesWithHeadingSkips: reports.filter((report) => report.headingSkips.length > 0).length,
        pagesWithGatingIssues: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
      },
      metadata: {
        spec: 'a11y.structure.landmarks',
        summaryType: 'structure',
        projectName: siteLabel,
        siteName: siteLabel,
        viewports: [viewportLabel],
        suppressPageEntries: true,
        scope: 'project',
      },
    });
    runPayload.details = {
      viewports: [viewportLabel],
      pages: reports.map((report) => ({
        page: report.page,
        h1Count: report.h1Count,
        hasMainLandmark: report.hasMain,
        navigationLandmarks: report.navigationCount,
        headerLandmarks: report.headerCount,
        footerLandmarks: report.footerCount,
        headingSkips: report.headingSkips,
        gating: report.gating,
        warnings: report.warnings,
        advisories: report.advisories,
        headingOutline: report.headingLevels,
        notes: report.notes,
        projectName: report.projectName,
        siteName: report.siteName,
        browser: report.browser,
        viewport: report.viewport,
        viewports: report.viewports,
      })),
      wcagReferences: STRUCTURE_WCAG_REFERENCES,
    };
    await attachSchemaSummary(testInfo, runPayload);

    for (const report of reports) {
      const pagePayload = createPageSummaryPayload({
        baseName: `a11y-structure-${slugify(siteLabel)}-${slugify(report.page)}`,
        title: `Structure audit — ${report.page}`,
        page: report.page,
        viewport: viewportLabel,
        summary: {
          h1Count: report.h1Count,
          hasMainLandmark: report.hasMain,
          navigationLandmarks: report.navigationCount,
          headerLandmarks: report.headerCount,
          footerLandmarks: report.footerCount,
          headingSkips: report.headingSkips,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          headingOutline: report.headingLevels,
          notes: report.notes,
          projectName: report.projectName,
          siteName: report.siteName,
          browser: report.browser,
          viewport: report.viewport,
          viewports: report.viewports,
        },
        metadata: {
          spec: 'a11y.structure.landmarks',
          summaryType: 'structure',
          projectName: siteLabel,
          siteName: siteLabel,
          viewports: [viewportLabel],
        },
      });
      await attachSchemaSummary(testInfo, pagePayload);
    }

    expect(gatingTotal, 'Structural accessibility gating issues detected').toBe(0);
  });
});

async function runStructureAudit(page, siteConfig, pagePath) {
  const report = {
    page: pagePath,
    gating: [],
    warnings: [],
    advisories: [],
    headingLevels: [],
    headingSkips: [],
    h1Count: 0,
    hasMain: false,
    navigationCount: 0,
    headerCount: 0,
    footerCount: 0,
    notes: [],
  };

  try {
    const response = await safeNavigate(page, `${siteConfig.baseUrl}${pagePath}`);
    if (!response || response.status() >= 400) {
      report.gating.push(
        `Failed to load page (status ${response ? response.status() : 'unknown'})`
      );
      return report;
    }

    const stability = await waitForPageStability(page);
    if (!stability.ok) {
      report.gating.push(`Page did not reach a stable state: ${stability.message}`);
      return report;
    }

    const structure = await evaluateStructure(page);
    report.headingLevels = structure.headings;
    report.h1Count = structure.h1Count;
    report.hasMain = structure.hasMain;
    report.navigationCount = structure.navigationCount;
    report.headerCount = structure.headerCount;
    report.footerCount = structure.footerCount;

    if (structure.h1Count === 0) {
      report.gating.push(
        createStructureFinding('No H1 heading found on the page.', '2.4.6', {
          impact: 'critical',
          summary: 'Missing H1 heading',
        })
      );
    } else if (structure.h1Count > 1) {
      report.gating.push(
        createStructureFinding(
          `Expected a single H1 heading; found ${structure.h1Count}.`,
          '2.4.6',
          {
            impact: 'critical',
            summary: 'Multiple H1 headings detected',
          }
        )
      );
    }

    if (!structure.hasMain) {
      report.gating.push(
        createStructureFinding('Missing <main> landmark (or equivalent role="main").', '1.3.1', {
          impact: 'critical',
          summary: 'Missing main landmark',
        })
      );
    }

    if (!structure.navigationCount) {
      report.advisories.push(
        createStructureFinding(
          'No navigation landmark detected. Ensure primary navigation is wrapped in <nav>.',
          '2.4.1',
          {
            summary: 'No navigation landmark detected',
          }
        )
      );
    }

    if (!structure.headerCount) {
      report.advisories.push(
        createStructureFinding('No header/banner landmark detected.', '1.3.1', {
          summary: 'No header landmark detected',
        })
      );
    }

    if (!structure.footerCount) {
      report.advisories.push(
        createStructureFinding('No footer/contentinfo landmark detected.', '1.3.1', {
          summary: 'No footer landmark detected',
        })
      );
    }

    const headingSkipCount = structure.headingSkips.length;
    report.headingSkips = [];
    for (const skip of structure.headingSkips) {
      const targetLabel = `h${skip.level}: "${skip.text}"`;
      let screenshotDataUri = null;
      try {
        const locator = page.locator('h1, h2, h3, h4, h5, h6').nth(skip.index);
        const buffer = await locator.screenshot();
        screenshotDataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      } catch (_) {
        // ignore screenshot failures
      }

      report.headingSkips.push(
        createStructureFinding(skip.message, '2.4.6', {
          impact: 'moderate',
          summary: 'Heading level sequence issue',
          details: `Jumps H${skip.prevLevel} → H${skip.level}`,
          nodes: [
            {
              target: [targetLabel],
              screenshotDataUri: screenshotDataUri || undefined,
            },
          ],
        })
      );
    }

    report.notes.push(
      `Heading outline captured ${structure.headings.length} nodes with ${headingSkipCount} level skip(s).`
    );
  } catch (error) {
    report.gating.push(`Navigation failed: ${error.message}`);
  } finally {
    // cleanup handled by runPageTasks
  }

  return report;
}
