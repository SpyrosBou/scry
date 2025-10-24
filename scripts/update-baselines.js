#!/usr/bin/env node

const minimist = require('minimist');
const fs = require('fs');
const path = require('path');
const TestRunner = require(path.join(__dirname, '..', 'utils', 'test-runner'));

async function main() {
  const args = minimist(process.argv.slice(2));
  const siteInputs = [];

  if (Array.isArray(args._) && args._.length > 0) {
    siteInputs.push(...args._);
  }
  if (args.site) {
    siteInputs.push(...String(args.site).split(','));
  }

  const sites = siteInputs.map((entry) => String(entry).trim()).filter(Boolean);

  if (sites.length === 0) {
    console.error('Usage: npm run baselines:update -- <site-name> [extra sites...]');
    process.exit(1);
  }

  let exitCode = 0;

  for (const siteName of sites) {
    const siteConfigPath = path.join(__dirname, '..', 'sites', `${siteName}.json`);
    if (!fs.existsSync(siteConfigPath)) {
      console.error(`❌ Unknown site "${siteName}". Create ${siteName}.json under ./sites/ first.`);
      exitCode = 1;
      continue;
    }

    const resultCode = await TestRunner.updateBaselines(siteName);
    if (resultCode !== 0) {
      exitCode = resultCode;
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error('❌ Baseline update failed:', error.message);
  process.exit(1);
});
