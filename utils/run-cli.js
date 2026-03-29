'use strict';

const fs = require('fs');
const path = require('path');
const minimist = require('minimist');

const MANIFEST_PREVIEW_LIMIT = 5;

const parseCli = (rawArgv = process.argv.slice(2)) =>
  minimist(rawArgv, {
    string: ['site', 'test', 'pages', 'browsers', 'workers', 'output', 'exclude'],
    boolean: [
      'help',
      'list-sites',
      'local',
      'visual',
      'responsive',
      'functionality',
      'accessibility',
      'all-suites',
      'dry-run',
      'debug',
    ],
    alias: {
      s: 'site',
      t: 'test',
      p: 'pages',
      b: 'browsers',
    },
  });

const coerceBoolean = (value) => {
  if (value === undefined) return false;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalised)) {
      return false;
    }
    if (['true', '1', 'yes', 'on', ''].includes(normalised)) {
      return true;
    }
  }
  return Boolean(value);
};

const toStringArray = (input) => {
  if (input === undefined || input === null) return [];
  if (Array.isArray(input)) {
    return input
      .flatMap((item) =>
        typeof item === 'string' ? item.split(',') : Array.isArray(item) ? item : [item]
      )
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }
  if (typeof input === 'string') {
    return input
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [String(input)].filter(Boolean);
};

function showUsage() {
  const lines = [
    '',
    'Smart Playwright runner',
    '',
    'Usage:',
    '  node run-tests.js --site <site> --pages <n|all> [suite flags or --test <pattern>]',
    '  node run-tests.js [options] --site <site> [extra sites...] [test patterns...]',
    '',
    'Required selections:',
    '  • Site(s):               --site, -s <name> (repeat or comma-separate)',
    '  • Suite/tests:           Choose one or more of --visual/--responsive/--functionality/--accessibility',
    '                           or pass --test, -t <pattern> (repeat as needed)',
    '                           (suite flags and --test patterns are mutually exclusive)',
    '  • Page cap:              --pages, -p <positive integer> or "all"',
    '',
    'Optional selections:',
    '  • Projects:              --browsers, -b <list> (default Chrome, use "all" for every project)',
    '',
    'Advanced options:',
    '  --visual                Run only visual regression specs',
    '  --responsive            Run only responsive structure specs',
    '  --functionality         Run only functionality specs',
    '  --accessibility         Run only accessibility specs',
    '  --all-suites            Convenience: select all suites (can combine with --exclude)',
    '  --exclude <list>        Comma/list of suites to exclude (e.g. "visual" or "visual,responsive")',
    '  --dry-run               Plan only: print manifest/spec selection and exit',
    '  --workers               Worker count (number or "auto", default auto)',
    '  --local                 Attempt DDEV preflight for local ".ddev.site" hosts',
    '  --output <path>         Persist manifest + run summary JSON to disk',
    '  --list-sites            Print site configs for reference',
    '  --debug                 Enable Playwright debug mode',
    '  --help                  Show this help message',
    '',
    'Mutating workflows moved to dedicated commands:',
    '  - npm run discover -- <site-name|https://base.url>',
    '  - npm run baselines:update -- <site-name>',
    '',
    'Tips:',
    '  - Append test globs after the options (e.g. "node run-tests.js --site foo --pages 5 tests/*.spec.js").',
    '  - Combine page cap (--pages) and project selection to mirror the GUI flow you plan to build.',
    '  - Use "--pages all" when you want to exercise every available page for the site.',
    '  - Use env vars like REPORT_BROWSER to override the default browser opener when viewing reports.',
    '',
  ];
  console.log(lines.join('\n'));
}

const parseSites = (argv) => {
  const explicitSites = toStringArray(argv.site);
  const positional = argv._.map((item) => String(item).trim()).filter(Boolean);
  const inferredSites = positional.filter(
    (value) => !/\.(spec\.[jt]s|[jt]s)$/i.test(value) && !value.includes('/')
  );

  const sites = [...explicitSites, ...inferredSites].filter(Boolean);
  return Array.from(new Set(sites));
};

const parseSpecs = (argv) => {
  const positional = argv._.map((item) => String(item).trim()).filter(Boolean);
  const positionalSpecs = positional.filter(
    (value) => /\.(spec\.[jt]s|[jt]s)$/i.test(value) || value.includes('/') || value.includes('*')
  );
  const specOptions = toStringArray(argv.test);
  const inputs = [...specOptions, ...positionalSpecs];
  return Array.from(new Set(inputs));
};

const assertNoLegacyMutatingFlags = (argv) => {
  if (coerceBoolean(argv.discover)) {
    throw new Error(
      '`--discover` no longer runs through `run-tests.js`. Use `npm run discover -- <site-name|https://base.url>`.'
    );
  }

  if (coerceBoolean(argv['update-baselines'])) {
    throw new Error(
      '`--update-baselines` no longer runs through `run-tests.js`. Use `npm run baselines:update -- <site-name>`.'
    );
  }
};

const resolvePagesToken = (rawPages) => {
  if (rawPages === undefined || rawPages === null || String(rawPages).trim() === '') {
    return '5';
  }

  const normalisedPages = String(rawPages).trim().toLowerCase();
  const unlimitedTokens = ['all', 'infinite', 'infinity'];
  if (unlimitedTokens.includes(normalisedPages)) {
    return 'all';
  }

  const parsedPages = Number.parseInt(normalisedPages, 10);
  if (!Number.isFinite(parsedPages) || parsedPages <= 0) {
    throw new Error(
      'Invalid `--pages` value. Use a positive integer or "all" (for example `--pages 5` or `--pages all`).'
    );
  }

  return String(parsedPages);
};

const createOutputWriter = (output) => {
  const resolvedOutput = path.resolve(process.cwd(), String(output));
  return {
    path: resolvedOutput,
    runs: [],
    capture(event) {
      if (!event || !event.siteName) return;
      const ensureEntry = () => {
        let entry = this.runs.find((item) => item.siteName === event.siteName);
        if (!entry) {
          entry = { siteName: event.siteName, manifest: null, manifestPath: null, summary: null };
          this.runs.push(entry);
        }
        return entry;
      };
      const entry = ensureEntry();
      switch (event.type) {
        case 'manifest:ready':
          entry.manifest = event.manifest || null;
          entry.manifestPath = event.manifestPath || null;
          break;
        case 'manifest:persisted':
          entry.manifestPath = event.manifestPath || null;
          break;
        case 'run:complete':
          entry.summary = {
            exitCode: event.code,
            reportSummary: event.summary || null,
            completedAt: new Date().toISOString(),
          };
          break;
        default:
          break;
      }
    },
    write() {
      const payload = {
        generatedAt: new Date().toISOString(),
        runs: this.runs.map((run) => ({
          siteName: run.siteName,
          manifest: run.manifest || null,
          manifestPath: run.manifestPath ? path.relative(process.cwd(), run.manifestPath) : null,
          summary: run.summary || null,
        })),
      };
      fs.mkdirSync(path.dirname(this.path), { recursive: true });
      fs.writeFileSync(this.path, `${JSON.stringify(payload, null, 2)}\n`);
      console.log(`📝 Written run output to ${path.relative(process.cwd(), this.path)}`);
    },
  };
};

const buildRunContext = (argv) => {
  assertNoLegacyMutatingFlags(argv);

  const sites = parseSites(argv);
  const specs = parseSpecs(argv);

  if (sites.length === 0) {
    throw new Error(
      'Missing required `--site` argument. Provide at least one site name (repeat or comma-separate).'
    );
  }

  const suiteSelections = {
    visual: coerceBoolean(argv.visual),
    responsive: coerceBoolean(argv.responsive),
    functionality: coerceBoolean(argv.functionality),
    accessibility: coerceBoolean(argv.accessibility),
  };

  if (coerceBoolean(argv['all-suites'])) {
    suiteSelections.visual = true;
    suiteSelections.responsive = true;
    suiteSelections.functionality = true;
    suiteSelections.accessibility = true;
  }

  const excludedSuites = new Set(
    toStringArray(argv.exclude)
      .map((suite) => suite.toLowerCase())
      .filter((suite) => ['visual', 'responsive', 'functionality', 'accessibility'].includes(suite))
  );
  for (const key of excludedSuites) {
    suiteSelections[key] = false;
  }

  const hasSuiteSelection = Object.values(suiteSelections).some(Boolean);
  if (!hasSuiteSelection && specs.length === 0) {
    throw new Error(
      'No suite or spec filters supplied. Use suite flags or pass `--test <pattern>`.'
    );
  }
  if (hasSuiteSelection && specs.length > 0) {
    throw new Error(
      'Conflicting suite and spec filters supplied. Choose suite flags or `--test` patterns, not both.'
    );
  }

  const options = {
    visual: suiteSelections.visual,
    responsive: suiteSelections.responsive,
    functionality: suiteSelections.functionality,
    accessibility: suiteSelections.accessibility,
    allGroups: false,
    debug: coerceBoolean(argv.debug),
    local: coerceBoolean(argv.local),
    project: argv.browsers,
    limit: resolvePagesToken(argv.pages),
    specs,
    workers: argv.workers,
    envOverrides: {},
    outputWriter: argv.output ? createOutputWriter(argv.output) : null,
    dryRun: coerceBoolean(argv['dry-run']),
  };

  return {
    sites,
    options,
  };
};

const renderManifestPreview = (manifest, manifestPath) => {
  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  const specs = Array.isArray(manifest.specs) ? manifest.specs : [];
  const projects = Array.isArray(manifest.projects) ? manifest.projects : [];

  console.log('Run manifest preview:');
  console.log(`  Site:        ${manifest.site?.title || manifest.site?.name}`);
  console.log(`  Base URL:    ${manifest.site?.baseUrl || 'n/a'}`);
  console.log(`  Pages:       ${pages.length}`);
  if (pages.length > 0) {
    const previewPages = pages.slice(0, MANIFEST_PREVIEW_LIMIT);
    const remaining = pages.length - previewPages.length;
    let pageLine = `    • ${previewPages.join(', ')}`;
    if (remaining > 0) {
      pageLine += `, ... (+${remaining} more)`;
    }
    console.log(pageLine);
  }
  console.log(`  Specs:       ${specs.length}`);
  if (specs.length > 0) {
    console.log(`    • ${specs.join(', ')}`);
  }
  console.log(`  Projects:    ${projects.length > 0 ? projects.join(', ') : 'n/a'}`);
  if (manifest.limits?.pageLimit != null) {
    console.log(`  Page cap:    ${manifest.limits.pageLimit}`);
  }
  if (
    manifest.limits?.accessibilitySample !== null &&
    manifest.limits?.accessibilitySample !== undefined
  ) {
    console.log(`  A11y sample: ${manifest.limits.accessibilitySample}`);
  }
  if (manifestPath) {
    const relativePath = path.relative(process.cwd(), manifestPath);
    console.log(`  Manifest:    ${relativePath}`);
  }
  console.log('');
};

module.exports = {
  buildRunContext,
  parseCli,
  renderManifestPreview,
  showUsage,
};
