#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const openModule = require('open');
const openBrowser = openModule.default || openModule;

// Opens the most recent (or requested) HTML test report in a browser.

// Environment Variables:
// - REPORT_BROWSER: preferred browser executable (overrides OS defaults).
// - REPORT_BROWSER_ARGS: space-delimited flags passed to the browser process.

const minimist = require('minimist');
const { loadRunEntries } = require('./run-utils');

const normalisedArgv = process.argv.slice(2).map((arg) => (arg === '-past' ? '--past' : arg));

const args = minimist(normalisedArgv, {
  alias: {
    past: ['p'],
    count: ['c'],
  },
});
const envBrowser = process.env.REPORT_BROWSER && String(process.env.REPORT_BROWSER).trim();
const envBrowserArgs = process.env.REPORT_BROWSER_ARGS
  ? String(process.env.REPORT_BROWSER_ARGS).split(/\s+/).filter(Boolean)
  : [];
const REPORT_FILE_NAME = 'report.html';

function coerceNumeric(value) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = coerceNumeric(entry);
      if (parsed !== null) return parsed;
    }
    return null;
  }
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readNpmEnvNumber(key) {
  const envValue = process.env[`npm_config_${key}`];
  return coerceNumeric(envValue);
}

function readNpmOriginalArg(key) {
  const raw = process.env.npm_config_argv;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const original = Array.isArray(parsed?.original) ? parsed.original : [];
    for (let index = 0; index < original.length; index += 1) {
      const token = original[index];
      if (token === `--${key}`) {
        const next = original[index + 1];
        return next === undefined ? true : next;
      }
      if (token && token.startsWith(`--${key}=`)) {
        return token.split('=').slice(1).join('=');
      }
    }
  } catch (_error) {
    // ignore malformed JSON
  }
  return null;
}

function resolveCount() {
  const candidates = [
    coerceNumeric(args.count),
    readNpmEnvNumber('count'),
    coerceNumeric(readNpmOriginalArg('count')),
  ];
  const resolvedFlag = candidates.find((value) => value && value > 0);
  if (resolvedFlag) return resolvedFlag;

  const positional = args._.map(String).filter(Boolean);
  const numericArg = positional.find((value) => /^\d+$/.test(value));
  const count = Math.max(1, Number.parseInt(numericArg, 10) || 1);
  return count;
}

function resolvePastOffset() {
  const candidates = [
    coerceNumeric(args.past),
    readNpmEnvNumber('past'),
    coerceNumeric(readNpmOriginalArg('past')),
  ];
  const resolved = candidates.find((value) => value && value > 0);
  if (resolved) return resolved;
  return 0;
}

function resolveBrowserConfig() {
  if (envBrowser) {
    return { name: envBrowser, args: envBrowserArgs };
  }

  if (process.platform === 'linux') {
    return { name: 'google-chrome', args: ['--new-window'] };
  }

  return { name: null, args: [] };
}

async function openEntries(entries) {
  if (entries.length === 0) {
    console.log('No reports available to open.');
    return;
  }

  console.log(`Opening ${entries.length} report(s):`);
  const { name: browserName, args: initialArgs } = resolveBrowserConfig();
  const browserArgs = initialArgs.slice();
  if (browserName && browserArgs.length === 0 && browserName.toLowerCase().includes('chrome')) {
    browserArgs.push('--new-window');
  }

  for (const entry of entries) {
    const reportPath = path.join(entry.dir, REPORT_FILE_NAME);
    if (!fs.existsSync(reportPath)) {
      console.warn(`- ${entry.name}: skipped (missing ${REPORT_FILE_NAME})`);
      continue;
    }
    console.log(`- ${entry.name}`);
    try {
      if (browserName) {
        const appOptions =
          browserArgs.length > 0
            ? { name: browserName, arguments: browserArgs }
            : { name: browserName };
        await openBrowser(reportPath, { wait: false, app: appOptions });
      } else {
        await openBrowser(reportPath, { wait: false });
      }
      if (
        browserArgs.length > 0 ||
        (browserName && browserName.toLowerCase().includes('firefox'))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } catch (error) {
      if (browserName) {
        console.error(`  Failed to open with ${browserName}: ${error.message}`);
      } else {
        console.error(`  Failed to open report: ${error.message}`);
      }
    }
  }
}

async function main() {
  const runEntries = loadRunEntries(path.join(process.cwd(), 'reports'));
  if (runEntries.length === 0) {
    console.log('No reports found. Run the test suite to generate one.');
    process.exit(1);
  }

  const count = resolveCount();
  const offset = resolvePastOffset();
  if (offset >= runEntries.length) {
    console.log(
      `Only ${runEntries.length} report(s) available; past offset ${offset} skips them all.`
    );
    process.exit(1);
  }

  const toOpen = runEntries.slice(offset, offset + count);

  await openEntries(toOpen);
}

main().catch((error) => {
  console.error('Failed to open reports:', error.message);
  process.exit(1);
});
