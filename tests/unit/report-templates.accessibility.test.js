const test = require('node:test');
const assert = require('node:assert/strict');

const { renderSchemaSummariesMarkdown } = require('../../utils/report-templates');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../../utils/report-schema');

test('renderSchemaSummariesMarkdown renders wcag summaries after accessibility extraction', () => {
  const runPayload = createRunSummaryPayload({
    baseName: 'wcag-chrome',
    title: 'WCAG findings summary',
    overview: {
      pagesScanned: 1,
      gatingViolations: 1,
    },
    metadata: {
      summaryType: 'wcag',
      projectName: 'Chrome',
      scope: 'project',
    },
  });

  const pagePayload = createPageSummaryPayload({
    baseName: 'wcag-chrome',
    title: 'WCAG findings for /pricing',
    page: '/pricing',
    viewport: 'desktop',
    summary: {
      status: 'failed',
      gatingViolations: 1,
      advisoryFindings: 2,
      bestPracticeFindings: 1,
      httpStatus: 200,
      notes: ['Heading order needs review'],
    },
    metadata: {
      summaryType: 'wcag',
      projectName: 'Chrome',
      page: '/pricing',
    },
  });

  const { markdown } = renderSchemaSummariesMarkdown([
    {
      testAnchorId: 'wcag-summary',
      projectName: 'Chrome',
      summaries: [runPayload, pagePayload],
    },
  ]);

  assert.match(markdown, /WCAG findings summary – Chrome/);
  assert.match(markdown, /### \/pricing/);
  assert.match(markdown, /- Gating: 1/);
  assert.match(markdown, /Heading order needs review/);
});
