'use strict';

function resolvePlaywrightCli() {
  return require.resolve('@playwright/test/cli');
}

function buildPlaywrightTestArgs({
  testTargets = [],
  debug = false,
  projectArgsList = [],
  extraArgs = [],
} = {}) {
  const args = ['test', ...testTargets];

  if (debug) args.push('--debug');
  for (const projectName of projectArgsList) {
    args.push(`--project=${projectName}`);
  }
  args.push(...extraArgs);

  return args;
}

function buildPlaywrightInvocation({
  testTargets = [],
  debug = false,
  projectArgsList = [],
  extraArgs = [],
} = {}) {
  const cliPath = resolvePlaywrightCli();
  const playwrightArgs = buildPlaywrightTestArgs({
    testTargets,
    debug,
    projectArgsList,
    extraArgs,
  });

  return {
    command: process.execPath,
    args: [cliPath, ...playwrightArgs],
    displayCommand: `node ${[cliPath, ...playwrightArgs].join(' ')}`,
    playwrightArgs,
    cliPath,
  };
}

module.exports = {
  buildPlaywrightInvocation,
  buildPlaywrightTestArgs,
  resolvePlaywrightCli,
};
