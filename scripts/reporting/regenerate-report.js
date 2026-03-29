#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const { RUN_DATA_FILE, loadRunEntries, renderReportFromDataPath } = require('./run-utils');

// Rebuilds a historical report's HTML from its stored JSON payload.

const REPORT_FILE_NAME = 'report.html';
const reportsDir = path.join(process.cwd(), 'reports');

const args = minimist(process.argv.slice(2));

function resolveIndex() {
  const positional = args._.map(String).filter(Boolean);
  if (positional.length === 0) return 1;
  const numeric = Number.parseInt(positional[0], 10);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return 1;
}

function regenerate(entry) {
  const runDataPath = path.join(entry.dir, RUN_DATA_FILE);
  if (!fs.existsSync(runDataPath)) {
    console.error(`Run "${entry.name}" is missing ${RUN_DATA_FILE}; skipping.`);
    process.exitCode = 1;
    return;
  }

  let html;
  try {
    html = renderReportFromDataPath(runDataPath);
  } catch (error) {
    const context =
      error.code === 'ENOENT' ? `missing ${RUN_DATA_FILE}` : error.message || 'Unknown error';
    console.error(`Failed to regenerate ${entry.name}: ${context}`);
    process.exitCode = 1;
    return;
  }
  const reportPath = path.join(entry.dir, REPORT_FILE_NAME);
  fs.writeFileSync(reportPath, html);
  console.log(`Regenerated ${entry.name}/${REPORT_FILE_NAME}`);
}

function main() {
  const index = resolveIndex();
  const entries = loadRunEntries(reportsDir);
  if (entries.length === 0) {
    console.log('No reports found to regenerate.');
    process.exit(1);
  }

  if (index > entries.length) {
    console.log(`Requested report #${index}, but only ${entries.length} run(s) are available.`);
    process.exit(1);
  }

  const entry = entries[index - 1];
  regenerate(entry);
}

main();
