const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');
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
const { selectAccessibilityTestPages, resolveSampleSetting } = require('../utils/a11y-shared');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

test.use({ trace: 'off', video: 'off' });

const STABILITY_TIMEOUT_MS = 20000;

const formatPageLabel = (page) => (page === '/' ? 'Homepage' : page);
const pageSummaryTitle = (page, suffix) => `${formatPageLabel(page)} — ${suffix}`;

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';

const collectRuleSnapshots = (entries, category) => {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const aggregate = new Map();

  entries.forEach(({ page, project, entries: violations }) => {
    const viewport = project || 'default';
    const pageKey = `${viewport}::${page}`;
    violations.forEach((violation) => {
      const ruleId = violation.id || 'unknown-rule';
      const key = `${category || 'rule'}::${ruleId}`;
      if (!aggregate.has(key)) {
        aggregate.set(key, {
          rule: ruleId,
          impact: violation.impact || category || 'info',
          helpUrl: violation.helpUrl || null,
          category,
          pages: new Set(),
          viewports: new Set(),
          nodes: 0,
          wcagTags: new Set(),
          description: violation.description || violation.help || violation.message || null,
        });
      }
      const record = aggregate.get(key);
      record.pages.add(pageKey);
      record.viewports.add(viewport);
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
    pages: Array.from(record.pages),
    viewports: Array.from(record.viewports),
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

  const viewportSet = new Set(reports.map((report) => report.projectName || 'default'));
  const toUniqueKey = (entry) => `${entry.project || 'default'}::${entry.page}`;
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

  const payload = createRunSummaryPayload({
    baseName,
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
    ruleSnapshots,
    metadata: {
      spec: 'a11y.audit.wcag',
      ...metadata,
      viewports: Array.from(viewportSet),
      failOn: failOnLabel,
    },
  });

  payload.details = {
    pages: reports.map((report) => ({
      page: report.page,
      status: report.status,
      projectName: report.projectName || 'default',
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
          viewport: report.projectName || 'default',
        };

        return createPageSummaryPayload({
          baseName: `a11y-page-${slugify(report.projectName || 'default')}-${slugify(report.page)}`,
          title: pageSummaryTitle(report.page, 'WCAG issues overview'),
          page: report.page,
          viewport: report.projectName || 'default',
          summary,
          metadata: {
            spec: 'a11y.audit.wcag',
            projectName: report.projectName || 'default',
            scope: 'project',
            ...metadataExtras,
          },
        });
      })
    : [];

const siteName = process.env.SITE_NAME;
if (!siteName) throw new Error('SITE_NAME environment variable is required');
const siteConfig = SiteLoader.loadSite(siteName);
SiteLoader.validateSiteConfig(siteConfig);

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

const a11yResultsBaseDir = path.join(
  process.cwd(),
  'test-results',
  '__a11y',
  slugify(siteConfig.name || siteName)
);

// Some Axe best-practice rules overlap with richer, dedicated specs in this
// suite. Suppress them from the WCAG audit's best-practice list to avoid
// duplicate surfacing across reports. Heading order is covered in
// a11y.structure.landmarks with detailed per-occurrence context and outline.
const SUPPRESS_BEST_PRACTICE_RULES = new Set([
  'heading-order',
]);
const globalSummaryDir = path.join(a11yResultsBaseDir, '__global');
const resolveGlobalSummaryFlagPath = () =>
  path.join(globalSummaryDir, `${RUN_TOKEN}-summary.json`);

const resolveProjectResultsDir = (projectName) =>
  path.join(a11yResultsBaseDir, slugify(projectName || 'default'));

const resolvePageReportPath = (projectName, index, testPage) => {
  const projectDir = resolveProjectResultsDir(projectName);
  const fileName = `${String(index + 1).padStart(4, '0')}-${slugify(testPage)}.json`;
  return { projectDir, filePath: path.join(projectDir, fileName) };
};

const persistPageReport = async (projectName, index, report) => {
  const { projectDir, filePath } = resolvePageReportPath(projectName, index, report.page);
  await fsp.mkdir(projectDir, { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
};

const readAllPageReports = async (projectName) => {
  const projectDir = resolveProjectResultsDir(projectName);
  try {
    const entries = await fsp.readdir(projectDir);
    const files = entries.filter((entry) => entry.endsWith('.json')).sort();
    const reports = [];
    for (const file of files) {
      const content = await fsp.readFile(path.join(projectDir, file), 'utf8');
      reports.push(JSON.parse(content));
    }
    return reports;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const resolveAvailableProjectNames = async () => {
  try {
    const entries = await fsp.readdir(a11yResultsBaseDir, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name !== '__global')
      .map((entry) => entry.name);

    const projects = [];
    for (const name of candidates) {
      const reports = await readAllPageReports(name);
      if (reports.some((report) => report.runToken === RUN_TOKEN)) {
        projects.push(name);
      }
    }
    return projects.length > 0 ? projects : candidates;
  } catch (_error) {
    return [];
  }
};

const deriveAggregatedFindings = (reports) => {
  const aggregatedViolations = [];
  const aggregatedAdvisories = [];
  const aggregatedBestPractices = [];

  for (const report of reports) {
    if (Array.isArray(report.violations) && report.violations.length > 0) {
      aggregatedViolations.push({
        page: report.page,
        project: report.projectName || 'default',
        entries: report.violations,
      });
    }
    if (Array.isArray(report.advisory) && report.advisory.length > 0) {
      aggregatedAdvisories.push({
        page: report.page,
        project: report.projectName || 'default',
        entries: report.advisory,
      });
    }
    if (Array.isArray(report.bestPractice) && report.bestPractice.length > 0) {
      aggregatedBestPractices.push({
        page: report.page,
        project: report.projectName || 'default',
        entries: report.bestPractice,
      });
    }
  }

  return { aggregatedViolations, aggregatedAdvisories, aggregatedBestPractices };
};

const maybeAttachGlobalSummary = async ({
  testInfo,
  totalPagesExpected,
  failOnLabel,
}) => {
  const flagPath = resolveGlobalSummaryFlagPath();
  try {
    await fsp.access(flagPath);
    return false;
  } catch (_error) {
    // flag not set; continue
  }

  const projectNames = await resolveAvailableProjectNames();
  if (projectNames.length === 0) {
    return false;
  }
  const combinedReports = [];

  for (const projectName of projectNames) {
    const reports = (await readAllPageReports(projectName))
      .filter((report) => report.runToken === RUN_TOKEN && typeof report.index === 'number')
      .sort((a, b) => (a.index || 0) - (b.index || 0));

    if (reports.length < totalPagesExpected) {
      return false; // other projects still processing; try later
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

  await fsp.mkdir(globalSummaryDir, { recursive: true });
  await fsp.writeFile(
    flagPath,
    JSON.stringify({ attachedAt: new Date().toISOString(), project: testInfo.project.name }, null, 2),
    'utf8'
  );

  return true;
};

const waitForPageReports = async (projectName, expectedCount, timeoutMs = 300000, pollMs = 1000) => {
  if (expectedCount === 0) return [];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const reports = (await readAllPageReports(projectName))
      .filter((report) => report.runToken === RUN_TOKEN && typeof report.index === 'number')
      .sort((a, b) => (a.index || 0) - (b.index || 0));
    if (reports.length >= expectedCount) {
      return reports.slice(0, expectedCount);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Timed out waiting for ${expectedCount} accessibility page report(s).`);
};

test.describe('Functionality: Accessibility (WCAG)', () => {
  test.describe.parallel('Page scans', () => {
    let errorContext;

    test.beforeEach(async ({ errorContext: sharedErrorContext }) => {
      errorContext = sharedErrorContext;
    });

    accessibilityPages.forEach((testPage, index) => {
      test(`WCAG 2.1 A/AA scan ${index + 1}/${totalPages}: ${testPage}`, async ({ page }, testInfo) => {
        test.setTimeout(7200000);

        console.log(`➡️  [${index + 1}/${totalPages}] Accessibility scan for ${testPage}`);

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
        projectName: testInfo.project?.name || 'default',
      };

        let response;
        try {
          response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        } catch (error) {
          pageReport.status = 'scan-error';
          pageReport.notes.push(`Navigation failed: ${error.message}`);
          console.error(`⚠️  Navigation failed for ${testPage}: ${error.message}`);

          const navigationSlug = `${slugify(testPage)}-navigation-error`;
          
          await persistPageReport(testInfo.project.name, index, pageReport);
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

          const httpSlug = `${slugify(testPage)}-http-error`;
          
          await persistPageReport(testInfo.project.name, index, pageReport);
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

          const stabilitySlug = `${slugify(testPage)}-stability`;
          
          await persistPageReport(testInfo.project.name, index, pageReport);
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
            const pageSlug = slugify(testPage);
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
            const pageSlug = slugify(testPage);
                      }
        } catch (error) {
          pageReport.status = 'scan-error';
          pageReport.notes.push(`Axe scan failed: ${error.message}`);
          console.error(`⚠️  Accessibility scan failed for ${testPage}: ${error.message}`);

          const errorSlug = `${slugify(testPage)}-scan-error`;
                  } finally {
          if (pageReport.status === 'skipped') {
            pageReport.status = 'passed';
          }
        }

        await persistPageReport(testInfo.project.name, index, pageReport);
      });
    });
  });

  test.describe.serial('Accessibility summary', () => {
    test('Aggregate results', async ({}, testInfo) => {
      test.setTimeout(300000);

      const reports = await waitForPageReports(testInfo.project.name, totalPages);
      if (reports.length === 0) {
        console.warn('ℹ️  Accessibility suite executed with no configured pages.');
        return;
      }

      const { aggregatedViolations, aggregatedAdvisories, aggregatedBestPractices } =
        deriveAggregatedFindings(reports);

      const schemaRunPayload = buildAccessibilityRunSchemaPayload({
        reports,
        aggregatedViolations,
        aggregatedAdvisories,
        aggregatedBestPractices,
        failOnLabel,
        baseName: `a11y-summary-${slugify(testInfo.project.name)}`,
        title: `WCAG findings – ${testInfo.project.name}`,
        metadata: {
          scope: 'project',
          projectName: testInfo.project.name,
          summaryType: 'wcag',
          suppressPageEntries: true,
        },
      });
      if (schemaRunPayload) {
        await attachSchemaSummary(testInfo, schemaRunPayload);
      }

      const schemaPagePayloads = buildAccessibilityPageSchemaPayloads(reports, {
        summaryType: 'wcag',
        gatingLabel: failOnLabel,
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
