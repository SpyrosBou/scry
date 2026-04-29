'use strict';

const fs = require('fs');
const path = require('path');

const RUN_MANIFEST_THRESHOLD = 8192; // bytes

const sanitiseForFilename = (input) =>
  String(input || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'site';

function persistRunManifestIfNeeded(manifest, siteName, { cwd = process.cwd() } = {}) {
  const serialised = JSON.stringify(manifest, null, 2);
  if (Buffer.byteLength(serialised, 'utf8') <= RUN_MANIFEST_THRESHOLD) {
    return {
      env: {
        SITE_RUN_MANIFEST_INLINE: JSON.stringify(manifest),
      },
      manifestPath: null,
    };
  }

  const manifestsDir = path.join(cwd, 'reports', 'run-manifests');
  if (!fs.existsSync(manifestsDir)) {
    fs.mkdirSync(manifestsDir, { recursive: true });
  }

  const manifestFileName = `run-manifest-${sanitiseForFilename(siteName)}-${Date.now()}-${process.pid}.json`;
  const manifestPath = path.join(manifestsDir, manifestFileName);
  fs.writeFileSync(manifestPath, `${serialised}\n`);

  return {
    env: {
      SITE_RUN_MANIFEST: manifestPath,
    },
    manifestPath,
  };
}

function readLatestReportSummary({ cwd = process.cwd() } = {}) {
  try {
    const summaryPath = path.join(cwd, 'reports', 'latest-run.json');
    if (!fs.existsSync(summaryPath)) {
      return null;
    }
    const raw = fs.readFileSync(summaryPath, 'utf8');
    const data = JSON.parse(raw);
    const counts = data.statusCounts || {};
    const runFolder = data.runFolder || null;
    const reportRelativePath = data.reportRelativePath || null;
    return {
      passed: counts.passed ?? 0,
      failed: counts.failed ?? 0,
      skipped: counts.skipped ?? 0,
      timedOut: counts.timedOut ?? 0,
      interrupted: counts.interrupted ?? 0,
      flaky: counts.flaky ?? data.flaky ?? 0,
      reportPath:
        runFolder ||
        (reportRelativePath ? reportRelativePath.replace(/\\/g, '/').split('/')[0] : null),
      reportFile: reportRelativePath,
    };
  } catch (error) {
    console.warn(`⚠️  Unable to read latest report summary: ${error.message}`);
    return null;
  }
}

function ensureScreenshotResultsDir({ cwd = process.cwd() } = {}) {
  const resultsDir = path.join(cwd, 'test-results', 'screenshots');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  return resultsDir;
}

module.exports = {
  RUN_MANIFEST_THRESHOLD,
  ensureScreenshotResultsDir,
  persistRunManifestIfNeeded,
  readLatestReportSummary,
  sanitiseForFilename,
};
