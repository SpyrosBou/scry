#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

// Installs Playwright browsers while forcing the cache into .pw-browsers at the repo root.

// Environment Variables:
// - PLAYWRIGHT_BROWSERS_PATH: overrides the cache directory for Playwright binaries.

const browsersPath = path.resolve(__dirname, '..', '..', '.pw-browsers');
const result = spawnSync('npx', ['playwright', 'install'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
  },
});

if (result.error) {
  console.error('Failed to launch Playwright installer:', result.error.message);
  process.exit(1);
}

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}
