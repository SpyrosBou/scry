'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { waitForReports } = require('../../utils/a11y-aggregation-waiter');

const createMockStore = (reportBuckets) => ({
  readProjectReports: (projectName) => {
    const reports = reportBuckets.get(projectName);
    return reports ? [...reports] : [];
  },
});

test('waitForReports resolves once expected reports arrive before timeout', async () => {
  const reports = new Map([['Chrome', []]]);
  const store = createMockStore(reports);

  setTimeout(() => {
    reports.get('Chrome').push({ page: '/example' });
  }, 25);

  const result = await waitForReports({
    store,
    projectName: 'Chrome',
    expectedCount: 1,
    timeoutMs: 200,
    pollIntervalMs: 5,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].page, '/example');
});

test('waitForReports returns latest snapshot when timeout elapses', async () => {
  const reports = new Map([['Chrome', []]]);
  const store = createMockStore(reports);

  const result = await waitForReports({
    store,
    projectName: 'Chrome',
    expectedCount: 2,
    timeoutMs: 50,
    pollIntervalMs: 5,
  });

  assert.equal(result.length, 0);
});

test('waitForReports throws when store is missing', async () => {
  await assert.rejects(
    () =>
      waitForReports({
        store: null,
        projectName: 'Chrome',
        expectedCount: 1,
      }),
    /store\.readProjectReports is required/
  );
});
