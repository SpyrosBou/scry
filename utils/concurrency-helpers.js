'use strict';

const os = require('os');
const { setupTestPage, teardownTestPage } = require('./test-helpers');

const DEFAULT_LIMIT = Math.max(1, Math.min(os.cpus().length || 1, 6));

const normaliseLimit = (value, fallback = DEFAULT_LIMIT) => {
  if (value === undefined || value === null) return fallback;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.max(1, Math.floor(numeric));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.max(1, Math.floor(parsed));
      }
    }
  }
  return fallback;
};

const resolveConcurrencyLimit = (...candidates) => {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const limit = normaliseLimit(candidate);
    if (limit) return limit;
  }
  return DEFAULT_LIMIT;
};

const mapWithConcurrency = async (items, worker, { concurrency } = {}) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (typeof worker !== 'function') {
    throw new Error('mapWithConcurrency requires a worker function.');
  }

  const limit = normaliseLimit(concurrency);
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};

const runPageTasks = async (
  browser,
  pages,
  worker,
  { concurrency, testInfo, logLabel = 'Page task' } = {}
) => {
  if (!browser) {
    throw new Error('runPageTasks requires a browser instance');
  }
  if (typeof worker !== 'function') {
    throw new Error('runPageTasks requires a worker function');
  }

  return mapWithConcurrency(
    pages,
    async (pagePath, index) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errorContext = await setupTestPage(page, context, testInfo);
      try {
        if (logLabel) {
          console.log(`${logLabel}: ${pagePath}`);
        }
        return await worker({ pagePath, page, context, index, errorContext });
      } finally {
        await teardownTestPage(page, context, errorContext, testInfo).catch(() => {});
        await context.close().catch(() => {});
      }
    },
    { concurrency }
  );
};

module.exports = {
  mapWithConcurrency,
  resolveConcurrencyLimit,
  runPageTasks,
};
