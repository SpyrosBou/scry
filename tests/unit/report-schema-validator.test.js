'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { createPageSummaryPayload } = require('../../utils/report-schema');
const { assertReportSummaryPayload } = require('../../utils/report-schema-validator');
const { attachSchemaSummary } = require('../../utils/reporting-utils');

const makeVisualPagePayload = (overrides = {}) => {
  const summary = Object.assign(
    {
      gating: [],
      warnings: [],
      advisories: [],
      notes: [],
      deltaPercent: null,
    },
    overrides.summary || {}
  );

  return createPageSummaryPayload({
    baseName: 'visual-home-desktop',
    title: 'Visual regression – /home (desktop)',
    page: '/home',
    viewport: 'desktop',
    summary,
    metadata: Object.assign(
      {
        spec: 'visual.regression.snapshots',
        summaryType: 'visual',
      },
      overrides.metadata || {}
    ),
  });
};

test('assertReportSummaryPayload accepts standard finding arrays for normalised specs', () => {
  const payload = makeVisualPagePayload();
  assert.doesNotThrow(() => {
    assertReportSummaryPayload(payload);
  });
});

test('assertReportSummaryPayload rejects missing finding arrays for normalised specs', () => {
  const payload = makeVisualPagePayload({ summary: { gating: undefined } });
  assert.throws(
    () => {
      assertReportSummaryPayload(payload);
    },
    /summary\.gating must be an array/
  );
});

test('assertReportSummaryPayload does not require finding arrays for legacy wcag payloads', () => {
  const wcagPayload = createPageSummaryPayload({
    baseName: 'wcag-home',
    title: 'WCAG scan — /home',
    page: '/home',
    viewport: 'desktop',
    summary: {
      gatingViolations: [],
      advisoriesList: [],
      bestPracticesList: [],
      notes: [],
    },
    metadata: {
      spec: 'a11y.audit.wcag',
      summaryType: 'wcag',
    },
  });

  assert.doesNotThrow(() => {
    assertReportSummaryPayload(wcagPayload);
  });
});

test('attachSchemaSummary propagates validator failures', async () => {
  const invalidPayload = makeVisualPagePayload({ summary: { warnings: undefined } });
  const mockTestInfo = {
    attach: async () => {
      throw new Error('attach should not be called with invalid payload');
    },
  };

  await assert.rejects(
    attachSchemaSummary(mockTestInfo, invalidPayload),
    /summary\.warnings must be an array/
  );
});
