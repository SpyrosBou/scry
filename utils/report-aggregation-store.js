'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_PERSIST_ROOT = path.join(process.cwd(), 'test-results', '.aggregation-cache');

const ensureDirSync = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const encodeProjectKey = (name = 'default') => encodeURIComponent(String(name || 'default'));
const decodeProjectKey = (key = 'default') => {
  try {
    return decodeURIComponent(key);
  } catch (_error) {
    return 'default';
  }
};

const readJsonFile = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

const sortByIndex = (left, right) => (left.index || 0) - (right.index || 0);

const createAggregationStore = ({ persistRoot = DEFAULT_PERSIST_ROOT, runToken = null } = {}) => {
  const projects = new Map();
  const baseDir = runToken ? path.join(persistRoot, runToken) : null;

  const getProjectStore = (projectName = 'default') => {
    const key = projectName || 'default';
    if (!projects.has(key)) {
      projects.set(key, new Map());
    }
    return projects.get(key);
  };

  const persistReport = (projectName, report) => {
    if (!baseDir) return;
    const projectDir = path.join(baseDir, encodeProjectKey(projectName));
    ensureDirSync(projectDir);
    const index = report.index ?? 0;
    const fileName = `${String(index).padStart(3, '0')}.json`;
    try {
      fs.writeFileSync(path.join(projectDir, fileName), JSON.stringify(report, null, 2));
    } catch (_error) {
      // Ignore write errors; in-memory aggregation will still proceed for this worker.
    }
  };

const syncFromDisk = (projectName) => {
  if (!baseDir) return;
  const projectDir = path.join(baseDir, encodeProjectKey(projectName));
  if (!fs.existsSync(projectDir)) return;
  const entries = fs
    .readdirSync(projectDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJsonFile(path.join(projectDir, file)))
    .filter(Boolean)
    .sort(sortByIndex);
  if (entries.length === 0) return;
  const store = getProjectStore(projectName);
  entries.forEach((entry) => {
    const index = entry.index ?? store.size + 1;
    if (!store.has(index)) {
      store.set(index, entry);
    }
  });
};

  const record = (projectName, report) => {
    const store = getProjectStore(projectName);
    const index = report?.index ?? store.size + 1;
    const payload = { ...report, index };
    store.set(index, payload);
    persistReport(projectName, payload);
  };

  const readProjectReports = (projectName = 'default') => {
    syncFromDisk(projectName);
    const store = getProjectStore(projectName);
    return Array.from(store.values()).sort(sortByIndex);
  };

  const readAllProjects = () => {
    const keys = new Set(projects.keys());
    if (baseDir && fs.existsSync(baseDir)) {
      fs.readdirSync(baseDir, { withFileTypes: true }).forEach((entry) => {
        if (entry.isDirectory()) {
          keys.add(decodeProjectKey(entry.name));
        }
      });
    }
    return Array.from(keys);
  };

  const reset = ({ includePersisted = false } = {}) => {
    projects.clear();
    if (includePersisted && baseDir) {
      fs.rmSync(baseDir, { recursive: true, force: true });
    }
  };

  return { record, readProjectReports, readAllProjects, reset };
};

module.exports = { createAggregationStore };
