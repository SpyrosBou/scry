const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAvailabilitySchemaPayloads,
  buildHttpSchemaPayloads,
  buildInteractiveSchemaPayloads,
  buildLinksSchemaPayloads,
  buildPerformanceSchemaPayloads,
  buildVisualSchemaPayloads,
  resolveLinkCheckConfig,
} = require('../../utils/report-payloads/site-quality');

test('resolveLinkCheckConfig normalizes site link-check settings', () => {
  assert.deepEqual(
    resolveLinkCheckConfig({
      linkCheck: {
        maxPerPage: '3.8',
        timeoutMs: '2500',
        followRedirects: false,
        methodFallback: false,
      },
    }),
    {
      maxPerPage: 3,
      timeoutMs: 2500,
      followRedirects: false,
      methodFallback: false,
    }
  );
});

test('buildLinksSchemaPayloads preserves internal-links summary and page detail shape', () => {
  const payloads = buildLinksSchemaPayloads(
    [
      {
        page: '/',
        status: 200,
        totalLinks: 3,
        uniqueChecked: 2,
        checkedUrls: ['https://example.test/a', 'https://example.test/b'],
        broken: [{ url: 'https://example.test/b', status: 404, method: 'GET' }],
      },
    ],
    [{ url: 'https://example.test/b', status: 404, method: 'GET' }],
    'Chromium',
    { maxPerPage: 2, timeoutMs: 1000, followRedirects: true, methodFallback: true }
  );

  assert.equal(payloads.runPayload.metadata.summaryType, 'internal-links');
  assert.deepEqual(Object.keys(payloads.runPayload.details.pages[0]), [
    'page',
    'status',
    'totalLinks',
    'uniqueChecked',
    'brokenCount',
    'gating',
    'warnings',
    'advisories',
    'notes',
  ]);
  assert.equal(payloads.runPayload.overview.uniqueLinksChecked, 2);
  assert.deepEqual(payloads.pagePayloads[0].summary.brokenSample, [
    {
      url: 'https://example.test/b',
      status: 404,
      methodTried: 'GET',
      error: null,
    },
  ]);
});

test('buildInteractiveSchemaPayloads preserves interactive counters and samples', () => {
  const payloads = buildInteractiveSchemaPayloads({
    projectName: 'Chromium',
    resourceBudget: 0,
    pages: [
      {
        page: '/',
        status: 200,
        consoleErrors: [{ message: 'Boom', url: 'https://example.test/' }],
        resourceErrors: [{ type: 'response', status: 404, method: 'GET', url: '/missing' }],
        notes: [{ type: 'warning', message: 'Interaction skipped' }],
      },
    ],
  });

  assert.equal(payloads.runPayload.metadata.summaryType, 'interactive');
  assert.equal(payloads.runPayload.overview.totalConsoleErrors, 1);
  assert.equal(payloads.runPayload.overview.totalResourceErrors, 1);
  assert.deepEqual(Object.keys(payloads.runPayload.details.pages[0]), [
    'page',
    'status',
    'gating',
    'warnings',
    'advisories',
    'notes',
    'consoleErrors',
    'resourceErrors',
  ]);
  assert.deepEqual(payloads.pagePayloads[0].summary.resourceSample, [
    { type: 'response', status: 404, method: 'GET', url: '/missing', failure: null },
  ]);
});

test('infrastructure payload builders preserve summary types and details pages', () => {
  const availability = buildAvailabilitySchemaPayloads(
    [
      {
        page: '/',
        status: 200,
        elements: { header: true, navigation: false },
        notes: [{ type: 'warning', message: 'navigation missing' }],
      },
    ],
    'Chromium'
  );
  const http = buildHttpSchemaPayloads(
    [
      {
        page: '/',
        status: 500,
        statusText: 'Server Error',
        checks: [{ label: 'Content-Type includes text/html', passed: false }],
      },
    ],
    'Chromium'
  );
  const performance = buildPerformanceSchemaPayloads(
    [{ page: '/', status: 200, loadTime: 1500 }],
    [{ page: '/', metric: 'loadComplete', value: 1500, budget: 1000 }],
    'Chromium'
  );

  assert.equal(availability.runPayload.metadata.summaryType, 'availability');
  assert.deepEqual(Object.keys(availability.runPayload.details.pages[0]), [
    'page',
    'status',
    'elements',
    'gating',
    'warnings',
    'advisories',
    'notes',
  ]);
  assert.equal(http.runPayload.metadata.summaryType, 'http');
  assert.deepEqual(Object.keys(http.runPayload.details.pages[0]), [
    'page',
    'status',
    'statusText',
    'redirectLocation',
    'failedChecks',
    'gating',
    'warnings',
    'advisories',
    'notes',
  ]);
  assert.equal(performance.runPayload.metadata.summaryType, 'performance');
  assert.deepEqual(Object.keys(performance.runPayload.details.pages[0]), [
    'page',
    'gating',
    'warnings',
    'advisories',
    'notes',
    'budgetBreaches',
    'metrics',
  ]);
});

test('buildVisualSchemaPayloads preserves visual summary shape and page sample details', () => {
  const payloads = buildVisualSchemaPayloads({
    projectName: 'Chromium',
    viewportName: 'desktop',
    summaries: [
      {
        page: '/',
        status: 200,
        result: 'diff',
        threshold: 0.05,
        diffMetrics: { pixelDiff: 1200, pixelRatio: 0.07 },
        artifacts: { diff: { name: 'diff.png' } },
        screenshot: 'home.png',
      },
    ],
  });

  assert.equal(payloads.runPayload.metadata.summaryType, 'visual');
  assert.deepEqual(Object.keys(payloads.runPayload.details.pages[0]), [
    'page',
    'status',
    'viewport',
    'result',
    'gating',
    'warnings',
    'advisories',
    'notes',
    'deltaPercent',
    'thresholdPercent',
    'pixelDiff',
    'artifacts',
  ]);
  assert.equal(payloads.runPayload.overview.diffs, 1);
  assert.equal(payloads.pagePayloads[0].summary.screenshot, 'home.png');
  assert.deepEqual(payloads.pagePayloads[0].summary.artifacts, {
    baseline: null,
    actual: null,
    diff: 'diff.png',
  });
});
