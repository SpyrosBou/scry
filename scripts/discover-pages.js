#!/usr/bin/env node

const minimist = require('minimist');
const fs = require('fs');
const path = require('path');
const TestRunner = require(path.join(__dirname, '..', 'utils', 'test-runner'));

async function main() {
  const args = minimist(process.argv.slice(2));
  const siteName = args.site || args._[0];

  if (!siteName) {
    console.error('Usage: npm run discover:site -- <site-name> [--local]');
    process.exit(1);
  }

  const siteConfigPath = path.join(__dirname, '..', 'sites', `${siteName}.json`);
  if (!fs.existsSync(siteConfigPath)) {
    console.error(`❌ Unknown site "${siteName}". Create ${siteName}.json under ./sites/ first.`);
    process.exit(1);
  }

  try {
    const result = await TestRunner.runTestsForSite(siteName, {
      discover: true,
      discoverOnly: true,
      local: Boolean(args.local),
      visual: false,
      responsive: false,
      functionality: false,
      accessibility: false,
      full: false,
    });

    process.exit(result.code);
  } catch (error) {
    console.error(`❌ Discovery failed: ${error.message}`);
    process.exit(1);
  }
}

main();
