const { spawn } = require('child_process');
const SiteLoader = require('./site-loader');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const RUN_MANIFEST_THRESHOLD = 8192; // bytes

const sanitiseForFilename = (input) =>
  String(input || 'site')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'site';

const toPosixPath = (value) => value.split(path.sep).join('/');

const cloneSiteConfig = (siteConfig) => JSON.parse(JSON.stringify(siteConfig || {}));

function normaliseSpecPattern(specInput) {
  const raw = String(specInput || '').trim();
  if (!raw) return null;

  const hasGlob = (() => {
    const globChars = new Set(['*', '?', '[', ']', '{', '}']);
    for (const ch of raw) {
      if (globChars.has(ch)) return true;
    }
    return false;
  })();

  const resolveRelative = (candidate) => {
    const absolute = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(absolute)) {
      return toPosixPath(path.relative(process.cwd(), absolute) || candidate);
    }
    return null;
  };

  if (path.isAbsolute(raw)) {
    return toPosixPath(path.relative(process.cwd(), raw) || raw);
  }

  const direct = resolveRelative(raw);
  if (direct) {
    return direct;
  }

  if (!raw.startsWith('tests/')) {
    const nested = resolveRelative(path.join('tests', raw));
    if (nested) {
      return nested;
    }
  }

  if (!hasGlob && !raw.startsWith('tests/')) {
    return toPosixPath(path.join('tests', raw));
  }

  return toPosixPath(raw);
}

function prepareRunManifestPayload({
  siteName,
  siteConfig,
  appliedPageLimit,
  projectArgsList,
  projectSpecifier,
  testTargets,
  requestedSpecs,
}) {
  let resolvedProjects;
  if (projectSpecifier && projectSpecifier.toLowerCase() === 'all') {
    resolvedProjects = ['all'];
  } else if (projectArgsList.length > 0) {
    resolvedProjects = [...projectArgsList];
  } else {
    resolvedProjects = ['Chrome'];
  }
  const manifest = {
    timestamp: new Date().toISOString(),
    limits: {
      pageLimit: appliedPageLimit != null ? appliedPageLimit : null,
    },
    site: {
      name: siteName,
      title: siteConfig.name,
      baseUrl: siteConfig.baseUrl,
    },
    siteConfig: cloneSiteConfig(siteConfig),
    pages: Array.isArray(siteConfig.testPages) ? [...siteConfig.testPages] : [],
    specs: Array.isArray(testTargets) ? [...testTargets] : [],
    requestedSpecs: Array.isArray(requestedSpecs) ? [...requestedSpecs] : [],
    projects: resolvedProjects,
  };

  return manifest;
}

function persistManifestIfNeeded(manifest, siteName) {
  const serialised = JSON.stringify(manifest, null, 2);
  if (Buffer.byteLength(serialised, 'utf8') <= RUN_MANIFEST_THRESHOLD) {
    return {
      env: {
        SITE_RUN_MANIFEST_INLINE: JSON.stringify(manifest),
      },
      manifestPath: null,
    };
  }

  const manifestsDir = path.join(process.cwd(), 'reports', 'run-manifests');
  if (!fs.existsSync(manifestsDir)) {
    fs.mkdirSync(manifestsDir, { recursive: true });
  }

  const manifestFileName = `run-manifest-${sanitiseForFilename(siteName)}-${Date.now()}-${process.pid}.json`;
  const manifestPath = path.join(manifestsDir, manifestFileName);
  fs.writeFileSync(manifestPath, `${serialised}\n`);

  return {
    env: {
      SITE_RUN_MANIFEST: manifestPath,
    },
    manifestPath,
  };
}

class TestRunner {
  static prepareRunManifest({
    siteName,
    siteConfig,
    appliedPageLimit,
    options,
    projectArgsList,
    projectSpecifier,
    testTargets,
    requestedSpecs,
  }) {
    const manifest = prepareRunManifestPayload({
      siteName,
      siteConfig,
      appliedPageLimit,
      options,
      projectArgsList,
      projectSpecifier,
      testTargets,
      requestedSpecs,
    });

    const persistence = options.dryRun
      ? {
          env: {
            SITE_RUN_MANIFEST_INLINE: JSON.stringify(manifest),
          },
          manifestPath: null,
        }
      : persistManifestIfNeeded(manifest, siteName);

    return {
      manifest,
      manifestPath: persistence.manifestPath,
      env: {
        ...persistence.env,
      },
    };
  }

  static listSites() {
    const sites = SiteLoader.listAvailableSites();

    if (sites.length === 0) {
      console.log('No site configurations found in ./sites/ directory');
      console.log('Create a .json file in ./sites/ directory with your site configuration');
      return { localSites: [], liveSites: [], otherSites: [] };
    }

    // Group by site type (local vs live)
    const localSites = [];
    const liveSites = [];
    const otherSites = [];

    sites.forEach((site) => {
      try {
        const config = SiteLoader.loadSite(site);
        if (site.includes('-local')) {
          localSites.push({ name: site, config });
        } else if (site.includes('-live')) {
          liveSites.push({ name: site, config });
        } else {
          otherSites.push({ name: site, config });
        }
      } catch (_error) {
        otherSites.push({ name: site, config: null });
      }
    });

    return { localSites, liveSites, otherSites };
  }

  static displaySites() {
    const { localSites, liveSites, otherSites } = this.listSites();

    console.log('Available site configurations:');

    if (localSites.length > 0) {
      console.log('\n  🏠 Local Development Sites:');
      localSites.forEach((site) => {
        console.log(`    ${site.name}: ${site.config.name} (${site.config.baseUrl})`);
      });
    }

    if (liveSites.length > 0) {
      console.log('\n  🌐 Live Production Sites:');
      liveSites.forEach((site) => {
        console.log(`    ${site.name}: ${site.config.name} (${site.config.baseUrl})`);
      });
    }

    if (otherSites.length > 0) {
      console.log('\n  📝 Other Sites:');
      otherSites.forEach((site) => {
        if (site.config) {
          console.log(`    ${site.name}: ${site.config.name} (${site.config.baseUrl})`);
        } else {
          console.log(`    ${site.name}: [Error loading config]`);
        }
      });
    }

    console.log('\nTesting examples:');
    console.log('  node run-tests.js --site=daygroup-local      # Test local development');
    console.log('  node run-tests.js --site=daygroup-live       # Test live production');
  }

  static resolveLocalExecutionEnv(siteName, siteConfig, baseEnv = process.env) {
    const resolvedEnv = { ...baseEnv };

    if (!/\.ddev\.site|localhost|127\.0\.0\.1/.test(siteConfig.baseUrl || '')) {
      return resolvedEnv;
    }

    if (
      String(resolvedEnv.ENABLE_DDEV || '').toLowerCase() === 'true' &&
      resolvedEnv.DDEV_PROJECT_PATH
    ) {
      console.log(
        `🛠  --local: Using DDEV project path from env: ${resolvedEnv.DDEV_PROJECT_PATH}`
      );
      return resolvedEnv;
    }

    resolvedEnv.ENABLE_DDEV = 'true';
    const inferred = this.inferDdevProjectPath(siteName, siteConfig.baseUrl);
    if (inferred) {
      resolvedEnv.DDEV_PROJECT_PATH = inferred;
      console.log(`🛠  --local: Using inferred DDEV project path: ${inferred}`);
    } else {
      console.log(
        'ℹ️  --local provided but unable to infer DDEV project path. You can set DDEV_PROJECT_PATH explicitly.'
      );
    }

    return resolvedEnv;
  }

  static async runTestsForSite(siteName, options = {}) {
    // Validate site exists
    let siteConfig;
    let appliedPageLimit = null;
    let runtimeEnv = { ...process.env };
    try {
      siteConfig = SiteLoader.loadSite(siteName);
      SiteLoader.validateSiteConfig(siteConfig);

      if (options.local) {
        runtimeEnv = this.resolveLocalExecutionEnv(siteName, siteConfig, runtimeEnv);
      }

      appliedPageLimit = null;
      if (options.limit != null) {
        const rawLimit = String(options.limit).trim().toLowerCase();
        const unlimitedTokens = new Set(['all', 'infinite', 'infinity']);
        if (rawLimit !== '' && !unlimitedTokens.has(rawLimit)) {
          const limitNumber = Number.parseInt(rawLimit, 10);
          if (Number.isFinite(limitNumber) && limitNumber > 0) {
            siteConfig.testPages = siteConfig.testPages.slice(0, limitNumber);
            appliedPageLimit = limitNumber;
            console.log(`ℹ️  Page cap applied: first ${limitNumber} page(s) will be tested.`);
          } else {
            console.log('⚠️  Ignoring invalid page cap; all pages will be tested.');
          }
        } else {
          console.log('ℹ️  Page cap disabled; all available pages will be tested.');
        }
      }

      console.log(`Running tests for: ${siteConfig.name}`);
      console.log(`Base URL: ${siteConfig.baseUrl}`);
      console.log(`Pages to test: ${siteConfig.testPages.join(', ')}`);
      console.log('');
    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.log('');
      this.displaySites();
      throw error;
    }

    // Determine which tests to run (avoid relying on shell glob expansion)
    const specFilters = Array.isArray(options.specs) ? options.specs.filter(Boolean) : [];
    const specTargets = Array.from(new Set(specFilters.map(normaliseSpecPattern).filter(Boolean)));

    if (specTargets.length > 0) {
      console.log('ℹ️  Running explicit spec target(s):');
      for (const specTarget of specTargets) {
        console.log(`   - ${specTarget}`);
      }
    }

    let testTargets;

    if (specTargets.length > 0) {
      testTargets = specTargets;
    } else {
      const testsDir = path.join(process.cwd(), 'tests');
      const testEntries = fs
        .readdirSync(testsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.js'))
        .map((entry) => path.join('tests', entry.name));

      const groupExplicitlySelected =
        options.visual ||
        options.responsive ||
        options.functionality ||
        options.accessibility ||
        options.allGroups;

      const runAllGroups = options.allGroups || !groupExplicitlySelected;
      const selectedTests = new Set();

      for (const file of testEntries) {
        const baseName = path.basename(file);
        const isVisual = baseName.startsWith('visual.');
        const isResponsiveStructure = baseName.startsWith('responsive.') && !/a11y/i.test(baseName);
        const isFunctionality = baseName.startsWith('functionality.');
        const isAccessibility = /accessibility|a11y/i.test(baseName);

        if (runAllGroups) {
          selectedTests.add(file);
          continue;
        }

        if (options.visual && isVisual) {
          selectedTests.add(file);
          continue;
        }
        if (options.responsive && isResponsiveStructure) {
          selectedTests.add(file);
          continue;
        }
        if (options.functionality && isFunctionality) {
          selectedTests.add(file);
          continue;
        }
        if (options.accessibility && isAccessibility) {
          selectedTests.add(file);
        }
      }

      testTargets = selectedTests.size > 0 ? Array.from(selectedTests) : ['tests'];
    }

    const projectInputRaw = Array.isArray(options.project)
      ? options.project
          .map((entry) => String(entry || '').trim())
          .filter(Boolean)
          .join(',')
      : typeof options.project === 'string'
        ? options.project.trim()
        : options.project === true
          ? 'Chrome'
          : '';
    const usingDefaultProject = !projectInputRaw;
    const projectSpecifier = usingDefaultProject ? 'Chrome' : projectInputRaw;
    const projectArgsList =
      projectSpecifier.toLowerCase() === 'all'
        ? []
        : projectSpecifier
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    if (usingDefaultProject && projectSpecifier.toLowerCase() !== 'all') {
      console.log('ℹ️  Defaulting to Chrome project (override with --browsers)');
    } else if (projectSpecifier.toLowerCase() === 'all') {
      console.log('ℹ️  Running across all configured Playwright projects');
    }

    const manifestInfo = TestRunner.prepareRunManifest({
      siteName,
      siteConfig,
      appliedPageLimit,
      options,
      projectArgsList,
      projectSpecifier,
      testTargets,
      requestedSpecs: specTargets,
    });

    if (typeof options.onEvent === 'function') {
      options.onEvent({
        type: 'manifest:ready',
        siteName,
        manifest: manifestInfo.manifest,
        manifestPath: manifestInfo.manifestPath,
      });
    }

    // Support planning without executing tests
    if (options.dryRun) {
      console.log('🧪 Dry run enabled: printing manifest/spec selection only.');
      console.log('No tests will be executed.');
      return { code: 0, siteName };
    }

    // Optional local preflight for ddev-based sites only when a real run will execute.
    await this.preflightLocalSite(siteConfig, runtimeEnv);

    // Create test-results directory only for real Playwright runs.
    const resultsDir = path.join(process.cwd(), 'test-results', 'screenshots');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    if (manifestInfo.manifestPath) {
      const relativePath = path.relative(process.cwd(), manifestInfo.manifestPath);
      console.log(`ℹ️  Run manifest saved to ${relativePath}`);
      if (typeof options.onEvent === 'function') {
        options.onEvent({
          type: 'manifest:persisted',
          siteName,
          manifestPath: manifestInfo.manifestPath,
        });
      }
    }

    const spawnEnv = {
      ...runtimeEnv,
      ...(options.envOverrides || {}),
      ...manifestInfo.env,
    };

    if (options.workers) {
      spawnEnv.PWTEST_WORKERS = String(options.workers).trim() || 'auto';
      console.log(`ℹ️  Worker pool: ${spawnEnv.PWTEST_WORKERS}`);
    } else if (!spawnEnv.PWTEST_WORKERS || String(spawnEnv.PWTEST_WORKERS).trim().length === 0) {
      spawnEnv.PWTEST_WORKERS = 'auto';
      console.log('ℹ️  Worker pool: auto (all logical cores exposed)');
    } else {
      console.log(`ℹ️  Worker pool: ${spawnEnv.PWTEST_WORKERS}`);
    }

    if (!spawnEnv.A11Y_TAGS_MODE) {
      spawnEnv.A11Y_TAGS_MODE = 'all';
    }

    if (!spawnEnv.A11Y_RUN_TOKEN) {
      spawnEnv.A11Y_RUN_TOKEN = `${Date.now()}`;
    }

    // Run Playwright tests
    const playwrightArgs = ['test', ...testTargets];

    // Add additional args
    if (options.debug) playwrightArgs.push('--debug');
    if (projectArgsList.length > 0) {
      for (const projectName of projectArgsList) {
        playwrightArgs.push(`--project=${projectName}`);
      }
    }

    console.log(`Starting tests...`);
    console.log(`Command: npx playwright ${playwrightArgs.join(' ')}`);
    console.log('');

    return new Promise((resolve, reject) => {
      const playwright = spawn('npx', ['playwright', ...playwrightArgs], {
        stdio: 'inherit',
        env: spawnEnv,
      });

      playwright.on('close', (code) => {
        console.log('');

        const summary = TestRunner.readLatestReportSummary();
        if (summary) {
          console.log('Quick Summary:');
          console.log(`Tests passed: ${summary.passed}`);
          console.log(`Tests failed: ${summary.failed}`);
          console.log(`Tests skipped: ${summary.skipped}`);
          if (summary.timedOut) {
            console.log(`Tests timed out: ${summary.timedOut}`);
          }
          if (summary.interrupted) {
            console.log(`Tests interrupted: ${summary.interrupted}`);
          }
          if (typeof summary.flaky === 'number' && summary.flaky > 0) {
            console.log(`Tests flaky: ${summary.flaky}`);
          }
        } else {
          console.log('Quick Summary: (report not yet available)');
        }

        console.log('');
        if (code === 0) {
          console.log('✅ Tests completed successfully!');
        } else {
          console.log('❌ Test run completed with issues.');
        }
        console.log('📰 View report: npm run reports:read');
        console.log('📁 Reports directory: ./reports/');
        console.log('📸 Test artifacts: ./test-results/');

        if (typeof options.onEvent === 'function') {
          options.onEvent({
            type: 'run:complete',
            siteName,
            code,
            summary,
          });
        }

        resolve({ code, siteName });
      });

      playwright.on('error', (error) => {
        console.error('Error running tests:', error.message);
        reject(error);
      });
    });
  }

  static readLatestReportSummary() {
    try {
      const summaryPath = path.join(process.cwd(), 'reports', 'latest-run.json');
      if (!fs.existsSync(summaryPath)) {
        return null;
      }
      const raw = fs.readFileSync(summaryPath, 'utf8');
      const data = JSON.parse(raw);
      const counts = data.statusCounts || {};
      const runFolder = data.runFolder || null;
      const reportRelativePath = data.reportRelativePath || null;
      return {
        passed: counts.passed ?? 0,
        failed: counts.failed ?? 0,
        skipped: counts.skipped ?? 0,
        timedOut: counts.timedOut ?? 0,
        interrupted: counts.interrupted ?? 0,
        flaky: counts.flaky ?? data.flaky ?? 0,
        reportPath:
          runFolder ||
          (reportRelativePath ? reportRelativePath.replace(/\\/g, '/').split('/')[0] : null),
        reportFile: reportRelativePath,
      };
    } catch (error) {
      console.warn(`⚠️  Unable to read latest report summary: ${error.message}`);
      return null;
    }
  }

  static inferDdevProjectPath(siteName, baseUrl) {
    try {
      const home = process.env.HOME || '/home/warui';
      const sitesRoot = path.join(home, 'sites');

      // Helper to validate a candidate path
      const isValidProject = (dir) => {
        try {
          const configPath = path.join(dir, '.ddev', 'config.yaml');
          return fs.existsSync(dir) && fs.existsSync(configPath);
        } catch (_) {
          return false;
        }
      };

      const candidates = new Set();

      // Candidate 1: siteName minus common suffixes
      const baseFromSite = siteName.replace(/-(local|live)$/i, '');
      if (baseFromSite) candidates.add(path.join(sitesRoot, baseFromSite));

      // Candidate 2: from baseUrl hostname first label(s)
      try {
        const url = new URL(baseUrl);
        const host = url.hostname || '';
        // e.g., day.local -> day, roladev.atelierdev.local -> roladev
        const parts = host.split('.');
        if (parts.length > 0) {
          candidates.add(path.join(sitesRoot, parts[0]));
        }
        // Also try host without common local TLDs
        const stripped = host.replace(/\.(local|ddev\.site)$/i, '');
        if (stripped && stripped !== parts[0]) {
          candidates.add(path.join(sitesRoot, stripped));
        }
      } catch (_) {
        // ignore URL parse errors
      }

      for (const dir of candidates) {
        if (isValidProject(dir)) {
          return dir;
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  static requestReachable(urlString, timeoutMs = 5000) {
    return new Promise((resolve) => {
      try {
        const url = new URL(urlString);
        const lib = url.protocol === 'https:' ? https : http;
        const allowInsecure =
          /\.ddev\.site$/.test(url.hostname) ||
          url.hostname === 'localhost' ||
          url.hostname === '127.0.0.1';
        const requestOptions = {
          method: 'GET',
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname || '/',
          timeout: timeoutMs,
        };
        if (url.protocol === 'https:' && allowInsecure) {
          requestOptions.agent = new https.Agent({ rejectUnauthorized: false });
        }
        const req = lib.request(requestOptions, (res) => {
          resolve(res.statusCode && res.statusCode < 500);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.end();
      } catch (_error) {
        resolve(false);
      }
    });
  }

  static async waitUntilReachable(url, { timeoutMs = 120000, intervalMs = 3000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await this.requestReachable(url, Math.min(intervalMs, 5000));
      if (ok) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  }

  static async preflightLocalSite(siteConfig, env = process.env) {
    const baseUrl = siteConfig.baseUrl;
    const isLocal = /\.ddev\.site|localhost|127\.0\.0\.1/.test(baseUrl);
    if (!isLocal) return;

    const reachable = await this.requestReachable(baseUrl, 3000);
    if (reachable) return;

    const enableDdev = String(env.ENABLE_DDEV || '').toLowerCase() === 'true';
    const ddevPath = env.DDEV_PROJECT_PATH;

    if (!enableDdev || !ddevPath) {
      console.log(
        'ℹ️ Local site appears unreachable. Set ENABLE_DDEV=true and DDEV_PROJECT_PATH to auto-start ddev.'
      );
      return;
    }

    console.log(`🔧 Attempting to start ddev in ${ddevPath} ...`);
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('ddev', ['start'], { cwd: ddevPath, stdio: 'inherit' });
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`ddev start exited with ${code}`))
        );
        child.on('error', reject);
      });
    } catch (err) {
      console.log(`⚠️  ddev start failed: ${err.message}`);
      return;
    }

    console.log('⏳ Waiting for local site to become reachable...');
    const ok = await this.waitUntilReachable(baseUrl, { timeoutMs: 120000, intervalMs: 5000 });
    if (ok) {
      console.log('✅ Local site is reachable. Proceeding with tests.');
    } else {
      console.log('⚠️  Local site did not become reachable in time. Tests may fail.');
    }
  }

  // Removed unsafe process cleanup; no-op retained for compatibility
  static killOrphanedReportServers() {
    /* no-op */
  }

  static async updateBaselines(siteName) {
    console.log(`Updating visual baselines for: ${siteName}`);

    const siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig, {
      contextLabel: `Site configuration ${siteName}.json`,
    });

    const manifestInfo = TestRunner.prepareRunManifest({
      siteName,
      siteConfig,
      appliedPageLimit: null,
      options: { dryRun: false },
      projectArgsList: [],
      projectSpecifier: 'Chrome',
      testTargets: ['tests/visual.regression.snapshots.spec.js'],
      requestedSpecs: ['tests/visual.regression.snapshots.spec.js'],
    });

    return new Promise((resolve, reject) => {
      const playwright = spawn(
        'npx',
        [
          'playwright',
          'test',
          'tests/visual.regression.snapshots.spec.js',
          '--update-snapshots',
          'all',
        ],
        {
          stdio: 'inherit',
          env: { ...process.env, ...manifestInfo.env },
        }
      );

      playwright.on('close', (code) => {
        console.log('');
        if (code === 0) {
          console.log('✅ Baselines updated successfully!');
        } else {
          console.log('❌ Baseline update failed.');
        }
        resolve(code);
      });

      playwright.on('error', (error) => {
        console.error('Error updating baselines:', error.message);
        reject(error);
      });
    });
  }
}

module.exports = TestRunner;
