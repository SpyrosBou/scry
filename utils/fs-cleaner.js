const fs = require('fs');
const path = require('path');

function removePath(targetPath, options = {}) {
  const { throwOnError = false } = options;
  if (!targetPath) return false;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 2 });
    return true;
  } catch (error) {
    if (throwOnError) throw error;
    return false;
  }
}

function ensureEmptyDir(dirPath, options = {}) {
  removePath(dirPath, options);
  fs.mkdirSync(dirPath, { recursive: true });
}

function deleteOlderThan(dirPath, days) {
  if (!dirPath || !fs.existsSync(dirPath) || days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const walk = (currentPath) => {
    if (!fs.existsSync(currentPath)) return;
    const stats = fs.statSync(currentPath);
    if (stats.isDirectory()) {
      for (const child of fs.readdirSync(currentPath)) {
        walk(path.join(currentPath, child));
      }
      if (currentPath !== dirPath && fs.readdirSync(currentPath).length === 0) {
        removePath(currentPath);
      }
      return;
    }
    if (stats.mtimeMs < cutoff) {
      removePath(currentPath);
    }
  };

  walk(dirPath);
}

function pruneOldDirectories(rootDir, keepCount = 10) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return { removed: [], kept: [] };
  }
  const entries = fs
    .readdirSync(rootDir)
    .map((name) => {
      const fullPath = path.join(rootDir, name);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          return { name, path: fullPath, mtime: stats.mtimeMs };
        }
      } catch (_error) {
        return null;
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);

  const toRemove = entries.slice(keepCount);
  toRemove.forEach((entry) => removePath(entry.path));

  return {
    removed: toRemove.map((entry) => entry.name),
    kept: entries.slice(0, keepCount).map((entry) => entry.name),
  };
}

module.exports = {
  removePath,
  ensureEmptyDir,
  deleteOlderThan,
  pruneOldDirectories,
};
