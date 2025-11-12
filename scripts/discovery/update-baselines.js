#!/usr/bin/env node

// CLI helper that refreshes visual baselines across one or more site configs.

const minimist = require('minimist');
const path = require('path');
const repoRoot = path.resolve(__dirname, '..', '..');
const TestRunner = require(path.join(repoRoot, 'utils', 'test-runner'));
const { getSiteConfigPath, siteConfigExists } = require(
  path.join(repoRoot, 'utils', 'site-inventory')
);

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
    if (!siteConfigExists(siteName)) {
      const relativePath = path.relative(process.cwd(), getSiteConfigPath(siteName));
      console.error(`❌ Unknown site "${siteName}". Create ${relativePath} first.`);
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
