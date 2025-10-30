#!/usr/bin/env node

const minimist = require('minimist');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const TestRunner = require(path.join(__dirname, '..', 'utils', 'test-runner'));

const SITES_DIR = path.join(__dirname, '..', 'sites');
const DEFAULT_CRITICAL_ELEMENTS = [
  { name: 'Navigation', selector: 'nav, .navigation, #main-menu' },
  { name: 'Header', selector: 'header, .site-header' },
  { name: 'Footer', selector: 'footer, .site-footer' },
];

const sanitiseSiteKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || '';

const deriveDisplayNameFromKey = (key) =>
  String(key || 'New Site')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normaliseBaseUrlInput = (input) => {
  if (!input) return '';
  const trimmed = String(input).trim();
  if (!trimmed) return '';

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    return '';
  }

  parsed.hash = '';
  parsed.search = '';

  let result = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  if (result.endsWith('/') && result.length > `${parsed.protocol}//${parsed.host}`.length) {
    result = result.replace(/\/+$/, '');
  }

  return result;
};

const canonicaliseBaseUrl = (input) => normaliseBaseUrlInput(input).toLowerCase();

const loadSiteInventory = () => {
  if (!fs.existsSync(SITES_DIR)) return [];
  return fs
    .readdirSync(SITES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const siteKey = file.replace(/\.json$/, '');
      const filePath = path.join(SITES_DIR, file);
      let baseUrl = '';
      let displayName = '';

      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.baseUrl === 'string') {
          baseUrl = normaliseBaseUrlInput(parsed.baseUrl);
        }
        if (typeof parsed.name === 'string') {
          displayName = parsed.name;
        }
      } catch (_error) {
        // Ignore malformed configs; they will still be referenced by filename.
      }

      return {
        key: siteKey,
        path: filePath,
        baseUrl,
        displayName,
      };
    });
};

const findSitesByBaseUrl = (baseUrl, inventory) => {
  const canonical = canonicaliseBaseUrl(baseUrl);
  if (!canonical) return [];
  return inventory.filter((entry) => canonicaliseBaseUrl(entry.baseUrl) === canonical);
};

const createPrompt = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let closed = false;
  rl.on('close', () => {
    closed = true;
  });

  return {
    ask(question) {
      return new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      });
    },
    close() {
      if (!closed) rl.close();
    },
  };
};

const validateBaseUrl = (value) => {
  const normalised = normaliseBaseUrlInput(value);
  if (!normalised) {
    return {
      ok: false,
      error: 'Enter a valid URL starting with http:// or https://',
    };
  }
  return { ok: true, value: normalised };
};

async function gatherNewConfigContext({
  initialKey,
  providedBaseUrl,
  providedDisplayName,
  inventory,
  interactive,
  autoApprove,
  allowDuplicateBase,
  args,
}) {
  if (!interactive && !autoApprove) {
    console.error(
      '❌ Unable to prompt for creation (non-interactive terminal). Re-run with --yes and provide --base-url and --site-name as needed.'
    );
    return { action: 'abort' };
  }

  if (args.no || args.n) {
    console.log('🚫 Discovery aborted; no site configuration created.');
    return { action: 'abort' };
  }

  const prompt = interactive && !autoApprove ? createPrompt() : null;

  try {
    if (prompt) {
      const confirmation = (
        await prompt.ask('Create a new site configuration now? (y/N) ')
      ).toLowerCase();
      const accepted = ['y', 'yes'].includes(confirmation);
      if (!accepted) {
        console.log('🚫 Discovery aborted; no site configuration created.');
        return { action: 'abort' };
      }
    }

    let siteKey = sanitiseSiteKey(initialKey);
    if (!siteKey) siteKey = 'site';

    const requestSiteKey = async () => {
      if (!prompt) {
        return siteKey;
      }

      while (true) {
        const response = await prompt.ask(`Config key (filename without .json) [${siteKey}]: `);
        const candidate = sanitiseSiteKey(response || siteKey);
        if (!candidate) {
          console.log('⚠️  Please enter a config key containing letters or numbers.');
          continue;
        }
        const existing = inventory.find((entry) => entry.key === candidate);
        if (existing) {
          const reuseAnswer = await prompt.ask(
            `Config "${candidate}" already exists. Use this config instead? (Y/n) `
          );
          if (!reuseAnswer || ['y', 'yes'].includes(reuseAnswer.toLowerCase())) {
            return { reuse: existing.key };
          }
          console.log('ℹ️  Choose a different config key for the new file.');
          continue;
        }
        return candidate;
      }
    };

    const keyResult = await requestSiteKey();
    if (typeof keyResult === 'object' && keyResult?.reuse) {
      return { action: 'use-existing', siteKey: keyResult.reuse };
    }

    siteKey = typeof keyResult === 'string' ? keyResult : siteKey;

    const defaultDisplayName = providedDisplayName || deriveDisplayNameFromKey(siteKey);
    let displayName = defaultDisplayName;
    if (prompt) {
      const nameResponse = await prompt.ask(`Display name [${defaultDisplayName}]: `);
      if (nameResponse) {
        displayName = nameResponse;
      }
    } else if (args.name || args.display) {
      displayName = String(args.name || args.display).trim() || defaultDisplayName;
    }

    let baseUrl = providedBaseUrl;
    if (!baseUrl) {
      if (prompt) {
        while (!baseUrl) {
          const response = await prompt.ask('Base URL (e.g. https://example.com): ');
          const validation = validateBaseUrl(response || '');
          if (validation.ok) {
            baseUrl = validation.value;
          } else {
            console.log(`⚠️  ${validation.error}`);
          }
        }
      } else {
        const validation = validateBaseUrl(args['base-url'] || args.baseUrl || '');
        if (!validation.ok) {
          console.error(
            '❌ Base URL is required to create the site configuration. Provide it with --base-url=<url>.'
          );
          return { action: 'abort' };
        }
        baseUrl = validation.value;
      }
    } else {
      const validation = validateBaseUrl(baseUrl);
      if (!validation.ok) {
        console.error(`❌ ${validation.error}`);
        return { action: 'abort' };
      }
      baseUrl = validation.value;
    }

    const baseUrlMatches = findSitesByBaseUrl(baseUrl, inventory).filter(
      (entry) => entry.key !== siteKey
    );

    if (baseUrlMatches.length > 0) {
      const matchesList = baseUrlMatches.map((entry) => `- ${entry.key}`).join('\n');
      console.log('ℹ️  The provided base URL already exists in the site inventory:');
      console.log(matchesList);

      if (prompt) {
        const reuseExisting = await prompt.ask(
          `Use existing config "${baseUrlMatches[0].key}" instead? (Y/n) `
        );
        if (!reuseExisting || ['y', 'yes'].includes(reuseExisting.toLowerCase())) {
          return { action: 'use-existing', siteKey: baseUrlMatches[0].key };
        }
      } else if (!allowDuplicateBase) {
        console.log(
          `ℹ️  Reusing existing config "${baseUrlMatches[0].key}". Pass --allow-duplicate to create a new file anyway.`
        );
        return { action: 'use-existing', siteKey: baseUrlMatches[0].key };
      }
    }

    const configPath = path.join(SITES_DIR, `${siteKey}.json`);
    if (fs.existsSync(configPath)) {
      console.log(
        `ℹ️  Config "${siteKey}" already exists. Using existing configuration instead of creating a new file.`
      );
      return { action: 'use-existing', siteKey };
    }

    return {
      action: 'create',
      siteKey,
      displayName,
      baseUrl,
    };
  } finally {
    if (interactive && !autoApprove) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (prompt) {
      prompt.close();
    }
  }
}

async function main() {
  const args = minimist(process.argv.slice(2));
  const rawSiteArg = args._[0] || args.site || '';
  const siteNameArg = args['site-name'] || args['config-name'] || '';
  const allowDuplicateBase = Boolean(args['allow-duplicate'] || args.allowDuplicate);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const autoApprove = Boolean(args.yes || args.y);

  if (!rawSiteArg && !siteNameArg) {
    console.error('Usage: npm run discover -- <site-name|base-url> [--local]');
    console.error(
      '       npm run discover -- https://example.com --yes --site-name=example-live --allow-duplicate'
    );
    process.exit(1);
  }

  const inventory = loadSiteInventory();

  let providedBaseUrl = '';
  let inputKeySource = siteNameArg || rawSiteArg;

  if (rawSiteArg && /^https?:\/\//i.test(rawSiteArg)) {
    providedBaseUrl = normaliseBaseUrlInput(rawSiteArg);
    if (!siteNameArg) {
      inputKeySource = sanitiseSiteKey(
        new URL(providedBaseUrl || rawSiteArg).host.replace(/\./g, '-')
      );
    }
  }

  if (!providedBaseUrl && (args['base-url'] || args.baseUrl)) {
    providedBaseUrl = normaliseBaseUrlInput(args['base-url'] || args.baseUrl);
  }

  let siteKey = sanitiseSiteKey(inputKeySource);
  if (!siteKey) siteKey = 'site';

  let siteConfigPath = path.join(SITES_DIR, `${siteKey}.json`);
  let configExists = fs.existsSync(siteConfigPath);

  const existingByKey = inventory.find((entry) => entry.key === siteKey);
  if (!configExists && existingByKey) {
    siteKey = existingByKey.key;
    siteConfigPath = existingByKey.path;
    configExists = fs.existsSync(siteConfigPath);
  }

  if (!configExists && providedBaseUrl) {
    const baseMatches = findSitesByBaseUrl(providedBaseUrl, inventory);
    if (baseMatches.length > 0) {
      siteKey = baseMatches[0].key;
      siteConfigPath = baseMatches[0].path;
      configExists = fs.existsSync(siteConfigPath);
      console.log(
        `ℹ️  Found existing config "${siteKey}" for ${providedBaseUrl}. Reusing that configuration.`
      );
    }
  }

  if (!configExists) {
    console.log(`ℹ️  sites/${siteKey}.json does not exist at the moment.`);
    const creationResult = await gatherNewConfigContext({
      initialKey: siteKey,
      providedBaseUrl,
      providedDisplayName: args.name || args.display || '',
      inventory,
      interactive,
      autoApprove,
      allowDuplicateBase,
      args,
    });

    if (creationResult.action === 'abort') {
      process.exit(1);
    }

    if (creationResult.action === 'use-existing') {
      siteKey = creationResult.siteKey;
      siteConfigPath = path.join(SITES_DIR, `${siteKey}.json`);
      if (!fs.existsSync(siteConfigPath)) {
        console.error(`❌ Attempted to reuse "${siteKey}" but the configuration file is missing.`);
        process.exit(1);
      }
    } else if (creationResult.action === 'create') {
      siteKey = creationResult.siteKey;
      siteConfigPath = path.join(SITES_DIR, `${siteKey}.json`);
      const configDir = path.dirname(siteConfigPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const initialConfig = {
        name: creationResult.displayName,
        baseUrl: creationResult.baseUrl,
        testPages: ['/'],
        criticalElements: DEFAULT_CRITICAL_ELEMENTS,
      };

      fs.writeFileSync(siteConfigPath, `${JSON.stringify(initialConfig, null, 2)}\n`);
      const relativePath = path.relative(process.cwd(), siteConfigPath);
      console.log(`✅ Created ${relativePath}.`);
    }
  }

  try {
    const result = await TestRunner.runTestsForSite(siteKey, {
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
