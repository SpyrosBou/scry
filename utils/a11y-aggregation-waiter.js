'use strict';

const DEFAULT_AGGREGATION_TIMEOUT_MS = 30000;
const DEFAULT_AGGREGATION_POLL_INTERVAL_MS = 250;

const validateInputs = ({ store, projectName, expectedCount }) => {
  if (!store || typeof store.readProjectReports !== 'function') {
    throw new Error('store.readProjectReports is required');
  }
  if (!projectName) {
    throw new Error('projectName is required');
  }
  if (typeof expectedCount !== 'number' || expectedCount < 0) {
    throw new Error('expectedCount must be a non-negative number');
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForReports = async ({
  store,
  projectName,
  expectedCount,
  timeoutMs = DEFAULT_AGGREGATION_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_AGGREGATION_POLL_INTERVAL_MS,
}) => {
  validateInputs({ store, projectName, expectedCount });
  const deadline = Date.now() + Math.max(timeoutMs, 0);
  while (Date.now() < deadline) {
    const reports = store.readProjectReports(projectName) || [];
    if (reports.length >= expectedCount) {
      return reports;
    }
    await wait(pollIntervalMs);
  }
  return store.readProjectReports(projectName) || [];
};

module.exports = {
  waitForReports,
  DEFAULT_AGGREGATION_TIMEOUT_MS,
  DEFAULT_AGGREGATION_POLL_INTERVAL_MS,
};
