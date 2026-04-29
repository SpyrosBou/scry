'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildPlaywrightInvocation,
  buildPlaywrightTestArgs,
  resolvePlaywrightCli,
} = require('../../utils/playwright-invocation');

test('buildPlaywrightTestArgs builds test targets, debug, projects, and extra args', () => {
  const args = buildPlaywrightTestArgs({
    testTargets: ['tests/functionality.forms.spec.js'],
    debug: true,
    projectArgsList: ['Chrome', 'Firefox'],
    extraArgs: ['--update-snapshots', 'all'],
  });

  assert.deepStrictEqual(args, [
    'test',
    'tests/functionality.forms.spec.js',
    '--debug',
    '--project=Chrome',
    '--project=Firefox',
    '--update-snapshots',
    'all',
  ]);
});

test('buildPlaywrightInvocation uses node to execute the local Playwright CLI', () => {
  const invocation = buildPlaywrightInvocation({
    testTargets: ['tests/responsive.layout.spec.js'],
    projectArgsList: ['Chrome'],
  });

  assert.strictEqual(invocation.command, process.execPath);
  assert.strictEqual(invocation.cliPath, resolvePlaywrightCli());
  assert.deepStrictEqual(invocation.args, [
    resolvePlaywrightCli(),
    'test',
    'tests/responsive.layout.spec.js',
    '--project=Chrome',
  ]);
  assert.ok(invocation.displayCommand.includes(resolvePlaywrightCli()));
});
