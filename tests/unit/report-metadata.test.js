const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveReportMetadata, applyViewportMetadata } = require('../../utils/report-metadata');

test('resolveReportMetadata separates site and project labels', () => {
  const metadata = resolveReportMetadata(
    { name: 'archival-fixture' },
    { project: { name: 'Mobile Safari' } }
  );

  assert.deepEqual(metadata, {
    siteLabel: 'archival-fixture',
    viewportLabel: 'Mobile Safari',
  });
});

test('applyViewportMetadata stamps viewport as projectName and preserves siteName', () => {
  const reports = [{ page: '/' }, { page: '/contact', projectName: 'Existing Project' }];

  applyViewportMetadata(reports, {
    viewportLabel: 'Desktop Chrome',
    siteLabel: 'archival-fixture',
  });

  assert.deepEqual(reports[0], {
    page: '/',
    browser: 'Desktop Chrome',
    viewport: 'Desktop Chrome',
    viewports: ['Desktop Chrome'],
    projectName: 'Desktop Chrome',
    siteName: 'archival-fixture',
  });

  assert.deepEqual(reports[1], {
    page: '/contact',
    projectName: 'Existing Project',
    browser: 'Desktop Chrome',
    viewport: 'Desktop Chrome',
    viewports: ['Desktop Chrome'],
    siteName: 'archival-fixture',
  });
});

test('applyViewportMetadata rejects legacy positional arguments', () => {
  assert.throws(
    () => {
      applyViewportMetadata([{ page: '/' }], 'Desktop Chrome');
    },
    /options object/
  );
});
