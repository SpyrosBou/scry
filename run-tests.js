#!/usr/bin/env node

const TestRunner = require('./utils/test-runner');
const { buildRunContext, parseCli, renderManifestPreview, showUsage } = require('./utils/run-cli');

async function handleListSites() {
  TestRunner.displaySites();
}

async function runForSites(sites, baseOptions) {
  let exitCode = 0;
  const optionsWithEvents = {
    ...baseOptions,
    onEvent: (event) => {
      if (baseOptions.outputWriter) {
        baseOptions.outputWriter.capture(event);
      }
      if (typeof baseOptions.onEvent === 'function') {
        baseOptions.onEvent(event);
      }
      if (event.type === 'manifest:ready' && event.manifest) {
        console.log('');
        renderManifestPreview(event.manifest, event.manifestPath || null);
      }
    },
  };

  for (const siteName of sites) {
    console.log(`\n==============================`);
    console.log(`Running Playwright suite for site: ${siteName}`);
    console.log('==============================\n');

    try {
      const result = await TestRunner.runTestsForSite(siteName, optionsWithEvents);
      exitCode = result.code !== 0 ? result.code : exitCode;
    } catch (error) {
      console.error(`❌ Run failed for ${siteName}:`, error.message || error);
      exitCode = 1;
    }
  }

  return exitCode;
}

async function main() {
  const argv = parseCli(process.argv.slice(2));

  if (argv.help) {
    showUsage();
    return;
  }

  if (argv['list-sites']) {
    await handleListSites();
    return;
  }

  let runContext;
  try {
    runContext = buildRunContext(argv);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  const exitCode = await runForSites(runContext.sites, runContext.options);
  if (runContext.options.outputWriter) {
    try {
      runContext.options.outputWriter.write();
    } catch (error) {
      console.error(`⚠️  Failed to write run output: ${error.message}`);
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
