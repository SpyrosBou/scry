const path = require('path');
const { removePath } = require('../../utils/fs-cleaner');

// Global Playwright setup hook that resets the artifacts dir before each run.

// Environment Variables:
// - A11Y_RUN_TOKEN: injected token reused across tests to group a11y failures.
// - PW_SKIP_RESULT_CLEAN: when set to "true" skips automatic artifact cleanup.

module.exports = async () => {
  if (!process.env.A11Y_RUN_TOKEN) {
    process.env.A11Y_RUN_TOKEN = String(Date.now());
  }

  if (String(process.env.PW_SKIP_RESULT_CLEAN || '').toLowerCase() === 'true') {
    console.log('⚠️  Skipping automatic result cleanup (PW_SKIP_RESULT_CLEAN=true).');
    return;
  }

  const cwd = process.cwd();
  const targets = ['playwright-report', 'test-results'];

  for (const target of targets) {
    const targetPath = path.join(cwd, target);
    try {
      removePath(targetPath, { throwOnError: true });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`⚠️  Failed to remove ${target}: ${error.message}`);
      }
    }
  }

  console.log('🧹 Cleared previous test artifacts');
};
