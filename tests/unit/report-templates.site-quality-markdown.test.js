const test = require('node:test');
const assert = require('node:assert/strict');

const { renderSchemaSummariesMarkdown } = require('../../utils/report-templates');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../../utils/report-schema');

test('renderSchemaSummariesMarkdown renders internal link markdown after site-quality extraction', () => {
  const runPayload = createRunSummaryPayload({
    baseName: 'internal-links-chrome',
    title: 'Internal link audit summary',
    overview: {
      pagesChecked: 1,
      brokenLinks: 1,
    },
    metadata: {
      summaryType: 'internal-links',
      projectName: 'Chrome',
      scope: 'project',
    },
  });

  const pagePayload = createPageSummaryPayload({
    baseName: 'internal-links-chrome',
    title: 'Internal links for /pricing',
    page: '/pricing',
    viewport: 'desktop',
    summary: {
      totalLinks: 12,
      uniqueChecked: 10,
      brokenCount: 1,
      brokenSample: [
        {
          url: 'https://example.com/missing',
          status: 404,
          methodTried: 'GET',
        },
      ],
    },
    metadata: {
      summaryType: 'internal-links',
      projectName: 'Chrome',
      page: '/pricing',
    },
  });

  const { markdown } = renderSchemaSummariesMarkdown([
    {
      testAnchorId: 'internal-links-summary',
      projectName: 'Chrome',
      summaries: [runPayload, pagePayload],
    },
  ]);

  assert.match(markdown, /Internal link audit summary – Chrome/);
  assert.match(markdown, /`\/pricing` \| 12 \| 10 \| 1/);
  assert.match(markdown, /https:\/\/example.com\/missing/);
  assert.match(markdown, /\| `\/pricing` \| https:\/\/example.com\/missing \| 404 \| GET \|/);
});
