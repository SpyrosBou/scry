'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Discover report run directories sorted by most recent modification time.
 * @param {string} [reportsRoot=path.join(process.cwd(), 'reports')]
 * @returns {Array<{name: string, dir: string, mtime: number}>}
 */
function loadRunEntries(reportsRoot = path.join(process.cwd(), 'reports')) {
  if (!fs.existsSync(reportsRoot)) return [];

  return fs
    .readdirSync(reportsRoot)
    .map((name) => {
      const dir = path.join(reportsRoot, name);
      try {
        const stats = fs.statSync(dir);
        if (!stats.isDirectory()) return null;
        return {
          name,
          dir,
          mtime: stats.mtimeMs,
        };
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

module.exports = {
  loadRunEntries,
};
