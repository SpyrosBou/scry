#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { ensureEmptyDir, deleteOlderThan, pruneOldDirectories } = require('../../utils/fs-cleaner');

// Removes or prunes Playwright artifacts (reports, manifests, test results).

const cmd = process.argv[2];

switch (cmd) {
  case 'clean-test-results': {
    ensureEmptyDir(path.join(process.cwd(), 'test-results'));
    console.log('Cleaned all test results');
    break;
  }
  case 'clean-reports': {
    const reportsDir = path.join(process.cwd(), 'reports');
    const args = process.argv.slice(3);
    const wipeAll = args.includes('--all') || args.includes('-a');

    if (!fs.existsSync(reportsDir)) {
      console.log('No reports directory found.');
      break;
    }

    if (wipeAll) {
      ensureEmptyDir(reportsDir);
      console.log('Removed all reports.');
      break;
    }

    const { removed, kept } = pruneOldDirectories(reportsDir, 10);
    if (removed.length === 0) {
      console.log('No reports removed (10 most recent preserved).');
    } else {
      console.log(`Removed ${removed.length} report folder(s): ${removed.join(', ')}`);
    }
    if (kept.length > 0) {
      console.log(`Current reports retained: ${kept.join(', ')}`);
    }
    break;
  }
  case 'clean-manifests': {
    const manifestsDir = path.join(process.cwd(), 'reports', 'run-manifests');
    const days = Number.parseInt(process.argv[3] || '15', 10) || 15;
    if (!fs.existsSync(manifestsDir)) {
      console.log('No run manifests directory found.');
      break;
    }
    deleteOlderThan(manifestsDir, days);
    console.log(`Removed run manifests older than ${days} day(s).`);
    break;
  }
  default:
    console.log('Unknown command');
    process.exit(1);
}
