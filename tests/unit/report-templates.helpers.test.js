const test = require('node:test');
const assert = require('node:assert/strict');

const {
  __test__: {
    renderIssueSectionPair,
    renderAvailabilityPageCard,
    renderResponsiveStructurePageCard,
    renderVisualPageCard,
  },
} = require('../../utils/report-templates');
const { renderStatusSummaryList } = require('../../utils/report-template-helpers');

test('renderIssueSectionPair renders gating and advisory sections', () => {
  const html = renderIssueSectionPair({
    gatingIssues: [
      {
        message: 'Critical issue',
        impact: 'critical',
        pageCount: 1,
        pages: ['Home'],
        instanceCount: 2,
      },
    ],
    advisoryIssues: [
      {
        message: 'Minor advisory',
        impact: 'moderate',
        pageCount: 1,
        pages: ['About'],
        instanceCount: 1,
      },
    ],
    gatingTitle: 'Blocking issues',
    advisoryTitle: 'Advisories',
    viewportLabel: 'Chrome',
  });

  assert.match(html, /Blocking issues/);
  assert.match(html, /Critical issue/);
  assert.match(html, /Advisories/);
  assert.match(html, /Minor advisory/);
  assert.match(html, /Chrome/);
});

test('renderAvailabilityPageCard highlights blocking and advisory issues', () => {
  const summary = {
    page: '/',
    status: 200,
    viewport: 'Chrome',
    gating: ['content landmark missing'],
    warnings: ['content missing'],
    advisories: [],
    notes: ['Title present'],
    headerPresent: true,
    navigationPresent: false,
    contentPresent: false,
    footerPresent: true,
  };

  const html = renderAvailabilityPageCard(summary, { projectLabel: 'Chrome' });

  assert.match(html, /Blocking issues/);
  assert.match(html, /content landmark missing/);
  assert.match(html, /content missing/);
  assert.match(html, /Status:<\/strong>\s*200/);
  assert.match(html, /Title present/);
});

test('renderResponsiveStructurePageCard displays metrics and warnings', () => {
  const summary = {
    page: '/contact',
    viewport: 'Chrome',
    loadTimeMs: 3200,
    thresholdMs: 2000,
    headerPresent: true,
    navigationPresent: false,
    contentPresent: true,
    footerPresent: true,
    warnings: ['Load time 3200ms exceeds threshold 2000ms'],
    gating: ['Navigation landmark missing'],
    advisories: ['Missing secondary nav'],
    notes: ['Review navigation structure'],
  };

  const html = renderResponsiveStructurePageCard(summary, { viewportLabel: 'Chrome' });

  assert.match(html, /Blocking issues/);
  assert.match(html, /Load time/);
  assert.match(html, /3,?200 ms/);
  assert.match(html, /Threshold/);
  assert.match(html, /Navigation landmark missing/);
  assert.match(html, /Missing secondary nav/);
  assert.match(html, /Review navigation structure/);
});

test('renderVisualPageCard summarizes diff results and artifacts', () => {
  const summary = {
    page: '/home',
    viewport: 'Desktop',
    result: 'diff',
    threshold: 0.05,
    thresholdPercent: 0.05,
    pixelDiff: 1500,
    pixelRatio: 0.12,
    deltaPercent: 0.12,
    artifacts: {
      baseline: 'baseline.png',
      actual: 'actual.png',
      diff: 'diff.png',
    },
    warnings: ['Minor padding change'],
    gating: [],
    advisories: [],
    notes: ['Verify hero image spacing'],
  };

  const html = renderVisualPageCard(summary, { viewportLabel: 'Desktop', thresholdsUsed: [0.05] });

  assert.match(html, /Diff detected/);
  assert.match(html, /Pixel diff/);
  assert.match(html, /1,?500/);
  assert.match(html, /baseline\.png/);
  assert.match(html, /Minor padding change/);
  assert.match(html, /Verify hero image spacing/);
});

test('renderStatusSummaryList keeps zero counts but omits empty values', () => {
  const html = renderStatusSummaryList(
    [
      { label: 'Blockers', count: 0, tone: 'status-error' },
      { label: 'Warnings', count: 3, tone: 'status-warn' },
      { label: 'Missing', count: null },
    ],
    { className: 'custom-summary' }
  );

  assert.match(html, /custom-summary/);
  assert.match(html, /Blockers/);
  assert.match(html, />0<\/span>/);
  assert.match(html, /Warnings/);
  assert.match(html, />3<\/span>/);
  assert.doesNotMatch(html, /Missing/);
});
