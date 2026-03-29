'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { refreshSiteConfig } = require('../../utils/discovery-service');

const tempDirs = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const createTempSiteFile = (payload) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scry-discovery-'));
  tempDirs.push(tempDir);
  const sitePath = path.join(tempDir, 'example-live.json');
  fs.writeFileSync(sitePath, `${JSON.stringify(payload, null, 2)}\n`);
  return sitePath;
};

const createLogger = () => {
  const messages = [];
  return {
    logger: {
      log: (message) => {
        messages.push(message);
      },
    },
    messages,
  };
};

test('refreshSiteConfig seeds default sitemap discovery and canonical host updates', async () => {
  const sitePath = createTempSiteFile({
    name: 'Example Live',
    baseUrl: 'https://www.example.com',
    testPages: ['/legacy/'],
  });
  const discovered = ['/about/', '/contact/'];
  discovered.meta = {
    hostAdjusted: true,
    resolvedBaseUrl: 'https://example.com',
    resolvedHost: 'example.com',
  };
  const { logger } = createLogger();

  await refreshSiteConfig(sitePath, {
    discoverPages: async () => discovered,
    logger,
  });

  const saved = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  assert.strictEqual(saved.baseUrl, 'https://example.com');
  assert.deepStrictEqual(saved.testPages, ['/', '/about/', '/contact/']);
  assert.deepStrictEqual(saved.discover, {
    strategy: 'sitemap',
    sitemapUrl: 'https://example.com/sitemap.xml',
  });
});

test('refreshSiteConfig preserves existing pages when discovery is empty', async () => {
  const sitePath = createTempSiteFile({
    name: 'Example Live',
    baseUrl: 'https://example.com',
    testPages: ['/', '/existing/'],
  });
  const discovered = [];
  discovered.meta = {};
  const { logger } = createLogger();

  const result = await refreshSiteConfig(sitePath, {
    discoverPages: async () => discovered,
    logger,
  });

  const saved = JSON.parse(fs.readFileSync(sitePath, 'utf8'));
  assert.deepStrictEqual(saved.testPages, ['/', '/existing/']);
  assert.deepStrictEqual(saved.discover, {
    strategy: 'sitemap',
    sitemapUrl: 'https://example.com/sitemap.xml',
  });
  assert.strictEqual(result.changes.pagesUpdated, false);
  assert.strictEqual(result.discoveredCount, 0);
});
