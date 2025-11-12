'use strict';

const createAggregationStore = () => {
  const projects = new Map();

  const getProjectStore = (projectName = 'default') => {
    const key = projectName || 'default';
    if (!projects.has(key)) {
      projects.set(key, new Map());
    }
    return projects.get(key);
  };

  const record = (projectName, report) => {
    const store = getProjectStore(projectName);
    const index = report?.index ?? store.size + 1;
    store.set(index, { ...report });
  };

  const readProjectReports = (projectName = 'default') => {
    const store = projects.get(projectName || 'default');
    if (!store) return [];
    return Array.from(store.values()).sort((a, b) => (a.index || 0) - (b.index || 0));
  };

  const readAllProjects = () => Array.from(projects.keys());

  const reset = () => {
    projects.clear();
  };

  return { record, readProjectReports, readAllProjects, reset };
};

module.exports = { createAggregationStore };
