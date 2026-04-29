const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyAvailabilityResult,
  classifyHttpResult,
  classifyInteractivePage,
  classifyLinkPage,
  classifyPerformanceResult,
  classifyVisualSummary,
  parseDiffMetrics,
} = require('../../utils/report-classification/site-quality');

test('classifyLinkPage preserves broken link gating and cap notes', () => {
  const page = classifyLinkPage(
    {
      page: '/about',
      status: 200,
      totalLinks: 8,
      uniqueChecked: 2,
      broken: [
        { url: 'https://example.test/missing', status: 404, method: 'GET' },
        { url: 'https://example.test/error', error: 'timeout' },
      ],
    },
    { maxPerPage: 2 }
  );

  assert.deepEqual(page.gating, [
    'Received 404 for https://example.test/missing (via GET)',
    'Request HEAD failed for https://example.test/error (timeout)',
  ]);
  assert.deepEqual(page.notes, ['Checked 2 of 8 links (cap maxPerPage=2).']);
  assert.equal(page.brokenCount, 2);
});

test('classifyInteractivePage splits typed notes and resource errors', () => {
  const page = classifyInteractivePage({
    page: '/',
    status: 200,
    consoleErrors: [{ message: 'Boom', url: 'https://example.test/' }],
    resourceErrors: [
      { type: 'response', status: 500, url: 'https://example.test/api' },
      { type: 'requestfailed', failure: 'net::ERR_FAILED', url: 'https://example.test/app.js' },
    ],
    notes: [
      { type: 'warning', message: 'Interaction skipped' },
      { type: 'info', message: 'Interaction cycle executed' },
    ],
  });

  assert.deepEqual(page.gating, [
    'Console error: Boom',
    'Resource response 500 on https://example.test/api',
    'Resource requestfailed failed (net::ERR_FAILED) on https://example.test/app.js',
  ]);
  assert.deepEqual(page.warnings, ['Interaction skipped']);
  assert.deepEqual(page.notes, ['Interaction cycle executed']);
});

test('classifyAvailabilityResult treats 500s and missing landmarks as gating issues', () => {
  const page = classifyAvailabilityResult({
    page: '/',
    status: 500,
    elements: {
      header: true,
      navigation: false,
      content: false,
    },
    notes: [{ type: 'warning', message: 'Client error 500' }],
  });

  assert.deepEqual(page.gating, [
    'Server responded with 500; page unavailable.',
    'navigation landmark missing',
    'content landmark missing',
  ]);
  assert.deepEqual(page.missingStructural, [
    'navigation landmark missing',
    'content landmark missing',
  ]);
  assert.deepEqual(page.warnings, ['Client error 500']);
});

test('classifyHttpResult separates client warnings from failed-check blockers', () => {
  const page = classifyHttpResult({
    page: '/redirect',
    status: 302,
    statusText: 'Found',
    location: '/new',
    checks: [
      { label: 'HTTP status is acceptable (200/301/302)', passed: true },
      { label: 'html[lang] attribute present', passed: false, details: 'missing' },
    ],
  });

  assert.deepEqual(page.gating, ['Failed check: html[lang] attribute present']);
  assert.deepEqual(page.warnings, []);
  assert.deepEqual(page.notes, ['Redirects to /new']);
  assert.deepEqual(page.failedChecks, [
    { label: 'html[lang] attribute present', details: 'missing' },
  ]);
});

test('classifyPerformanceResult rounds metrics and formats budget breaches', () => {
  const page = classifyPerformanceResult(
    {
      page: '/',
      status: 200,
      loadTime: 1234.4,
      domContentLoaded: 112.8,
      loadComplete: 1300.2,
      firstContentfulPaint: 200.9,
      firstPaint: Number.NaN,
    },
    [{ metric: 'loadComplete', value: 1300.2, budget: 1000 }]
  );

  assert.deepEqual(page.gating, ['loadComplete exceeded budget (1300ms > 1000ms)']);
  assert.deepEqual(page.notes, ['Observed load time: 1234ms']);
  assert.deepEqual(page.metrics, {
    loadTimeMs: 1234,
    domContentLoadedMs: 113,
    loadCompleteMs: 1300,
    firstContentfulPaintMs: 201,
    firstPaintMs: null,
  });
});

test('parseDiffMetrics reads Playwright pixel and dimension output', () => {
  const metrics = parseDiffMetrics(
    '1,234 pixels (ratio 0.0123 of all image pixels) are different. Expected an image 375px by 667px, received 390px by 667px.'
  );

  assert.deepEqual(metrics, {
    pixelDiff: 1234,
    pixelRatio: 0.0123,
    expectedSize: { width: 375, height: 667 },
    actualSize: { width: 390, height: 667 },
  });
});

test('classifyVisualSummary derives delta, threshold, notes, and artifact refs', () => {
  const page = classifyVisualSummary({
    page: '/',
    status: 200,
    result: 'diff',
    threshold: 0.05,
    diffMetrics: { pixelDiff: 1250, pixelRatio: 0.0725 },
    artifacts: {
      baseline: { name: 'baseline.png' },
      actual: { name: 'actual.png' },
    },
  });

  assert.equal(page.deltaPercent, 7.25);
  assert.equal(page.thresholdPercent, 5);
  assert.deepEqual(page.gating, ['Visual delta 7.25% exceeds 5% threshold.']);
  assert.deepEqual(page.artifactRefs, {
    baseline: 'baseline.png',
    actual: 'actual.png',
    diff: null,
  });
});
