const test = require('node:test');
const assert = require('node:assert/strict');

const { renderSchemaSummariesMarkdown, __test__ } = require('../../utils/report-templates');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../../utils/report-schema');

test('renderSchemaSummariesMarkdown renders responsive consistency comparisons', () => {
  const runPayload = createRunSummaryPayload({
    baseName: 'responsive-consistency-chrome',
    title: 'Cross-viewport consistency summary',
    overview: {
      totalComparisons: 1,
      comparisonsWithGatingIssues: 1,
      maximumHeadingDifference: 2,
    },
    metadata: {
      summaryType: 'responsive-consistency',
      projectName: 'Chrome',
      page: '/pricing',
      scope: 'project',
    },
  });
  runPayload.details = {
    page: '/pricing',
    comparisons: [
      {
        baselineViewport: 'desktop',
        compareViewport: 'mobile',
        headingDiff: 2,
        baseline: { hasNav: true, hasMain: true, hasFooter: true },
        compare: { hasNav: false, hasMain: true, hasFooter: true },
        gating: ['Navigation presence differs between desktop and mobile'],
        warnings: [],
        advisories: [],
        notes: [],
      },
    ],
  };

  const pagePayload = createPageSummaryPayload({
    baseName: 'responsive-consistency-chrome',
    title: 'Cross-viewport consistency – desktop vs mobile',
    page: '/pricing',
    viewport: 'desktop vs mobile',
    summary: {
      baselineViewport: 'desktop',
      compareViewport: 'mobile',
      headingDiff: 2,
      baseline: { hasNav: true, hasMain: true, hasFooter: true },
      compare: { hasNav: false, hasMain: true, hasFooter: true },
      gating: ['Navigation presence differs between desktop and mobile'],
      warnings: [],
      advisories: [],
      notes: [],
    },
    metadata: {
      summaryType: 'responsive-consistency',
      projectName: 'Chrome',
      page: '/pricing',
    },
  });

  const { markdown } = renderSchemaSummariesMarkdown([
    {
      testAnchorId: 'responsive-consistency-summary',
      projectName: 'Chrome',
      summaries: [runPayload, pagePayload],
    },
  ]);

  assert.match(markdown, /Cross-viewport consistency summary – Chrome/);
  assert.match(markdown, /`\/pricing` \| desktop vs mobile \| 2/);
  assert.match(markdown, /Navigation presence differs between desktop and mobile/);
});

test('responsive consistency page card surfaces mismatch details', () => {
  const html = __test__.renderResponsiveConsistencyPageCard({
    page: '/pricing',
    baselineViewport: 'desktop',
    compareViewport: 'mobile',
    headingDiff: 2,
    baseline: { hasNav: true, hasMain: true, hasFooter: true },
    compare: { hasNav: false, hasMain: true, hasFooter: true },
    gating: ['Navigation presence differs between desktop and mobile'],
    warnings: [],
    advisories: [],
    notes: ['Heading count difference between desktop and mobile: 2'],
  });

  assert.match(html, /Blocking consistency issues/);
  assert.match(html, /Navigation presence differs between desktop and mobile/);
  assert.match(html, /Mismatch/);
});

test('responsive structure page card surfaces layout metrics after extraction', () => {
  const html = __test__.renderResponsiveStructurePageCard({
    page: '/pricing',
    viewport: 'desktop',
    loadTimeMs: 1234,
    thresholdMs: 2000,
    headerPresent: true,
    navigationPresent: false,
    contentPresent: true,
    footerPresent: true,
    gating: ['Navigation landmark missing'],
    warnings: ['Heading count looks low'],
    advisories: [],
    notes: ['Resolved header and footer correctly'],
    info: ['Primary nav hidden behind toggle'],
  });

  assert.match(html, /Navigation landmark missing/);
  assert.match(html, /Heading count looks low/);
  assert.match(html, /Primary nav hidden behind toggle/);
  assert.match(html, /desktop/);
});
