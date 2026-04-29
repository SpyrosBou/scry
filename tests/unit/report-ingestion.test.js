'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SUMMARY_TYPE_TO_SUITE,
  deriveSummaryStatus,
  normalizeRunArtifact,
} = require('../../utils/report-ingestion/normalize');

const baseRunData = (overrides = {}) =>
  Object.assign(
    {
      runId: 'run-duplicate-ish',
      startedAt: '2026-04-01T10:00:00.000Z',
      completedAt: '2026-04-01T10:01:00.000Z',
      totalTests: 1,
      tests: [],
      schemaSummaries: [],
    },
    overrides
  );

const pageSummary = ({ summaryType, summary, page = '/', title = 'Summary' }) => ({
  schema: 'codex.report.summary',
  version: 1,
  kind: 'page-summary',
  baseName: `${summaryType}-home`,
  title,
  page,
  viewport: 'Chrome',
  summary,
  metadata: {
    spec: `fixture.${summaryType}`,
    summaryType,
  },
});

test('maps remediation-plan summary types to database suites', () => {
  assert.equal(SUMMARY_TYPE_TO_SUITE.wcag, 'accessibility');
  assert.equal(SUMMARY_TYPE_TO_SUITE['internal-links'], 'functionality');
  assert.equal(SUMMARY_TYPE_TO_SUITE['responsive-consistency'], 'responsive');
  assert.equal(SUMMARY_TYPE_TO_SUITE.visual, 'visual');
});

test('normalizes pass, warn, and fail statuses from summary payloads', () => {
  assert.equal(
    deriveSummaryStatus(
      pageSummary({
        summaryType: 'internal-links',
        summary: { gating: [], warnings: [], advisories: [] },
      })
    ),
    'pass'
  );
  assert.equal(
    deriveSummaryStatus(
      pageSummary({
        summaryType: 'performance',
        summary: { gating: [], warnings: ['Largest contentful paint is slow'], advisories: [] },
      })
    ),
    'warn'
  );
  assert.equal(
    deriveSummaryStatus(
      pageSummary({
        summaryType: 'wcag',
        summary: { gating: ['Button is missing an accessible name'], warnings: [], advisories: [] },
      })
    ),
    'fail'
  );
});

test('builds DB-ready records without inventing run_suites scores', () => {
  const linkSummary = pageSummary({
    summaryType: 'internal-links',
    summary: { gating: [], warnings: [], advisories: ['Checked capped sample only'] },
  });
  const runData = baseRunData({
    totalTests: 3,
    tests: [
      {
        testId: 'test-1',
        anchorId: 'test-1',
        title: 'Validate internal links 1/1: /',
        titlePath: [
          '',
          'Chrome',
          'functionality.links.internal.spec.js',
          'Functionality: Internal Links',
        ],
        projectName: 'Chrome',
        status: 'passed',
        location: { file: '/repo/tests/functionality.links.internal.spec.js' },
        schemaSummaries: [linkSummary],
      },
    ],
    schemaSummaries: [
      {
        testAnchorId: 'links',
        projectName: 'Chrome',
        summaries: [
          linkSummary,
          pageSummary({
            summaryType: 'wcag',
            summary: {
              gating: [{ id: 'color-contrast', message: 'Insufficient contrast' }],
              warnings: [],
              advisories: [],
            },
          }),
        ],
      },
    ],
  });

  const normalized = normalizeRunArtifact({
    runData,
    artifactDir: 'run-20260401-100000',
    artifactPath: '/tmp/reports/run-20260401-100000/data/run.json',
    siteId: 'site-id',
  });

  assert.equal(normalized.records.runs[0].status, 'fail');
  assert.equal(normalized.records.runs[0].site_id, 'site-id');
  assert.equal(normalized.records.runs[0].source_kind, 'local-report');
  assert.equal(normalized.records.runs[0].source_artifact_id, normalized.import_id);
  assert.equal(normalized.records.runs[0].source_run_id, 'run-duplicate-ish');
  assert.equal(normalized.records.runs[0].source_payload_hash, normalized.payload_hash);
  assert.equal(normalized.records.runs[0].total_tests, 3);
  assert.equal(normalized.records.runs[0].total_tests_planned, null);
  assert.equal(normalized.records.runs[0].report_relative_path, 'run-20260401-100000/report.html');
  assert.deepEqual(normalized.records.runs[0].suites_run.sort(), [
    'accessibility',
    'functionality',
  ]);
  assert.ok(normalized.payload_hash);

  const functionality = normalized.records.run_suites.find(
    (suite) => suite.suite === 'functionality'
  );
  const accessibility = normalized.records.run_suites.find(
    (suite) => suite.suite === 'accessibility'
  );
  assert.equal(functionality.status, 'warn');
  assert.equal(accessibility.status, 'fail');
  assert.equal(functionality.score, null);
  assert.equal(accessibility.score, null);
  assert.deepEqual(functionality.summary_types, ['internal-links']);
  assert.equal(functionality.summary.summaries.length, 1);

  assert.equal(normalized.records.findings.length, 2);
  assert.equal(normalized.records.findings[0].severity, 'warning');
  assert.equal(normalized.records.findings[0].summary_type, 'internal-links');
  assert.equal(normalized.records.findings[0].page, '/');
  assert.equal(normalized.records.findings[0].viewport, 'Chrome');
  assert.ok(normalized.records.findings[0].source_key);
  assert.equal(
    normalized.records.findings[0].details.summary.advisories[0],
    'Checked capped sample only'
  );
  assert.deepEqual(normalized.records.findings[1].details.summary.gating[0], {
    id: 'color-contrast',
    message: 'Insufficient contrast',
  });
});

test('uses artifact folder plus payload hash instead of runData.runId alone', () => {
  const runData = baseRunData({
    schemaSummaries: [
      {
        testAnchorId: 'responsive',
        projectName: 'Mobile',
        summaries: [
          pageSummary({
            summaryType: 'responsive-consistency',
            summary: { gating: [], warnings: [], advisories: [] },
          }),
        ],
      },
    ],
  });

  const first = normalizeRunArtifact({
    runData,
    artifactDir: 'run-20260401-100000',
    artifactPath: '/tmp/reports/run-20260401-100000/data/run.json',
  });
  const same = normalizeRunArtifact({
    runData,
    artifactDir: 'run-20260401-100000',
    artifactPath: '/tmp/reports/run-20260401-100000/data/run.json',
  });
  const second = normalizeRunArtifact({
    runData,
    artifactDir: 'run-20260401-100000-2',
    artifactPath: '/tmp/reports/run-20260401-100000-2/data/run.json',
  });

  assert.equal(first.artifact.source_run_id, 'run-duplicate-ish');
  assert.equal(first.records.runs[0].id, same.records.runs[0].id);
  assert.notEqual(first.records.runs[0].id, second.records.runs[0].id);
});

test('uses failed, timed-out, and interrupted status counts for run status', () => {
  const normalized = normalizeRunArtifact({
    runData: baseRunData({
      statusCounts: {
        passed: 0,
        failed: 0,
        skipped: 0,
        timedOut: 1,
        interrupted: 0,
      },
    }),
    artifactDir: 'run-20260401-110000',
    artifactPath: '/tmp/reports/run-20260401-110000/data/run.json',
  });

  assert.equal(normalized.records.runs[0].status, 'fail');
});
