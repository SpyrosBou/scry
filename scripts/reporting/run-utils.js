'use strict';

const fs = require('fs');
const path = require('path');
const { renderReportHtml } = require('../../utils/report-templates');

// Shared helpers for working with run folders under reports/.

const RUN_DATA_FILE = path.join('data', 'run.json');

/**
 * Discover report run directories sorted by most recent modification time.
 * @param {string} [reportsRoot=path.join(process.cwd(), 'reports')]
 * @returns {Array<{name: string, dir: string, mtime: number}>}
 */
function loadRunEntries(reportsRoot = path.join(process.cwd(), 'reports')) {
  if (!fs.existsSync(reportsRoot)) return [];

  return fs
    .readdirSync(reportsRoot)
    .map((name) => {
      const dir = path.join(reportsRoot, name);
      try {
        const stats = fs.statSync(dir);
        if (!stats.isDirectory()) return null;
        return {
          name,
          dir,
          mtime: stats.mtimeMs,
        };
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

function getRunDataPath(runDir) {
  return path.join(runDir, RUN_DATA_FILE);
}

function readRunDataFromFile(runDataPath) {
  if (!fs.existsSync(runDataPath)) {
    const error = new Error(`Missing ${RUN_DATA_FILE}`);
    error.code = 'ENOENT';
    throw error;
  }

  const raw = fs.readFileSync(runDataPath, 'utf8');
  return JSON.parse(raw);
}

function readRunData(runDir) {
  return readRunDataFromFile(getRunDataPath(runDir));
}

function renderReportForRun(runDir) {
  const runData = readRunData(runDir);
  return renderReportHtml(runData);
}

function renderReportFromDataPath(runDataPath) {
  const runData = readRunDataFromFile(runDataPath);
  return renderReportHtml(runData);
}

module.exports = {
  RUN_DATA_FILE,
  loadRunEntries,
  getRunDataPath,
  readRunData,
  readRunDataFromFile,
  renderReportForRun,
  renderReportFromDataPath,
};
