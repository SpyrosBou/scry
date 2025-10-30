#!/usr/bin/env node

const minimist = require('minimist');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const TestRunner = require(path.join(__dirname, '..', 'utils', 'test-runner'));

async function main() {
  const args = minimist(process.argv.slice(2));
  const rawSiteArg = args._[0] || args.site;
  let providedBaseUrl = '';
  let siteName = rawSiteArg;

  if (!rawSiteArg) {
    console.error('Usage: npm run discover -- <site-name|base-url> [--local]');
    process.exit(1);
  }

  if (/^https?:\/\//i.test(rawSiteArg)) {
    providedBaseUrl = rawSiteArg.replace(/\/+$/, '');
    siteName = providedBaseUrl
      .replace(/^https?:\/\//i, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    if (!siteName) {
      siteName = 'site';
    }
    console.log(`ℹ️  Derived site key "${siteName}" from URL ${providedBaseUrl}.`);
  }

  const siteConfigPath = path.join(__dirname, '..', 'sites', `${siteName}.json`);
  if (!fs.existsSync(siteConfigPath)) {
    console.log(`ℹ️  sites/${siteName}.json does not exist at the moment.`);

    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    const autoApprove = Boolean(args.yes || args.y);
    const autoDecline = Boolean(args.no || args.n);
    const providedName =
      typeof args.name === 'string' ? args.name.trim() : typeof args.display === 'string' ? args.display.trim() : '';
    const providedBaseUrlArg =
      typeof args['base-url'] === 'string'
        ? args['base-url'].trim()
        : typeof args.baseUrl === 'string'
        ? args.baseUrl.trim()
        : '';

    if (autoDecline) {
      console.log('🚫 Discovery aborted; no site configuration created.');
      process.exit(1);
    }

    if (!interactive && !autoApprove) {
      console.error(
        '❌ Unable to prompt for creation (non-interactive terminal). Re-run with --yes and --base-url=<url> to scaffold automatically.'
      );
      process.exit(1);
    }

    const defaultDisplayName = (providedName || siteName)
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const normaliseBaseUrl = (value) =>
      typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : '';

    let displayName = providedName || defaultDisplayName;
    let baseUrl = normaliseBaseUrl(providedBaseUrl || providedBaseUrlArg);

    if (interactive && !autoApprove) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      let interfaceClosed = false;
      rl.on('close', () => {
        interfaceClosed = true;
      });

      const closeInterface = () => {
        if (!interfaceClosed) {
          rl.close();
        }
      };

      const ask = (question) =>
        new Promise((resolve) => {
          rl.question(question, (answer) => resolve(answer.trim()));
        });

      try {
        const confirmation = (await ask('Create a new site configuration now? (y/N) ')).toLowerCase();
        const accepted = ['y', 'yes'].includes(confirmation);

        if (!accepted) {
          closeInterface();
          console.log('🚫 Discovery aborted; no site configuration created.');
          process.exit(1);
        }

        const displayNameAnswer = await ask(`Display name [${displayName}]: `);
        displayName = displayNameAnswer || displayName;

        while (true) {
          const basePrompt = baseUrl ? `Base URL [${baseUrl}]: ` : 'Base URL (e.g. https://example.com): ';
          const answer = await ask(basePrompt);
          const candidate = normaliseBaseUrl(answer || baseUrl);
          if (!candidate) {
            console.log('⚠️  Base URL is required to create the site configuration.');
          } else {
            baseUrl = candidate;
            break;
          }
        }
      } finally {
        closeInterface();
      }
    } else {
      if (!autoApprove) {
        console.log('ℹ️  Proceeding with non-interactive defaults.');
      } else {
        console.log('ℹ️  --yes detected; using provided defaults to scaffold config.');
      }

      if (!displayName) {
        displayName = defaultDisplayName;
      }
      if (!baseUrl) {
        console.error(
          '❌ Base URL is required to create the site configuration. Provide it via the command argument or --base-url=<url>.'
        );
        process.exit(1);
      }
    }

    const initialConfig = {
      name: displayName,
      baseUrl,
      testPages: ['/'],
      criticalElements: [
        { name: 'Navigation', selector: 'nav, .navigation, #main-menu' },
        { name: 'Header', selector: 'header, .site-header' },
        { name: 'Footer', selector: 'footer, .site-footer' },
      ],
    };

    fs.writeFileSync(siteConfigPath, `${JSON.stringify(initialConfig, null, 2)}\n`);
    const relativePath = path.relative(process.cwd(), siteConfigPath);
    console.log(`✅ Created ${relativePath}.`);
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
