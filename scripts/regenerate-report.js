#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const minimist = require('minimist');
const { renderReportHtml } = require('../utils/report-templates');
const { loadRunEntries } = require('./report-utils');

const REPORT_FILE_NAME = 'report.html';
const RUN_DATA_FILE = path.join('data', 'run.json');
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

  let runData;
  try {
    const raw = fs.readFileSync(runDataPath, 'utf8');
    runData = JSON.parse(raw);
  } catch (error) {
    console.error(
      `Failed to read ${entry.name}/${RUN_DATA_FILE}: ${error.message || 'Unknown error'}`
    );
    process.exitCode = 1;
    return;
  }

  let html;
  try {
    html = renderReportHtml(runData);
  } catch (error) {
    console.error(`Failed to render report for ${entry.name}: ${error.message || 'Unknown error'}`);
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
