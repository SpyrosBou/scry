const { spawn } = require('child_process');
const SiteLoader = require('./site-loader');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const {
  applyPageLimit,
  prepareRunManifestPayload,
  selectProjects,
  selectSpecTargets,
} = require('./run-plan');
const {
  ensureScreenshotResultsDir,
  persistRunManifestIfNeeded,
  readLatestReportSummary,
} = require('./run-artifacts');
const { buildPlaywrightInvocation } = require('./playwright-invocation');

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
      : persistRunManifestIfNeeded(manifest, siteName);

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

  static resolveLocalExecutionEnv(siteName, siteConfig, baseEnv = process.env, logger = console) {
    const resolvedEnv = { ...baseEnv };

    if (!/\.ddev\.site|localhost|127\.0\.0\.1/.test(siteConfig.baseUrl || '')) {
      return resolvedEnv;
    }

    if (
      String(resolvedEnv.ENABLE_DDEV || '').toLowerCase() === 'true' &&
      resolvedEnv.DDEV_PROJECT_PATH
    ) {
      logger.log(`🛠  --local: Using DDEV project path from env: ${resolvedEnv.DDEV_PROJECT_PATH}`);
      return resolvedEnv;
    }

    resolvedEnv.ENABLE_DDEV = 'true';
    const inferred = this.inferDdevProjectPath(siteName, siteConfig.baseUrl);
    if (inferred) {
      resolvedEnv.DDEV_PROJECT_PATH = inferred;
      logger.log(`🛠  --local: Using inferred DDEV project path: ${inferred}`);
    } else {
      logger.log(
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
      const pagePlan = applyPageLimit(siteConfig, options.limit);
      siteConfig = pagePlan.siteConfig;
      appliedPageLimit = pagePlan.appliedPageLimit;
      if (pagePlan.message) {
        console.log(pagePlan.message);
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
    const specPlan = selectSpecTargets(options);
    const specTargets = specPlan.requestedSpecs;

    if (specTargets.length > 0) {
      console.log('ℹ️  Running explicit spec target(s):');
      for (const specTarget of specTargets) {
        console.log(`   - ${specTarget}`);
      }
    }

    const testTargets = specPlan.testTargets;
    const projectPlan = selectProjects(options.project);
    const { projectArgsList, projectSpecifier } = projectPlan;
    if (projectPlan.message) {
      console.log(projectPlan.message);
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
    ensureScreenshotResultsDir();

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

    const invocation = buildPlaywrightInvocation({
      testTargets,
      debug: options.debug,
      projectArgsList,
    });

    console.log(`Starting tests...`);
    console.log(`Command: ${invocation.displayCommand}`);
    console.log('');

    return new Promise((resolve, reject) => {
      const playwright = spawn(invocation.command, invocation.args, {
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
    return readLatestReportSummary();
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

    const invocation = buildPlaywrightInvocation({
      testTargets: ['tests/visual.regression.snapshots.spec.js'],
      extraArgs: ['--update-snapshots', 'all'],
    });

    return new Promise((resolve, reject) => {
      const playwright = spawn(invocation.command, invocation.args, {
        stdio: 'inherit',
        env: { ...process.env, ...manifestInfo.env },
      });

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
