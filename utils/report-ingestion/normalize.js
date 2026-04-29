'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('node:crypto');

const SUITES = ['functionality', 'accessibility', 'responsive', 'visual'];

const SUMMARY_TYPE_TO_SUITE = {
  wcag: 'accessibility',
  forms: 'accessibility',
  keyboard: 'accessibility',
  structure: 'accessibility',
  'reduced-motion': 'accessibility',
  reflow: 'accessibility',
  'iframe-metadata': 'accessibility',
  'internal-links': 'functionality',
  interactive: 'functionality',
  availability: 'functionality',
  http: 'functionality',
  performance: 'functionality',
  'responsive-structure': 'responsive',
  'responsive-consistency': 'responsive',
  'wp-features': 'responsive',
  visual: 'visual',
};

const SPEC_TO_SUMMARY_TYPE = {
  'a11y.audit.wcag': 'wcag',
  'a11y.forms.validation': 'forms',
  'a11y.keyboard.navigation': 'keyboard',
  'a11y.structure.landmarks': 'structure',
  'functionality.links.internal': 'internal-links',
  'functionality.interactive.smoke': 'interactive',
  'functionality.infrastructure.health': 'availability',
  'responsive.layout.structure': 'responsive-structure',
  'visual.regression.snapshots': 'visual',
};

const TEST_FILE_TO_SUMMARY_TYPE = {
  'a11y.audit.wcag.spec.js': 'wcag',
  'a11y.forms.validation.spec.js': 'forms',
  'a11y.keyboard.navigation.spec.js': 'keyboard',
  'a11y.structure.landmarks.spec.js': 'structure',
  'a11y.resilience.adaptive.spec.js': 'reduced-motion',
  'functionality.links.internal.spec.js': 'internal-links',
  'functionality.interactive.smoke.spec.js': 'interactive',
  'functionality.infrastructure.health.spec.js': 'availability',
  'responsive.layout.structure.spec.js': 'responsive-structure',
  'visual.regression.snapshots.spec.js': 'visual',
};

const FAIL_STATUSES = new Set(['failed', 'timedout', 'timed-out', 'interrupted', 'blocker']);
const WARN_STATUSES = new Set(['warning', 'warnings', 'warn', 'advisory', 'advisories']);

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashValue = (value) => createHash('sha256').update(stableStringify(value)).digest('hex');

const deterministicUuid = (namespace, value) => {
  const bytes = Buffer.from(
    createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32),
    'hex'
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
};

const countItems = (...values) => values.reduce((total, value) => total + asArray(value).length, 0);

const normaliseStatusToken = (value) => String(value || '').toLowerCase();

const countStatusKeys = (statusCounts = {}, keys = []) => {
  if (!statusCounts || typeof statusCounts !== 'object') return 0;
  return keys.reduce((total, key) => total + Number(statusCounts[key] || 0), 0);
};

const hasTruthyFlag = (value, keys) => {
  if (!value || typeof value !== 'object') return false;
  return keys.some((key) => Boolean(value[key]));
};

const deriveSummaryStatus = (payload) => {
  const summary = payload?.summary || {};
  const overview = payload?.overview || {};
  const result = normaliseStatusToken(
    summary.result || summary.statusLabel || summary.status || overview.status || ''
  );

  if (
    FAIL_STATUSES.has(result) ||
    result === 'diff' ||
    result === 'error' ||
    summary.error ||
    countItems(
      summary.gating,
      summary.gatingIssues,
      summary.gatingViolations,
      summary.failedChecks,
      overview.gating,
      overview.gatingIssues,
      overview.failedChecks
    ) > 0 ||
    hasTruthyFlag(summary, ['hasBlocker', 'hasFailure', 'failed', 'timedOut', 'interrupted'])
  ) {
    return 'fail';
  }

  if (
    WARN_STATUSES.has(result) ||
    countItems(
      summary.warnings,
      summary.advisories,
      summary.advisoriesList,
      overview.warnings,
      overview.advisories
    ) > 0 ||
    hasTruthyFlag(summary, ['hasWarnings', 'hasAdvisories'])
  ) {
    return 'warn';
  }

  return 'pass';
};

const mergeStatus = (current, next) => {
  if (current === 'fail' || next === 'fail') return 'fail';
  if (current === 'warn' || next === 'warn') return 'warn';
  return 'pass';
};

const summaryTypeFromTest = (test) => {
  const fromTitle = (test?.titlePath || []).join(' ').toLowerCase();
  if (fromTitle.includes('wcag')) return 'wcag';
  if (fromTitle.includes('forms')) return 'forms';
  if (fromTitle.includes('keyboard')) return 'keyboard';
  if (fromTitle.includes('structure')) return 'structure';
  if (fromTitle.includes('internal links')) return 'internal-links';
  if (fromTitle.includes('interactive')) return 'interactive';
  if (fromTitle.includes('availability')) return 'availability';
  if (fromTitle.includes('http')) return 'http';
  if (fromTitle.includes('performance')) return 'performance';
  if (fromTitle.includes('responsive')) return 'responsive-structure';
  if (fromTitle.includes('visual')) return 'visual';

  const fileName = path.basename(test?.location?.file || '');
  return TEST_FILE_TO_SUMMARY_TYPE[fileName] || 'unknown';
};

const normalizeSummaryType = (payload, fallbackTest) => {
  const metadata = payload?.metadata || {};
  if (typeof metadata.summaryType === 'string' && metadata.summaryType) return metadata.summaryType;
  if (typeof metadata.spec === 'string' && SPEC_TO_SUMMARY_TYPE[metadata.spec]) {
    return SPEC_TO_SUMMARY_TYPE[metadata.spec];
  }
  return summaryTypeFromTest(fallbackTest);
};

const suiteForRule = (rule) => SUMMARY_TYPE_TO_SUITE[rule] || 'functionality';

const sourceKeyFor = ({ importId, rule, payload = {}, context = {}, index }) => {
  return hashValue({
    importId,
    rule,
    kind: payload.kind || null,
    baseName: payload.baseName || null,
    page: payload.page || payload.summary?.page || null,
    viewport: payload.viewport || payload.summary?.viewport || context.projectName || null,
    testAnchorId: context.testAnchorId || null,
    testId: context.testId || null,
    index,
  }).slice(0, 48);
};

const deriveReportRelativePath = (artifactPath) => {
  if (!artifactPath) return null;
  const dataDir = path.dirname(artifactPath);
  const runDir = path.dirname(dataDir);
  const reportsDir = path.dirname(runDir);
  return path.relative(reportsDir, path.join(runDir, 'report.html')).split(path.sep).join('/');
};

const deriveRunStatusFromCounts = (statusCounts = {}) => {
  if (countStatusKeys(statusCounts, ['failed', 'timedOut', 'interrupted']) > 0) return 'fail';
  return 'pass';
};

const readRunArtifact = (inputPath) => {
  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);
  const artifactPath = stat.isDirectory() ? path.join(resolved, 'data', 'run.json') : resolved;
  const runDir = path.basename(path.dirname(path.dirname(artifactPath)));
  const runData = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return {
    artifactPath,
    artifactDir: runDir,
    runData,
  };
};

const extractSummaryEntries = (runData) => {
  const entries = [];
  const seen = new Set();
  const push = (payload, context = {}) => {
    if (!payload || typeof payload !== 'object') return;
    const key = hashValue(payload);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ payload, context });
  };

  for (const test of runData.tests || []) {
    for (const summary of test.schemaSummaries || []) {
      push(summary, {
        testAnchorId: test.anchorId,
        testId: test.testId,
        projectName: test.projectName,
        test,
      });
    }
  }

  for (const group of runData.schemaSummaries || []) {
    for (const summary of group.summaries || []) {
      push(summary, {
        testAnchorId: group.testAnchorId,
        projectName: group.projectName,
      });
    }
  }

  for (const summary of runData.runSummaries || []) {
    push(summary, { runSummary: true });
  }

  return entries;
};

const testStatusToRunStatus = (status) => {
  if (FAIL_STATUSES.has(normaliseStatusToken(status))) return 'fail';
  return 'pass';
};

const pagesTested = (runData, summaryEntries) => {
  const pages = new Set();
  for (const { payload } of summaryEntries) {
    if (payload?.page) pages.add(payload.page);
  }
  return pages.size || Number(runData.totalTests || 0);
};

const normalizeRunArtifact = ({ runData, artifactDir, artifactPath, siteId = null } = {}) => {
  if (!runData || typeof runData !== 'object') {
    throw new TypeError('normalizeRunArtifact requires parsed runData');
  }

  const payloadHash = hashValue(runData);
  const importId = hashValue({
    artifactDir: artifactDir || null,
    artifactPath: artifactPath ? path.resolve(artifactPath) : null,
    payloadHash,
  }).slice(0, 32);
  const runId = deterministicUuid('scry-report-run', `${siteId || 'unassigned-site'}:${importId}`);
  const summaryEntries = extractSummaryEntries(runData);
  const suiteStatuses = new Map(SUITES.map((suite) => [suite, 'pass']));
  const suiteSummaryTypes = new Map(SUITES.map((suite) => [suite, new Set()]));
  const suiteSummaries = new Map(SUITES.map((suite) => [suite, []]));
  const suitesSeen = new Set();
  const findings = [];

  for (const entry of summaryEntries) {
    const rule = normalizeSummaryType(entry.payload, entry.context.test);
    const suite = suiteForRule(rule);
    const status = deriveSummaryStatus(entry.payload);
    const severity = status === 'fail' ? 'blocker' : status === 'warn' ? 'warning' : 'passed';
    const page = entry.payload?.page || entry.payload?.summary?.page || null;
    const viewport =
      entry.payload?.viewport ||
      entry.payload?.summary?.viewport ||
      entry.context.projectName ||
      null;
    const sourceKey = sourceKeyFor({
      importId,
      rule,
      payload: entry.payload,
      context: entry.context,
      index: findings.length,
    });

    suitesSeen.add(suite);
    suiteSummaryTypes.get(suite).add(rule);
    suiteSummaries.get(suite).push(entry.payload);
    suiteStatuses.set(suite, mergeStatus(suiteStatuses.get(suite) || 'pass', status));

    findings.push({
      id: deterministicUuid('scry-report-finding', `${runId}:${sourceKey}`),
      run_id: runId,
      suite,
      summary_type: rule,
      rule,
      severity,
      page,
      viewport,
      source_key: sourceKey,
      page_count: page ? 1 : pagesTested(runData, [entry]),
      details: {
        title: entry.payload.title || null,
        page,
        viewport,
        kind: entry.payload.kind || null,
        summary: entry.payload.summary || entry.payload.overview || null,
        source: entry.payload,
        source_context: Object.assign({}, entry.context, { test: undefined }),
      },
    });
  }

  for (const test of runData.tests || []) {
    const status = testStatusToRunStatus(test.status);
    const rule = summaryTypeFromTest(test);
    const suite = suiteForRule(rule);
    suitesSeen.add(suite);
    if (rule !== 'unknown') suiteSummaryTypes.get(suite).add(rule);
    suiteStatuses.set(suite, mergeStatus(suiteStatuses.get(suite) || 'pass', status));

    if (status === 'fail') {
      const sourceKey = hashValue({
        importId,
        testId: test.testId || null,
        anchorId: test.anchorId || null,
        status: test.status || null,
      }).slice(0, 48);

      findings.push({
        id: deterministicUuid('scry-report-finding', `${runId}:${sourceKey}`),
        run_id: runId,
        suite,
        summary_type: rule === 'unknown' ? null : rule,
        rule,
        severity: 'blocker',
        page: null,
        viewport: test.projectName || null,
        source_key: sourceKey,
        page_count: 1,
        details: {
          title: test.displayTitle || test.title || null,
          page: null,
          viewport: test.projectName || null,
          status: test.status || null,
          errors: test.errors || [],
          source: test,
        },
      });
    }
  }

  const suitesRun = Array.from(suitesSeen);
  let runStatus = 'pass';
  runStatus = mergeStatus(runStatus, deriveRunStatusFromCounts(runData.statusCounts || {}));
  for (const status of suiteStatuses.values()) {
    runStatus = mergeStatus(runStatus, status);
  }

  const run = {
    id: runId,
    site_id: siteId,
    source_kind: 'local-report',
    source_artifact_id: importId,
    source_run_id: runData.runId || null,
    source_payload_hash: payloadHash,
    profile: runData.profile || null,
    status: runStatus,
    pages_tested: pagesTested(runData, summaryEntries),
    total_tests: Number.isFinite(Number(runData.totalTests)) ? Number(runData.totalTests) : null,
    total_tests_planned: Number.isFinite(Number(runData.totalTestsPlanned))
      ? Number(runData.totalTestsPlanned)
      : null,
    status_counts: runData.statusCounts || {},
    suites_run: suitesRun,
    report_relative_path: deriveReportRelativePath(artifactPath),
    started_at: runData.startedAt || null,
    completed_at: runData.completedAt || null,
  };

  const run_suites = suitesRun.map((suite) => ({
    id: deterministicUuid('scry-report-run-suite', `${runId}:${suite}`),
    run_id: runId,
    suite,
    score: null,
    status: suiteStatuses.get(suite) || 'pass',
    summary_types: Array.from(suiteSummaryTypes.get(suite) || []),
    summary: {
      summaries: suiteSummaries.get(suite) || [],
    },
  }));

  return {
    import_id: importId,
    payload_hash: payloadHash,
    artifact: {
      dir: artifactDir || null,
      path: artifactPath ? path.resolve(artifactPath) : null,
      source_run_id: runData.runId || null,
    },
    records: {
      runs: [run],
      run_suites,
      findings,
    },
  };
};

module.exports = {
  SUMMARY_TYPE_TO_SUITE,
  deterministicUuid,
  deriveSummaryStatus,
  extractSummaryEntries,
  hashValue,
  normalizeRunArtifact,
  readRunArtifact,
};
