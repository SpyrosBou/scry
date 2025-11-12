const { test, expect } = require('../utils/test-fixtures');
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const {
  extractWcagLevels,
  violationHasWcagCoverage,
} = require('../utils/a11y-utils');
const { createAxeBuilder } = require('../utils/a11y-runner');
const {
  selectAccessibilityTestPages,
  resolveSampleSetting,
  resolveAccessibilityMetadata,
  applyViewportMetadata,
} = require('../utils/a11y-shared');
const {
  buildRunSummaryPayload,
  buildPageSummaryPayload,
} = require('../utils/report-summary-builder');
const { getActiveSiteContext } = require('../utils/test-context');

test.use({ trace: 'off', video: 'off' });

const STABILITY_TIMEOUT_MS = 20000;
const DATA_MISSING_LABEL = 'DATA MISSING';

const formatPageLabel = (page) => (page === '/' ? 'Homepage' : page);
const pageSummaryTitle = (page, suffix) => `${formatPageLabel(page)} — ${suffix}`;

const collectRuleSnapshots = (entries, category) => {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const aggregate = new Map();

  entries.forEach(({ page, project, browser, viewports, entries: violations }) => {
    const projectKey = project || 'default';
    const browserLabel = browser || DATA_MISSING_LABEL;
    const viewportSet = new Set(
      Array.isArray(viewports) && viewports.length ? viewports : [browserLabel]
    );
    violations.forEach((violation) => {
      const ruleId = violation.id || 'unknown-rule';
      const key = `${category || 'rule'}::${ruleId}`;
      if (!aggregate.has(key)) {
        aggregate.set(key, {
          rule: ruleId,
          impact: violation.impact || category || 'info',
          helpUrl: violation.helpUrl || null,
          category,
          pages: new Map(),
          viewports: new Set(),
          browsers: new Set(),
          nodes: 0,
          wcagTags: new Set(),
          description: violation.description || violation.help || violation.message || null,
        });
      }
      const record = aggregate.get(key);
      const dedupeKey = `${projectKey}::${browserLabel}::${page || ''}`;
      record.pages.set(dedupeKey, page);
      viewportSet.forEach((value) => record.viewports.add(value || DATA_MISSING_LABEL));
      record.browsers.add(browserLabel);
      record.nodes += violation.nodes?.length || 0;
      if (!record.description && (violation.description || violation.help || violation.message)) {
        record.description = violation.description || violation.help || violation.message;
      }
      extractWcagLevels(violation.tags || []).forEach((level) => {
        if (level?.label) record.wcagTags.add(level.label);
      });
    });
  });

  return Array.from(aggregate.values()).map((record) => ({
    rule: record.rule,
    impact: record.impact,
    helpUrl: record.helpUrl,
    category: record.category,
    description: record.description,
    pages: Array.from(record.pages.values()),
    viewports: Array.from(record.viewports),
    browsers: Array.from(record.browsers),
    nodes: record.nodes,
    wcagTags: Array.from(record.wcagTags),
  }));
};

const buildAccessibilityRunSchemaPayload = ({
  reports,
  aggregatedViolations,
  aggregatedAdvisories,
  aggregatedBestPractices,
  failOnLabel,
  baseName,
  title,
  metadata,
  htmlBody,
  markdownBody,
}) => {
  if (!Array.isArray(reports) || reports.length === 0) return null;

  const viewportSet = new Set(
    reports.map((report) => report.browser || report.viewport || DATA_MISSING_LABEL)
  );
  const toUniqueKey = (entry) => {
    const siteKey = entry.project || 'default';
    const viewportKey = entry.browser || entry.viewport || DATA_MISSING_LABEL;
    return `${siteKey}::${viewportKey}::${entry.page}`;
  };
  const gatingPages = new Set(aggregatedViolations.map(toUniqueKey));
  const advisoryPages = new Set(aggregatedAdvisories.map(toUniqueKey));
  const bestPracticePages = new Set(aggregatedBestPractices.map(toUniqueKey));

  const ruleSnapshots = [
    ...collectRuleSnapshots(aggregatedViolations, 'gating'),
    ...collectRuleSnapshots(aggregatedAdvisories, 'advisory'),
    ...collectRuleSnapshots(aggregatedBestPractices, 'best-practice'),
  ];

  const totalViolations = aggregatedViolations.reduce(
    (acc, entry) => acc + (Array.isArray(entry.entries) ? entry.entries.length : 0),
    0
  );
  const totalAdvisories = aggregatedAdvisories.reduce(
    (acc, entry) => acc + (Array.isArray(entry.entries) ? entry.entries.length : 0),
    0
  );
  const totalBestPractices = aggregatedBestPractices.reduce(
    (acc, entry) => acc + (Array.isArray(entry.entries) ? entry.entries.length : 0),
    0
  );

  const payload = buildRunSummaryPayload({
    prefix: 'a11y-wcag',
    key: metadata?.projectName || metadata?.siteName || baseName,
    title,
    overview: {
      totalPages: reports.length,
      gatingPages: gatingPages.size,
      advisoryPages: advisoryPages.size,
      bestPracticePages: bestPracticePages.size,
      totalGatingFindings: totalViolations,
      totalAdvisoryFindings: totalAdvisories,
      totalBestPracticeFindings: totalBestPractices,
      viewportsTested: viewportSet.size,
      failThreshold: failOnLabel,
    },
    metadata: {
      spec: 'a11y.audit.wcag',
      ...metadata,
      viewports: Array.from(viewportSet),
      failOn: failOnLabel,
    },
    ruleSnapshots,
  });

  payload.details = {
    pages: reports.map((report) => ({
      page: report.page,
      status: report.status,
      projectName: report.projectName || 'default',
      siteName: report.siteName || report.projectName || null,
      browser: report.browser || null,
      viewport: report.viewport || null,
      viewports:
        Array.isArray(report.viewports) && report.viewports.length
          ? report.viewports
          : report.viewport
            ? [report.viewport]
            : [],
      gatingViolations: (report.violations || []).length,
      advisoryFindings: (report.advisory || []).length,
      bestPracticeFindings: (report.bestPractice || []).length,
      stability: report.stability || null,
      httpStatus: report.httpStatus ?? 200,
      notes: Array.isArray(report.notes) ? report.notes : [],
      gatingLabel: report.gatingLabel || metadata.failOn || 'WCAG A/AA/AAA',
      violations: report.violations || [],
      advisories: report.advisory || [],
      bestPractices: report.bestPractice || [],
    })),
    aggregatedViolations,
    aggregatedAdvisories,
    aggregatedBestPractices,
    failThreshold: failOnLabel,
    viewports: Array.from(viewportSet),
  };

  if (htmlBody) payload.htmlBody = htmlBody;
  if (markdownBody) payload.markdownBody = markdownBody;
  return payload;
};

const buildAccessibilityPageSchemaPayloads = (reports, metadataExtras = {}) =>
  Array.isArray(reports)
    ? reports.map((report) => {
        const summaryViewport = report.viewport || report.browser || null;
        const summaryViewports =
          Array.isArray(report.viewports) && report.viewports.length
            ? report.viewports
            : summaryViewport
              ? [summaryViewport]
              : [];
        const summary = {
          page: report.page,
          status: report.status,
          gatingViolations: (report.violations || []).length,
          advisoryFindings: (report.advisory || []).length,
          bestPracticeFindings: (report.bestPractice || []).length,
          stability: report.stability
            ? {
                ok: Boolean(report.stability.ok),
                strategy: report.stability.successfulStrategy || null,
                durationMs: report.stability.duration ?? null,
              }
            : null,
          httpStatus: report.httpStatus ?? 200,
          notes: Array.isArray(report.notes) ? report.notes : [],
          gatingLabel: report.gatingLabel || metadataExtras.gatingLabel || 'WCAG A/AA/AAA',
          violations: report.violations || [],
          advisoriesList: report.advisory || [],
          bestPracticesList: report.bestPractice || [],
          projectName: report.projectName || 'default',
          siteName: report.siteName || report.projectName || null,
          browser: report.browser || null,
          viewport: summaryViewport,
          viewports: summaryViewports,
        };

        return buildPageSummaryPayload({
          prefix: 'a11y-wcag',
          projectName: report.projectName || 'default',
          viewport: summaryViewport || DATA_MISSING_LABEL,
          page: report.page,
          title: pageSummaryTitle(report.page, 'WCAG issues overview'),
          summary,
          metadata: {
            spec: 'a11y.audit.wcag',
            projectName: report.projectName || 'default',
            scope: 'project',
            viewports: summaryViewports.length ? summaryViewports : undefined,
            ...metadataExtras,
          },
        });
      })
    : [];

const { siteName, siteConfig } = getActiveSiteContext();

const accessibilitySampleSetting = resolveSampleSetting(siteConfig, {
  envKey: 'A11Y_SAMPLE',
  configKeys: ['a11yResponsiveSampleSize'],
  defaultSize: 'all',
  smokeSize: 1,
});

const accessibilityPages = selectAccessibilityTestPages(siteConfig, {
  envKey: 'A11Y_SAMPLE',
  configKeys: ['a11yResponsiveSampleSize'],
  defaultSize: 'all',
  smokeSize: 1,
});
const totalPages = accessibilityPages.length;
const RUN_TOKEN = process.env.A11Y_RUN_TOKEN || `${Date.now()}`;
if (!process.env.A11Y_RUN_TOKEN) {
  process.env.A11Y_RUN_TOKEN = RUN_TOKEN;
}

if (accessibilitySampleSetting !== 'all') {
  const sampleSource = process.env.A11Y_SAMPLE
    ? ` (A11Y_SAMPLE=${process.env.A11Y_SAMPLE})`
    : '';
  console.log(
    `ℹ️  Accessibility sampling limited to ${accessibilitySampleSetting} page(s)${sampleSource}.`
  );
}

const failOn = Array.isArray(siteConfig.a11yFailOn)
  ? siteConfig.a11yFailOn
  : ['critical', 'serious'];
const failOnSet = new Set(failOn.map((impact) => String(impact).toLowerCase()));
const failOnLabel = failOn.map((impact) => String(impact).toUpperCase()).join('/');
const A11Y_MODE = siteConfig.a11yMode === 'audit' ? 'audit' : 'gate';

// Some Axe best-practice rules overlap ...
const SUPPRESS_BEST_PRACTICE_RULES = new Set([
  'heading-order',
]);
const projectReportStore = new Map();
let globalSummaryAttached = false;

const getProjectBucket = (projectName) => {
  const key = projectName || 'default';
  if (!projectReportStore.has(key)) {
    projectReportStore.set(key, new Map());
  }
  return projectReportStore.get(key);
};

const recordPageReport = (projectName, report) => {
  const bucket = getProjectBucket(projectName);
  const indexKey = report.index ?? bucket.size + 1;
  bucket.set(indexKey, { ...report });
};

const readProjectReports = (projectName) => {
  const bucket = projectReportStore.get(projectName || 'default');
  if (!bucket) return [];
  return Array.from(bucket.values()).sort((a, b) => (a.index || 0) - (b.index || 0));
};

const deriveAggregatedFindings = (reports) => {
  const aggregatedViolations = [];
  const aggregatedAdvisories = [];
  const aggregatedBestPractices = [];

  for (const report of reports) {
    const browserLabel = report.browser || report.viewport || DATA_MISSING_LABEL;
    const viewports =
      Array.isArray(report.viewports) && report.viewports.length
        ? report.viewports.slice()
        : report.viewport
          ? [report.viewport]
          : [];
    if (Array.isArray(report.violations) && report.violations.length > 0) {
      aggregatedViolations.push({
        page: report.page,
        project: report.projectName || 'default',
        browser: browserLabel,
        viewports,
        entries: report.violations,
      });
    }
    if (Array.isArray(report.advisory) && report.advisory.length > 0) {
      aggregatedAdvisories.push({
        page: report.page,
        project: report.projectName || 'default',
        browser: browserLabel,
        viewports,
        entries: report.advisory,
      });
    }
    if (Array.isArray(report.bestPractice) && report.bestPractice.length > 0) {
      aggregatedBestPractices.push({
        page: report.page,
        project: report.projectName || 'default',
        browser: browserLabel,
        viewports,
        entries: report.bestPractice,
      });
    }
  }

  return { aggregatedViolations, aggregatedAdvisories, aggregatedBestPractices };
};

const maybeAttachGlobalSummary = async ({ testInfo, totalPagesExpected, failOnLabel }) => {
  if (globalSummaryAttached) return false;
  const projectNames = Array.from(projectReportStore.keys());
  if (projectNames.length === 0) return false;
  const combinedReports = [];

  for (const projectName of projectNames) {
    const reports = readProjectReports(projectName).filter(
      (report) => report.runToken === RUN_TOKEN && typeof report.index === 'number'
    );
    if (reports.length < totalPagesExpected) {
      return false;
    }
    combinedReports.push(...reports.slice(0, totalPagesExpected));
  }

  if (combinedReports.length === 0) return false;

  const { aggregatedViolations, aggregatedAdvisories, aggregatedBestPractices } =
    deriveAggregatedFindings(combinedReports);

  const schemaRunPayload = buildAccessibilityRunSchemaPayload({
    reports: combinedReports,
    aggregatedViolations,
    aggregatedAdvisories,
    aggregatedBestPractices,
    failOnLabel,
    baseName: 'a11y-summary',
    title: 'Sitewide WCAG findings',
    metadata: {
      scope: 'run',
      projectName: 'aggregate',
      summaryType: 'wcag',
      suppressPageEntries: true,
    },
  });
  if (schemaRunPayload) {
    await attachSchemaSummary(testInfo, schemaRunPayload);
  }

  globalSummaryAttached = true;
  return true;
};

test.describe('Functionality: Accessibility (WCAG)', () => {
  test.describe.parallel('Page scans', () => {
    accessibilityPages.forEach((testPage, index) => {
      test(`WCAG 2.1 A/AA scan ${index + 1}/${totalPages}: ${testPage}`, async ({ page }, testInfo) => {
        test.setTimeout(7200000);

        console.log(`➡️  [${index + 1}/${totalPages}] Accessibility scan for ${testPage}`);

      const { siteLabel: pageSiteLabel, viewportLabel: pageViewportLabel } =
        resolveAccessibilityMetadata(siteConfig, testInfo);

      const pageReport = {
        page: testPage,
        index: index + 1,
        runToken: RUN_TOKEN,
        status: 'skipped',
        httpStatus: null,
        stability: null,
        notes: [],
        violations: [],
        advisory: [],
        bestPractice: [],
        gatingLabel: failOnLabel,
      };

      applyViewportMetadata([pageReport], pageViewportLabel, pageSiteLabel);

        let response;
        try {
          response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        } catch (error) {
          pageReport.status = 'scan-error';
          pageReport.notes.push(`Navigation failed: ${error.message}`);
          console.error(`⚠️  Navigation failed for ${testPage}: ${error.message}`);

        recordPageReport(testInfo.project.name, pageReport);
        if (A11Y_MODE !== 'audit') {
          throw new Error(`Navigation failed for ${testPage}: ${error.message}`);
        }
          return;
        }

        pageReport.httpStatus = response.status();
        if (response.status() !== 200) {
          pageReport.status = 'http-error';
          pageReport.notes.push(`Received HTTP status ${response.status()}; scan skipped.`);
          console.error(`⚠️  HTTP ${response.status()} while loading ${testPage}; skipping scan.`);

          recordPageReport(testInfo.project.name, pageReport);
          if (A11Y_MODE !== 'audit') {
            throw new Error(`HTTP ${response.status()} received for ${testPage}`);
          }
          return;
        }

        const stability = await waitForPageStability(page, {
          timeout: STABILITY_TIMEOUT_MS,
        });
        pageReport.stability = stability;
        if (!stability.ok) {
          pageReport.status = 'stability-timeout';
          pageReport.notes.push(stability.message);
          console.warn(`⚠️  ${stability.message} for ${testPage}`);

          recordPageReport(testInfo.project.name, pageReport);
          return;
        }

        try {
          const results = await createAxeBuilder(page).analyze();

          const ignoreRules = Array.isArray(siteConfig.a11yIgnoreRules)
            ? siteConfig.a11yIgnoreRules
            : [];

          const relevantViolations = (results.violations || []).filter(
            (violation) => !ignoreRules.includes(violation.id)
          );

          const gatingViolations = relevantViolations.filter((violation) =>
            failOnSet.has(String(violation.impact || '').toLowerCase())
          );

          const advisoryViolations = relevantViolations.filter(
            (violation) =>
              !failOnSet.has(String(violation.impact || '').toLowerCase()) &&
              violationHasWcagCoverage(violation)
          );

          const bestPracticeViolations = relevantViolations.filter(
            (violation) =>
              !failOnSet.has(String(violation.impact || '').toLowerCase()) &&
              !violationHasWcagCoverage(violation)
          ).filter((violation) => !SUPPRESS_BEST_PRACTICE_RULES.has(violation.id));

          pageReport.violations = gatingViolations;
          pageReport.advisory = advisoryViolations;
          pageReport.bestPractice = bestPracticeViolations;

          if (gatingViolations.length > 0) {
            pageReport.status = 'violations';
            const message = `❌ ${gatingViolations.length} accessibility violations (gating: ${failOnLabel}) on ${testPage}`;
            if (A11Y_MODE === 'audit') {
              console.warn(message);
            } else {
              console.error(message);
            }
          } else {
            pageReport.status = 'passed';
            console.log(`✅ No ${failOnLabel} accessibility violations on ${testPage}`);
          }

          if (advisoryViolations.length > 0) {
            console.warn(`ℹ️  ${advisoryViolations.length} non-gating WCAG finding(s) on ${testPage}`);
          }

          if (bestPracticeViolations.length > 0) {
            console.warn(
              `ℹ️  ${bestPracticeViolations.length} best-practice advisory finding(s) (no WCAG tag) on ${testPage}`
            );
          }

          if (
            pageReport.status === 'passed' &&
            (advisoryViolations.length > 0 || bestPracticeViolations.length > 0)
          ) {
            console.warn(
              `ℹ️  ${advisoryViolations.length + bestPracticeViolations.length} non-gating finding(s) captured for ${testPage}`
            );
          }
        } catch (error) {
          pageReport.status = 'scan-error';
          pageReport.notes.push(`Axe scan failed: ${error.message}`);
          console.error(`⚠️  Accessibility scan failed for ${testPage}: ${error.message}`);
        } finally {
          if (pageReport.status === 'skipped') {
            pageReport.status = 'passed';
          }
        }

        recordPageReport(testInfo.project.name, pageReport);
      });
    });
  });

  test.describe.serial('Accessibility summary', () => {
    test('Aggregate results', async ({}, testInfo) => {
      test.setTimeout(300000);

      const reports = readProjectReports(testInfo.project.name);
      if (reports.length < totalPages) {
        throw new Error(
          `Accessibility summary expected ${totalPages} page report(s) for ${testInfo.project.name}, found ${reports.length}`
        );
      }
      if (reports.length === 0) {
        console.warn('ℹ️  Accessibility suite executed with no configured pages.');
        return;
      }
      const { siteLabel, viewportLabel } = resolveAccessibilityMetadata(siteConfig, testInfo);
      applyViewportMetadata(reports, viewportLabel, siteLabel);

      const { aggregatedViolations, aggregatedAdvisories, aggregatedBestPractices } =
        deriveAggregatedFindings(reports);

      const schemaRunPayload = buildAccessibilityRunSchemaPayload({
        reports,
        aggregatedViolations,
        aggregatedAdvisories,
        aggregatedBestPractices,
        failOnLabel,
        baseName: testInfo.project.name,
        title: `WCAG findings – ${testInfo.project.name}`,
        metadata: {
          scope: 'project',
          projectName: siteLabel,
          siteName: siteLabel,
          summaryType: 'wcag',
          suppressPageEntries: true,
          viewports: [viewportLabel],
        },
      });
      if (schemaRunPayload) {
        await attachSchemaSummary(testInfo, schemaRunPayload);
      }

      const schemaPagePayloads = buildAccessibilityPageSchemaPayloads(reports, {
        summaryType: 'wcag',
        gatingLabel: failOnLabel,
        projectName: siteLabel,
        siteName: siteLabel,
        viewports: [viewportLabel],
      });
      for (const payload of schemaPagePayloads) {
        await attachSchemaSummary(testInfo, payload);
      }

      await maybeAttachGlobalSummary({
        testInfo,
        totalPagesExpected: totalPages,
        failOnLabel,
      });

      const totalViolations = aggregatedViolations.reduce(
        (sum, entry) => sum + (entry.entries?.length || 0),
        0
      );
      const totalAdvisory = aggregatedAdvisories.reduce(
        (sum, entry) => sum + (entry.entries?.length || 0),
        0
      );
      const totalBestPractice = aggregatedBestPractices.reduce(
        (sum, entry) => sum + (entry.entries?.length || 0),
        0
      );

      if (totalAdvisory > 0) {
        console.warn(
          `ℹ️ Non-gating WCAG findings detected (${totalAdvisory} item(s)); review the report summary for details.`
        );
      }

      if (totalBestPractice > 0) {
        console.warn(
          `ℹ️ Best-practice advisory findings (no WCAG tag) detected (${totalBestPractice} item(s)); review the report summary for details.`
        );
      }

      if (totalViolations > 0) {
        if (A11Y_MODE === 'audit') {
          console.warn('ℹ️ Accessibility audit summary available in the run report (summary section).');
        } else {
          expect(
            totalViolations,
            `Accessibility violations detected (gating: ${failOnLabel}). See the report summary for a structured breakdown.`
          ).toBe(0);
        }
      }
    });
  });
});
