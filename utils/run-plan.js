'use strict';

const fs = require('fs');
const path = require('path');

const toPosixPath = (value) => value.split(path.sep).join('/');

const cloneSiteConfig = (siteConfig) => JSON.parse(JSON.stringify(siteConfig || {}));

function normaliseSpecPattern(specInput, { cwd = process.cwd(), fileExists = fs.existsSync } = {}) {
  const raw = String(specInput || '').trim();
  if (!raw) return null;

  const hasGlob = (() => {
    const globChars = new Set(['*', '?', '[', ']', '{', '}']);
    for (const ch of raw) {
      if (globChars.has(ch)) return true;
    }
    return false;
  })();

  const resolveRelative = (candidate) => {
    const absolute = path.resolve(cwd, candidate);
    if (fileExists(absolute)) {
      return toPosixPath(path.relative(cwd, absolute) || candidate);
    }
    return null;
  };

  if (path.isAbsolute(raw)) {
    return toPosixPath(path.relative(cwd, raw) || raw);
  }

  const direct = resolveRelative(raw);
  if (direct) {
    return direct;
  }

  if (!raw.startsWith('tests/')) {
    const nested = resolveRelative(path.join('tests', raw));
    if (nested) {
      return nested;
    }
  }

  if (!hasGlob && !raw.startsWith('tests/')) {
    return toPosixPath(path.join('tests', raw));
  }

  return toPosixPath(raw);
}

function applyPageLimit(siteConfig, limit) {
  const nextSiteConfig = cloneSiteConfig(siteConfig);
  const result = {
    siteConfig: nextSiteConfig,
    appliedPageLimit: null,
    message: null,
  };

  if (limit == null) {
    return result;
  }

  const rawLimit = String(limit).trim().toLowerCase();
  const unlimitedTokens = new Set(['all', 'infinite', 'infinity']);
  if (rawLimit !== '' && !unlimitedTokens.has(rawLimit)) {
    const limitNumber = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(limitNumber) && limitNumber > 0) {
      nextSiteConfig.testPages = Array.isArray(nextSiteConfig.testPages)
        ? nextSiteConfig.testPages.slice(0, limitNumber)
        : [];
      result.appliedPageLimit = limitNumber;
      result.message = `ℹ️  Page cap applied: first ${limitNumber} page(s) will be tested.`;
    } else {
      result.message = '⚠️  Ignoring invalid page cap; all pages will be tested.';
    }
  } else {
    result.message = 'ℹ️  Page cap disabled; all available pages will be tested.';
  }

  return result;
}

function listSpecEntries({ testsDir = path.join(process.cwd(), 'tests') } = {}) {
  return fs
    .readdirSync(testsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.js'))
    .map((entry) => path.join('tests', entry.name));
}

function selectSpecTargets(options = {}, { testEntries = null, cwd = process.cwd() } = {}) {
  const specFilters = Array.isArray(options.specs) ? options.specs.filter(Boolean) : [];
  const requestedSpecs = Array.from(
    new Set(specFilters.map((spec) => normaliseSpecPattern(spec, { cwd })).filter(Boolean))
  );

  if (requestedSpecs.length > 0) {
    return {
      testTargets: requestedSpecs,
      requestedSpecs,
    };
  }

  const entries = Array.isArray(testEntries) ? testEntries : listSpecEntries();
  const groupExplicitlySelected =
    options.visual ||
    options.responsive ||
    options.functionality ||
    options.accessibility ||
    options.allGroups;

  const runAllGroups = options.allGroups || !groupExplicitlySelected;
  const selectedTests = new Set();

  for (const file of entries) {
    const baseName = path.basename(file);
    const isVisual = baseName.startsWith('visual.');
    const isResponsiveStructure = baseName.startsWith('responsive.') && !/a11y/i.test(baseName);
    const isFunctionality = baseName.startsWith('functionality.');
    const isAccessibility = /accessibility|a11y/i.test(baseName);

    if (runAllGroups) {
      selectedTests.add(file);
      continue;
    }

    if (options.visual && isVisual) {
      selectedTests.add(file);
      continue;
    }
    if (options.responsive && isResponsiveStructure) {
      selectedTests.add(file);
      continue;
    }
    if (options.functionality && isFunctionality) {
      selectedTests.add(file);
      continue;
    }
    if (options.accessibility && isAccessibility) {
      selectedTests.add(file);
    }
  }

  return {
    testTargets: selectedTests.size > 0 ? Array.from(selectedTests) : ['tests'],
    requestedSpecs,
  };
}

function selectProjects(projectInput) {
  const projectInputRaw = Array.isArray(projectInput)
    ? projectInput
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .join(',')
    : typeof projectInput === 'string'
      ? projectInput.trim()
      : projectInput === true
        ? 'Chrome'
        : '';
  const usingDefaultProject = !projectInputRaw;
  const projectSpecifier = usingDefaultProject ? 'Chrome' : projectInputRaw;
  const projectArgsList =
    projectSpecifier.toLowerCase() === 'all'
      ? []
      : projectSpecifier
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);

  return {
    usingDefaultProject,
    projectSpecifier,
    projectArgsList,
    message:
      usingDefaultProject && projectSpecifier.toLowerCase() !== 'all'
        ? 'ℹ️  Defaulting to Chrome project (override with --browsers)'
        : projectSpecifier.toLowerCase() === 'all'
          ? 'ℹ️  Running across all configured Playwright projects'
          : null,
  };
}

function prepareRunManifestPayload({
  siteName,
  siteConfig,
  appliedPageLimit,
  projectArgsList,
  projectSpecifier,
  testTargets,
  requestedSpecs,
}) {
  let resolvedProjects;
  if (projectSpecifier && projectSpecifier.toLowerCase() === 'all') {
    resolvedProjects = ['all'];
  } else if (projectArgsList.length > 0) {
    resolvedProjects = [...projectArgsList];
  } else {
    resolvedProjects = ['Chrome'];
  }

  return {
    timestamp: new Date().toISOString(),
    limits: {
      pageLimit: appliedPageLimit != null ? appliedPageLimit : null,
    },
    site: {
      name: siteName,
      title: siteConfig.name,
      baseUrl: siteConfig.baseUrl,
    },
    siteConfig: cloneSiteConfig(siteConfig),
    pages: Array.isArray(siteConfig.testPages) ? [...siteConfig.testPages] : [],
    specs: Array.isArray(testTargets) ? [...testTargets] : [],
    requestedSpecs: Array.isArray(requestedSpecs) ? [...requestedSpecs] : [],
    projects: resolvedProjects,
  };
}

module.exports = {
  applyPageLimit,
  cloneSiteConfig,
  normaliseSpecPattern,
  prepareRunManifestPayload,
  selectProjects,
  selectSpecTargets,
  toPosixPath,
};
