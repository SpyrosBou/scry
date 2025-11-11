const { defineConfig, devices } = require('@playwright/test');
const os = require('os');

// Detect if Safari is available (macOS only)
const isMacOS = os.platform() === 'darwin';

const normaliseEnvBoolean = (value) => {
  if (value === undefined || value === null) return false;
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) return false;
  return ['1', 'true', 'yes', 'on'].includes(normalised);
};

const resolveWorkerCount = () => {
  const rawValue = String(process.env.PWTEST_WORKERS || '').trim();
  const normalised = rawValue.toLowerCase();
  if (!rawValue || normalised === 'auto') {
    return undefined; // let Playwright fan out across all logical cores
  }
  if (/^\d+%$/.test(rawValue)) {
    return rawValue;
  }
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return undefined;
};

const disableChromiumSandbox = normaliseEnvBoolean(
  process.env.PW_DISABLE_CHROMIUM_SANDBOX || process.env.PLAYWRIGHT_DISABLE_CHROMIUM_SANDBOX
);

const chromiumUseOverrides = disableChromiumSandbox
  ? { launchOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] } }
  : {};

const sharedReporters = [
  ['./utils/custom-html-reporter', { outputFolder: 'reports', reportFileName: 'report.html' }],
  ['list'],
];

const reporter = process.env.CI ? [...sharedReporters, ['blob']] : sharedReporters;

module.exports = defineConfig({
  globalSetup: require.resolve('./scripts/playwright-global-setup'),
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: resolveWorkerCount(),
  reporter,
  // Disable per-test timeout so large accessibility runs can complete
  timeout: 0,
  expect: {
    timeout: 15000,
  },

  // Industry-standard snapshot organization following Playwright best practices
  // Organize by test file, then test name, with browser-specific suffixes
  snapshotPathTemplate: '{testDir}/baseline-snapshots/{testFileDir}/{testFileName}/{arg}{ext}',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },

  // Organize test artifacts by site/device/browser
  outputDir: 'test-results',

  projects: [
    // Desktop browsers (existing)
    {
      name: 'Chrome',
      use: { ...devices['Desktop Chrome'], ...chromiumUseOverrides },
    },
    {
      name: 'Firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    // Add Safari project only on macOS
    ...(isMacOS
      ? [
          {
            name: 'Safari',
            use: {
              ...devices['Desktop Safari'],
              // Ensure we use the real Safari browser
              browserName: 'webkit',
              channel: undefined, // Use system Safari, not Playwright's bundled webkit
            },
          },
        ]
      : []),

    // Mobile viewport testing (Chrome only for performance)
    {
      name: 'Chrome Mobile',
      use: {
        ...devices['iPhone 12'],
        viewport: { width: 375, height: 667 }, // Standard mobile viewport
      },
    },

    // Tablet viewport testing (Chrome only for performance)
    {
      name: 'Chrome Tablet',
      use: {
        ...devices['iPad Pro'],
        viewport: { width: 768, height: 1024 }, // Standard tablet viewport
      },
    },

    // Large desktop testing (Chrome only)
    {
      name: 'Chrome Desktop Large',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 }, // Large desktop viewport
        ...chromiumUseOverrides,
      },
    },
  ],
});
