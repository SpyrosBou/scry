'use strict';

const splitTypedNotes = (notes = []) => {
  const entries = Array.isArray(notes) ? notes : [];
  return {
    warnings: entries.filter((note) => note.type === 'warning').map((note) => note.message),
    notes: entries.filter((note) => note.type !== 'warning').map((note) => note.message),
  };
};

const buildBrokenLinkMessage = (issue) => {
  if (issue.error) {
    return `Request ${issue.method || 'HEAD'} failed for ${issue.url} (${issue.error})`;
  }
  if (issue.status) {
    return `Received ${issue.status} for ${issue.url} (via ${issue.method || 'HEAD'})`;
  }
  return `Broken link detected: ${issue.url}`;
};

const classifyLinkPage = (entry, { maxPerPage } = {}) => {
  const brokenEntries = Array.isArray(entry.broken) ? entry.broken : [];
  const notes = [];
  if (entry.status && entry.status !== 200) {
    notes.push(`Navigation returned HTTP ${entry.status}; link checks skipped.`);
  } else if ((entry.totalLinks || 0) === 0) {
    notes.push('No <a> elements detected on this page.');
  } else if (entry.uniqueChecked < entry.totalLinks) {
    notes.push(
      `Checked ${entry.uniqueChecked} of ${entry.totalLinks} links (cap maxPerPage=${maxPerPage}).`
    );
  }

  return {
    page: entry.page,
    status: entry.status ?? null,
    totalLinks: entry.totalLinks,
    uniqueChecked: entry.uniqueChecked,
    brokenCount: brokenEntries.length,
    gating: brokenEntries.map(buildBrokenLinkMessage),
    warnings: [],
    advisories: [],
    notes,
    broken: brokenEntries,
  };
};

const classifyInteractivePage = (entry) => {
  const { warnings, notes } = splitTypedNotes(entry.notes);
  const gating = [
    ...(Array.isArray(entry.consoleErrors) ? entry.consoleErrors : []).map(
      (error) => `Console error: ${error.message}`
    ),
    ...(Array.isArray(entry.resourceErrors) ? entry.resourceErrors : []).map((error) => {
      if (error.status) {
        return `Resource ${error.type || 'response'} ${error.status} on ${error.url}`;
      }
      if (error.failure) {
        return `Resource ${error.type || 'request'} failed (${error.failure}) on ${error.url}`;
      }
      return `Resource ${error.type || 'request'} issue on ${error.url}`;
    }),
  ];

  return {
    page: entry.page,
    status: entry.status,
    consoleErrors: Array.isArray(entry.consoleErrors) ? entry.consoleErrors : [],
    resourceErrors: Array.isArray(entry.resourceErrors) ? entry.resourceErrors : [],
    gating,
    warnings,
    advisories: [],
    notes,
  };
};

const classifyAvailabilityResult = (entry) => {
  const { warnings, notes } = splitTypedNotes(entry.notes);
  const gating = [];
  if (entry.status === null || entry.status === undefined) {
    if (entry.error) gating.push(entry.error);
  } else if (entry.status >= 500) {
    gating.push(`Server responded with ${entry.status}; page unavailable.`);
  }

  const missingStructural = [];
  if (entry.elements) {
    Object.entries(entry.elements).forEach(([key, value]) => {
      if (value === false) {
        const message = `${key} landmark missing`;
        missingStructural.push(message);
        gating.push(message);
      }
    });
  }

  return {
    page: entry.page,
    status: entry.status,
    elements: entry.elements || null,
    gating,
    warnings,
    advisories: [],
    notes,
    missingStructural,
  };
};

const classifyHttpResult = (entry) => {
  const failedChecks = (Array.isArray(entry.checks) ? entry.checks : [])
    .filter((check) => !check.passed)
    .map((check) => ({
      label: check.label,
      details: check.details || null,
    }));
  const gating = [];
  const warnings = [];
  if ((entry.status || 0) >= 500) {
    gating.push(`Received ${entry.status} ${entry.statusText || ''}`.trim());
  } else if ((entry.status || 0) >= 400) {
    warnings.push(`Client error ${entry.status} ${entry.statusText || ''}`.trim());
  }
  if (failedChecks.length > 0) {
    gating.push(...failedChecks.map((check) => `Failed check: ${check.label}`));
  }
  if (entry.error) {
    gating.push(entry.error);
  }

  const notes = [];
  if ((entry.status || 0) >= 300 && (entry.status || 0) < 400 && entry.location) {
    notes.push(`Redirects to ${entry.location}`);
  }

  return {
    page: entry.page,
    status: entry.status,
    statusText: entry.statusText,
    redirectLocation: entry.location || null,
    failedChecks,
    gating,
    warnings,
    advisories: [],
    notes,
  };
};

const roundMetric = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
};

const classifyPerformanceResult = (entry, breaches = []) => {
  const gating = breaches.map(
    (breach) =>
      `${breach.metric} exceeded budget (${Math.round(breach.value)}ms > ${Math.round(
        breach.budget
      )}ms)`
  );
  if (entry.error) {
    gating.push(entry.error);
  }

  const notes = [];
  const loadTime = roundMetric(entry.loadTime);
  if (Number.isFinite(loadTime)) {
    notes.push(`Observed load time: ${loadTime}ms`);
  } else if (entry.status && entry.status !== 200) {
    notes.push(`Performance metrics skipped because navigation returned ${entry.status}.`);
  }

  return {
    page: entry.page,
    metrics: {
      loadTimeMs: roundMetric(entry.loadTime),
      domContentLoadedMs: roundMetric(entry.domContentLoaded),
      loadCompleteMs: roundMetric(entry.loadComplete),
      firstContentfulPaintMs: roundMetric(entry.firstContentfulPaint),
      firstPaintMs: roundMetric(entry.firstPaint),
    },
    breaches,
    gating,
    warnings: [],
    advisories: [],
    notes,
  };
};

const parseDiffMetrics = (message) => {
  if (typeof message !== 'string' || message.length === 0) return null;

  const pixelsRegex =
    /([\d,]+)\s+pixels\s+\(ratio\s+([\d.]+)\s+of all image pixels\) are different/gi;
  let pixelsMatch;
  let lastPixelsMatch = null;
  while ((pixelsMatch = pixelsRegex.exec(message))) {
    lastPixelsMatch = pixelsMatch;
  }

  const dimensionsRegex =
    /Expected an image\s+(\d+)px by (\d+)px,\s+received\s+(\d+)px by (\d+)px/gi;
  let dimMatch;
  let lastDimensionsMatch = null;
  while ((dimMatch = dimensionsRegex.exec(message))) {
    lastDimensionsMatch = dimMatch;
  }

  if (!lastPixelsMatch && !lastDimensionsMatch) return null;

  const metrics = {};
  if (lastPixelsMatch) {
    metrics.pixelDiff = Number(lastPixelsMatch[1].replace(/,/g, ''));
    metrics.pixelRatio = Number(lastPixelsMatch[2]);
  }
  if (lastDimensionsMatch) {
    metrics.expectedSize = {
      width: Number(lastDimensionsMatch[1]),
      height: Number(lastDimensionsMatch[2]),
    };
    metrics.actualSize = {
      width: Number(lastDimensionsMatch[3]),
      height: Number(lastDimensionsMatch[4]),
    };
  }

  return metrics;
};

const classifyVisualSummary = (entry) => {
  const diffMetrics = entry.diffMetrics || {};
  const pixelDiff = Number.isFinite(diffMetrics.pixelDiff) ? diffMetrics.pixelDiff : null;
  const pixelRatio = Number.isFinite(diffMetrics.pixelRatio) ? diffMetrics.pixelRatio : null;
  const deltaPercent = pixelRatio !== null ? Math.round(pixelRatio * 10000) / 100 : null;
  const thresholdPercent =
    typeof entry.threshold === 'number' ? Math.round(entry.threshold * 10000) / 100 : null;
  const gating =
    entry.result === 'diff'
      ? [
          deltaPercent !== null && thresholdPercent !== null
            ? `Visual delta ${deltaPercent}% exceeds ${thresholdPercent}% threshold.`
            : 'Visual difference exceeded configured threshold.',
        ]
      : [];
  const notes = [];
  if (entry.result === 'pass') {
    notes.push('Screenshot matched baseline within configured threshold.');
  } else if (entry.result === 'skipped' && entry.status) {
    notes.push(`Screenshot skipped after HTTP ${entry.status}.`);
  } else if (entry.error) {
    notes.push(entry.error);
  }

  return {
    ...entry,
    diffMetrics,
    pixelDiff,
    pixelRatio,
    deltaPercent,
    thresholdPercent,
    gating,
    warnings: [],
    advisories: [],
    notes,
    artifactRefs: {
      baseline: entry.artifacts?.baseline?.name || null,
      actual: entry.artifacts?.actual?.name || null,
      diff: entry.artifacts?.diff?.name || null,
    },
  };
};

module.exports = {
  buildBrokenLinkMessage,
  classifyAvailabilityResult,
  classifyHttpResult,
  classifyInteractivePage,
  classifyLinkPage,
  classifyPerformanceResult,
  classifyVisualSummary,
  parseDiffMetrics,
  roundMetric,
  splitTypedNotes,
};
