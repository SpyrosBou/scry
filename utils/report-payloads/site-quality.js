'use strict';

const { createRunSummaryPayload, createPageSummaryPayload } = require('../report-schema');
const { buildRunSummaryPayload, buildPageSummaryPayload } = require('../report-summary-builder');
const { slugifyIdentifier } = require('../reporting-helpers');
const {
  classifyAvailabilityResult,
  classifyHttpResult,
  classifyInteractivePage,
  classifyLinkPage,
  classifyPerformanceResult,
  classifyVisualSummary,
} = require('../report-classification/site-quality');

const LINK_CHECK_DEFAULTS = {
  maxPerPage: 20,
  timeoutMs: 5000,
  followRedirects: true,
  methodFallback: true,
};

const resolveLinkCheckConfig = (activeSiteConfig) => {
  const linkCheckConfig = {
    ...LINK_CHECK_DEFAULTS,
    ...(typeof activeSiteConfig.linkCheck === 'object' && activeSiteConfig.linkCheck !== null
      ? activeSiteConfig.linkCheck
      : {}),
  };

  const timeoutMsValue = Number(linkCheckConfig.timeoutMs);
  linkCheckConfig.timeoutMs =
    Number.isFinite(timeoutMsValue) && timeoutMsValue > 0
      ? timeoutMsValue
      : LINK_CHECK_DEFAULTS.timeoutMs;

  const maxPerPageValue = Number(linkCheckConfig.maxPerPage);
  linkCheckConfig.maxPerPage =
    Number.isFinite(maxPerPageValue) && maxPerPageValue > 0
      ? Math.floor(maxPerPageValue)
      : LINK_CHECK_DEFAULTS.maxPerPage;

  linkCheckConfig.followRedirects = linkCheckConfig.followRedirects !== false;
  linkCheckConfig.methodFallback = linkCheckConfig.methodFallback !== false;
  return linkCheckConfig;
};

const buildLinksSchemaPayloads = (pages, brokenLinks, projectName, config = {}) => {
  if (!Array.isArray(pages) || pages.length === 0) return null;

  const normalisedConfig = {
    maxPerPage: Number.isFinite(config.maxPerPage) ? config.maxPerPage : null,
    timeoutMs: Number.isFinite(config.timeoutMs) ? config.timeoutMs : null,
    followRedirects: config.followRedirects !== false,
    methodFallback: config.methodFallback !== false,
  };
  const maxPerPageLabel =
    normalisedConfig.maxPerPage ?? LINK_CHECK_DEFAULTS.maxPerPage ?? undefined;

  const totalLinksFound = pages.reduce((total, entry) => total + (entry.totalLinks || 0), 0);
  const totalLinksChecked = (() => {
    const checkedUrls = pages.flatMap((entry) =>
      Array.isArray(entry.checkedUrls) ? entry.checkedUrls.filter(Boolean) : []
    );
    if (checkedUrls.length === 0) {
      return pages.reduce((total, entry) => total + (entry.uniqueChecked || 0), 0);
    }
    return new Set(checkedUrls).size;
  })();
  const pageDetails = pages.map((entry) =>
    classifyLinkPage(entry, {
      maxPerPage: maxPerPageLabel ?? entry.uniqueChecked,
    })
  );
  const pagesWithBroken = pageDetails.filter((entry) => entry.brokenCount > 0).length;
  const projectSlug = slugifyIdentifier(projectName, { fallback: 'root' });

  const runPayload = createRunSummaryPayload({
    baseName: `links-audit-${projectSlug}`,
    title: 'Internal link audit summary',
    overview: {
      totalPages: pages.length,
      totalLinksFound,
      uniqueLinksChecked: totalLinksChecked,
      brokenLinksDetected: brokenLinks.length,
      pagesWithBrokenLinks: pagesWithBroken,
      pagesSkipped: pageDetails.filter((entry) => entry.status && entry.status !== 200).length,
      maxChecksPerPage: normalisedConfig.maxPerPage,
      pagesWithGatingIssues: pageDetails.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.links.internal',
      summaryType: 'internal-links',
      projectName,
      scope: 'project',
      followRedirects: normalisedConfig.followRedirects,
      methodFallback: normalisedConfig.methodFallback,
      timeoutMs: normalisedConfig.timeoutMs,
    },
  });

  runPayload.details = {
    pages: pageDetails.map((entry) => ({
      page: entry.page,
      status: entry.status,
      totalLinks: entry.totalLinks,
      uniqueChecked: entry.uniqueChecked,
      brokenCount: entry.brokenCount,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const maxBrokenDetails = 20;
  const pagePayloads = pageDetails.map((entry) => {
    const brokenSample = entry.broken.slice(0, maxBrokenDetails).map((issue) => ({
      url: issue.url,
      status: issue.status ?? null,
      methodTried: issue.method || null,
      error: issue.error || null,
    }));

    return createPageSummaryPayload({
      baseName: `links-audit-${projectSlug}-${slugifyIdentifier(entry.page, { fallback: 'root' })}`,
      title: `Internal links – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        status: entry.status,
        totalLinks: entry.totalLinks,
        uniqueChecked: entry.uniqueChecked,
        brokenCount: entry.brokenCount,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
        brokenSample,
      },
      metadata: {
        spec: 'functionality.links.internal',
        summaryType: 'internal-links',
        projectName,
      },
    });
  });

  return { runPayload, pagePayloads };
};

const buildInteractiveSchemaPayloads = ({ pages, resourceBudget, projectName }) => {
  if (!Array.isArray(pages) || pages.length === 0) return null;

  const enrichedPages = pages.map(classifyInteractivePage);
  const totalConsoleErrors = enrichedPages.reduce(
    (total, entry) => total + entry.consoleErrors.length,
    0
  );
  const totalResourceErrors = enrichedPages.reduce(
    (total, entry) => total + entry.resourceErrors.length,
    0
  );
  const pagesWithConsoleErrors = enrichedPages.filter(
    (entry) => entry.consoleErrors.length > 0
  ).length;
  const pagesWithResourceErrors = enrichedPages.filter(
    (entry) => entry.resourceErrors.length > 0
  ).length;
  const pagesWithWarnings = enrichedPages.filter((entry) => entry.warnings.length > 0).length;
  const pagesWithGatingIssues = enrichedPages.filter((entry) => entry.gating.length > 0).length;

  const runPayload = buildRunSummaryPayload({
    prefix: 'interactive',
    key: projectName,
    title: 'Interactive smoke summary',
    overview: {
      totalPages: pages.length,
      totalConsoleErrors,
      totalResourceErrors,
      pagesWithConsoleErrors,
      pagesWithResourceErrors,
      pagesWithGatingIssues,
      pagesWithWarnings,
      resourceErrorBudget: resourceBudget,
      budgetExceeded: totalResourceErrors > resourceBudget,
    },
    metadata: {
      spec: 'functionality.interactive.smoke',
      summaryType: 'interactive',
      projectName,
      scope: 'project',
    },
  });

  runPayload.details = {
    pages: enrichedPages.map((entry) => ({
      page: entry.page,
      status: entry.status,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
      consoleErrors: entry.consoleErrors.length,
      resourceErrors: entry.resourceErrors.length,
    })),
  };

  const maxSample = 10;
  const pagePayloads = enrichedPages.map((entry) => {
    const consoleSample = entry.consoleErrors.slice(0, maxSample).map((error) => ({
      message: error.message,
      url: error.url || null,
    }));
    const resourceSample = entry.resourceErrors.slice(0, maxSample).map((error) => ({
      type: error.type,
      status: error.status ?? null,
      method: error.method || null,
      url: error.url,
      failure: error.failure || null,
    }));

    return buildPageSummaryPayload({
      prefix: 'interactive',
      projectName,
      viewport: projectName,
      page: entry.page,
      title: `Interactive checks – ${entry.page}`,
      summary: {
        status: entry.status,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
        consoleErrors: entry.consoleErrors.length,
        resourceErrors: entry.resourceErrors.length,
        consoleSample,
        resourceSample,
      },
      metadata: {
        spec: 'functionality.interactive.smoke',
        summaryType: 'interactive',
        projectName,
        resourceErrorBudget: resourceBudget,
      },
    });
  });

  return { runPayload, pagePayloads };
};

const buildAvailabilitySchemaPayloads = (results, projectName) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  const runBaseName = `infra-availability-${slugifyIdentifier(projectName, { fallback: 'section' })}`;
  const enrichedResults = results.map(classifyAvailabilityResult);
  const pagesWithWarnings = enrichedResults.filter((entry) => entry.warnings.length > 0).length;
  const pagesWithErrors = enrichedResults.filter((entry) => (entry.status || 0) >= 400).length;
  const missingElements = enrichedResults.reduce(
    (total, entry) => total + entry.missingStructural.length,
    0
  );

  const runPayload = createRunSummaryPayload({
    baseName: runBaseName,
    title: 'Availability & uptime summary',
    overview: {
      totalPages: enrichedResults.length,
      pagesWithErrors,
      pagesWithWarnings,
      missingStructureElements: missingElements,
      pagesWithGatingIssues: enrichedResults.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.infrastructure.health',
      summaryType: 'availability',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
    },
  });

  runPayload.details = {
    pages: enrichedResults.map((entry) => ({
      page: entry.page,
      status: entry.status,
      elements: entry.elements || null,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedResults.map((entry) =>
    createPageSummaryPayload({
      baseName: runBaseName,
      title: `Availability – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        status: entry.status,
        elements: entry.elements || null,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'functionality.infrastructure.health',
        summaryType: 'availability',
        projectName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildHttpSchemaPayloads = (results, projectName) => {
  if (!Array.isArray(results) || results.length === 0) return null;

  const runBaseName = `infra-http-${slugifyIdentifier(projectName, { fallback: 'section' })}`;
  const enrichedResults = results.map(classifyHttpResult);
  const runPayload = createRunSummaryPayload({
    baseName: runBaseName,
    title: 'HTTP response validation summary',
    overview: {
      totalPages: enrichedResults.length,
      success2xx: enrichedResults.filter((entry) => entry.status === 200).length,
      redirects: enrichedResults.filter((entry) => entry.status >= 300 && entry.status < 400)
        .length,
      errors: enrichedResults.filter((entry) => (entry.status || 0) >= 400).length,
      pagesWithFailedChecks: enrichedResults.filter((entry) => entry.failedChecks.length > 0)
        .length,
      pagesWithGatingIssues: enrichedResults.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.infrastructure.health',
      summaryType: 'http',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
    },
  });

  runPayload.details = {
    pages: enrichedResults.map((entry) => ({
      page: entry.page,
      status: entry.status,
      statusText: entry.statusText,
      redirectLocation: entry.redirectLocation,
      failedChecks: entry.failedChecks,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
    })),
  };

  const pagePayloads = enrichedResults.map((entry) =>
    createPageSummaryPayload({
      baseName: runBaseName,
      title: `HTTP validation – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        status: entry.status,
        statusText: entry.statusText,
        redirectLocation: entry.redirectLocation,
        failedChecks: entry.failedChecks,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'functionality.infrastructure.health',
        summaryType: 'http',
        projectName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildPerformanceSchemaPayloads = (data, breaches, projectName) => {
  if (!Array.isArray(data) || data.length === 0) return null;

  const validLoadTimes = data
    .map((entry) => Number(entry.loadTime))
    .filter((value) => Number.isFinite(value));
  const averageLoadTime =
    validLoadTimes.length > 0
      ? validLoadTimes.reduce((acc, entry) => acc + entry, 0) / validLoadTimes.length
      : 0;

  const breachMap = new Map();
  breaches.forEach((entry) => {
    const list = breachMap.get(entry.page) || [];
    list.push({ metric: entry.metric, value: entry.value, budget: entry.budget });
    breachMap.set(entry.page, list);
  });

  const runBaseName = `infra-performance-${slugifyIdentifier(projectName, { fallback: 'section' })}`;
  const pageSummaries = data.map((entry) =>
    classifyPerformanceResult(entry, breachMap.get(entry.page) || [])
  );

  const runPayload = createRunSummaryPayload({
    baseName: runBaseName,
    title: 'Performance monitoring summary',
    overview: {
      pagesSampled: pageSummaries.length,
      averageLoadTimeMs: Math.round(averageLoadTime),
      budgetBreaches: breaches.length,
      pagesWithGatingIssues: pageSummaries.filter((entry) => entry.gating.length > 0).length,
    },
    metadata: {
      spec: 'functionality.infrastructure.health',
      summaryType: 'performance',
      projectName,
      scope: 'project',
      suppressPageEntries: true,
    },
  });

  runPayload.details = {
    pages: pageSummaries.map((entry) => ({
      page: entry.page,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
      budgetBreaches: entry.breaches,
      metrics: entry.metrics,
    })),
  };

  const pagePayloads = pageSummaries.map((entry) =>
    createPageSummaryPayload({
      baseName: runBaseName,
      title: `Performance – ${entry.page}`,
      page: entry.page,
      viewport: projectName,
      summary: {
        loadTimeMs: entry.metrics.loadTimeMs,
        domContentLoadedMs: entry.metrics.domContentLoadedMs,
        loadCompleteMs: entry.metrics.loadCompleteMs,
        firstContentfulPaintMs: entry.metrics.firstContentfulPaintMs,
        firstPaintMs: entry.metrics.firstPaintMs,
        budgetBreaches: entry.breaches,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'functionality.infrastructure.health',
        summaryType: 'performance',
        projectName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

const buildVisualSchemaPayloads = ({ summaries, viewportName, projectName }) => {
  if (!Array.isArray(summaries) || summaries.length === 0) return null;

  const enrichedSummaries = summaries.map(classifyVisualSummary);
  const diffs = enrichedSummaries.filter((entry) => entry.result === 'diff');
  const passes = enrichedSummaries.filter((entry) => entry.result === 'pass').length;
  const skipped = enrichedSummaries.filter((entry) => entry.result === 'skipped').length;
  const thresholds = Array.from(
    new Set(
      enrichedSummaries
        .map((entry) => (typeof entry.threshold === 'number' ? entry.threshold : null))
        .filter((value) => value !== null)
    )
  );

  const pixelDiffs = diffs
    .map((entry) => entry.pixelDiff)
    .filter((value) => Number.isFinite(value));
  const pixelRatios = diffs
    .map((entry) => entry.pixelRatio)
    .filter((value) => Number.isFinite(value));
  const deltaPercents = diffs
    .map((entry) => entry.deltaPercent)
    .filter((value) => Number.isFinite(value));

  const projectSlug = slugifyIdentifier(projectName, { fallback: 'item' });
  const viewportSlug = slugifyIdentifier(viewportName, { fallback: 'item' });
  const runPayload = createRunSummaryPayload({
    baseName: `visual-${projectSlug}-${viewportSlug}`,
    title: `Visual regression summary — ${viewportName}`,
    overview: {
      viewport: viewportName,
      totalPages: enrichedSummaries.length,
      passes,
      diffs: diffs.length,
      skipped,
      thresholdsUsed: thresholds,
      maxPixelDiff: pixelDiffs.length > 0 ? Math.max(...pixelDiffs) : null,
      maxPixelRatio: pixelRatios.length > 0 ? Math.max(...pixelRatios) : null,
      maxDeltaPercent: deltaPercents.length > 0 ? Math.max(...deltaPercents) : null,
      pagesWithGatingIssues: diffs.length,
      diffPages: diffs.map((entry) => entry.page),
    },
    metadata: {
      spec: 'visual.regression.snapshots',
      summaryType: 'visual',
      projectName,
      scope: 'project',
      viewport: viewportName,
    },
  });

  runPayload.details = {
    pages: enrichedSummaries.map((entry) => ({
      page: entry.page,
      status: entry.status ?? null,
      viewport: viewportName,
      result: entry.result,
      gating: entry.gating,
      warnings: entry.warnings,
      advisories: entry.advisories,
      notes: entry.notes,
      deltaPercent: entry.deltaPercent,
      thresholdPercent: entry.thresholdPercent,
      pixelDiff: entry.pixelDiff,
      artifacts: entry.artifactRefs,
    })),
  };

  const pagePayloads = enrichedSummaries.map((entry) =>
    createPageSummaryPayload({
      baseName: `visual-${projectSlug}-${viewportSlug}-${slugifyIdentifier(entry.page, {
        fallback: 'item',
      })}`,
      title: `Visual regression – ${entry.page} (${viewportName})`,
      page: entry.page,
      viewport: viewportName,
      summary: {
        status: entry.status ?? null,
        result: entry.result,
        threshold: entry.threshold,
        thresholdPercent: entry.thresholdPercent,
        pixelDiff: entry.pixelDiff,
        pixelRatio: entry.pixelRatio,
        deltaPercent: entry.deltaPercent,
        expectedSize: entry.diffMetrics.expectedSize || null,
        actualSize: entry.diffMetrics.actualSize || null,
        artifacts: entry.artifactRefs,
        screenshot: entry.screenshot || null,
        error: entry.error || null,
        gating: entry.gating,
        warnings: entry.warnings,
        advisories: entry.advisories,
        notes: entry.notes,
      },
      metadata: {
        spec: 'visual.regression.snapshots',
        summaryType: 'visual',
        projectName,
        viewport: viewportName,
      },
    })
  );

  return { runPayload, pagePayloads };
};

module.exports = {
  LINK_CHECK_DEFAULTS,
  buildAvailabilitySchemaPayloads,
  buildHttpSchemaPayloads,
  buildInteractiveSchemaPayloads,
  buildLinksSchemaPayloads,
  buildPerformanceSchemaPayloads,
  buildVisualSchemaPayloads,
  resolveLinkCheckConfig,
};
