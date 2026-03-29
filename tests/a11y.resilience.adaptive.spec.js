const { test, expect } = require('../utils/test-fixtures');

test.use({ trace: 'off', video: 'off' });
const { safeNavigate, waitForPageStability } = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');
const {
  DEFAULT_ACCESSIBILITY_SAMPLE,
  selectAccessibilityTestPages,
  resolveAccessibilityMetadata,
  applyViewportMetadata,
} = require('../utils/a11y-shared');
const { runPageTasks, resolveConcurrencyLimit } = require('../utils/concurrency-helpers');

const REDUCED_MOTION_WCAG_REFERENCES = [
  { id: '2.2.2', name: 'Pause, Stop, Hide' },
  { id: '2.3.3', name: 'Animation from Interactions' },
];

const REFLOW_WCAG_REFERENCES = [
  { id: '1.4.4', name: 'Resize Text' },
  { id: '1.4.10', name: 'Reflow' },
];

const IFRAME_WCAG_REFERENCES = [
  { id: '1.3.1', name: 'Info and Relationships' },
  { id: '4.1.2', name: 'Name, Role, Value' },
];

const REDUCED_MOTION_THRESHOLD_MS = 150;
const MAX_OVERFLOW_TOLERANCE_PX = 16;
const RELOW_VIEWPORT = { width: 320, height: 900 };

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';

const reducedMotionEvaluationScript = () => {
  const matchesReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animations = document
    .getAnimations()
    .filter((animation) => animation.playState === 'running')
    .map((animation) => {
      const effect = animation.effect;
      const target = effect && 'target' in effect ? effect.target : null;
      const timing =
        effect && typeof effect.getComputedTiming === 'function' ? effect.getComputedTiming() : {};

      let selector = null;
      if (target) {
        const parts = [];
        if (target.id) {
          parts.push(`#${target.id}`);
        }
        const classList = Array.from(target.classList || []).slice(0, 3);
        if (!parts.length && classList.length) {
          parts.push(`.${classList.join('.')}`);
        }
        if (!parts.length) {
          parts.push(target.tagName ? target.tagName.toLowerCase() : 'element');
        }
        selector = parts.join('');
      }

      const duration = Number.isFinite(timing.duration) ? Math.round(timing.duration) : null;
      const delay = Number.isFinite(timing.delay) ? Math.round(timing.delay) : null;
      const iterations = Number.isFinite(timing.iterations) ? timing.iterations : 'infinite';

      return {
        type: animation.constructor?.name || 'Animation',
        name: animation.animationName || animation.id || null,
        selector,
        duration,
        delay,
        iterations,
        endTime: Number.isFinite(timing.endTime) ? Math.round(timing.endTime) : null,
        direction: timing.direction || 'normal',
        fill: timing.fill || 'none',
      };
    });

  const significantAnimations = animations.filter((animation) => {
    const duration = animation.duration || 0;
    const iterations = animation.iterations === 'infinite' ? Infinity : animation.iterations || 1;
    const totalDuration = duration * iterations;
    const isInfinite = iterations === Infinity || !Number.isFinite(totalDuration);
    const isLong = duration >= REDUCED_MOTION_THRESHOLD_MS;
    return isInfinite || isLong;
  });

  return {
    matchesReduce,
    animations,
    significantAnimations,
  };
};

const reflowEvaluationScript = () => {
  const viewportWidth = Math.round(window.innerWidth);
  const scrollWidth = Math.round(document.documentElement.scrollWidth);
  const horizontalOverflow = Math.max(0, scrollWidth - viewportWidth);

  const offenders = [];
  const elements = Array.from(document.querySelectorAll('body *')).slice(0, 400);
  for (const el of elements) {
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) continue;
    if (rect.right > viewportWidth + 1 || rect.left < -1) {
      const text = (el.innerText || el.textContent || '').trim().slice(0, 80);
      const classList = Array.from(el.classList || [])
        .slice(0, 3)
        .join('.');
      offenders.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: classList || null,
        text,
        rectRight: Math.round(rect.right),
        rectLeft: Math.round(rect.left),
      });
      if (offenders.length >= 8) break;
    }
  }

  return {
    viewportWidth,
    scrollWidth,
    horizontalOverflow,
    offenders,
  };
};

const isSameOrigin = (frameUrl, baseUrl) => {
  try {
    if (!frameUrl || frameUrl === 'about:blank') return true;
    const frameOrigin = new URL(frameUrl).origin;
    const baseOrigin = new URL(baseUrl).origin;
    return frameOrigin === baseOrigin;
  } catch (_) {
    return false;
  }
};

async function runReducedMotionAudit(page, siteConfig, pagePath) {
  const report = {
    page: pagePath,
    matchesReduce: true,
    animations: [],
    significant: [],
    gating: [],
    warnings: [],
    advisories: [],
    notes: [],
  };

  try {
    await page.emulateMedia({ reducedMotion: 'reduce' }).catch(() => {});

    const response = await safeNavigate(page, `${siteConfig.baseUrl}${pagePath}`);
    if (!response || response.status() >= 400) {
      report.gating.push(
        `Received HTTP status ${response ? response.status() : 'unknown'} when loading page.`
      );
      return report;
    }

    const stability = await waitForPageStability(page);
    if (!stability.ok) {
      report.gating.push(`Page did not reach a stable state: ${stability.message}`);
      return report;
    }

    const motionData = await page.evaluate(reducedMotionEvaluationScript);
    report.matchesReduce = motionData.matchesReduce;
    report.animations = motionData.animations;
    report.significant = motionData.significantAnimations;

    if (!motionData.matchesReduce) {
      report.advisories.push(
        'prefers-reduced-motion media query did not match; site may lack reduced motion styles.'
      );
    }

    motionData.significantAnimations.forEach((animation) => {
      const label = animation.name || animation.type || 'animation';
      const iterations = animation.iterations === 'infinite' ? Infinity : animation.iterations || 1;
      const duration = animation.duration || 0;
      const totalDuration = iterations === Infinity ? Infinity : duration * iterations;
      const isBlocking = iterations === Infinity || totalDuration >= 5000;
      const message = `${label} on ${animation.selector || 'element'} runs ${
        iterations === Infinity ? 'indefinitely' : `${totalDuration}ms`
      } despite reduced motion preference.`;
      if (isBlocking) {
        report.gating.push(message);
      } else {
        report.advisories.push(message);
      }
    });

    if (!motionData.animations.length) {
      report.advisories.push(
        'No running animations detected; ensure interactive components still function as expected.'
      );
    }

    report.notes.push(
      `Detected ${report.animations.length} animations (${report.significant.length} significant) with reduced motion preference ${
        report.matchesReduce ? 'respected' : 'ignored'
      }.`
    );
  } catch (error) {
    report.gating.push(`Navigation failed: ${error.message}`);
  } finally {
    await page.emulateMedia(null).catch(() => {});
  }

  return report;
}

async function runReflowAudit(page, siteConfig, pagePath) {
  const report = {
    page: pagePath,
    viewportWidth: RELOW_VIEWPORT.width,
    scrollWidth: RELOW_VIEWPORT.width,
    horizontalOverflow: 0,
    offenders: [],
    gating: [],
    warnings: [],
    advisories: [],
    notes: [],
  };

  try {
    await page.setViewportSize(RELOW_VIEWPORT);
    const response = await safeNavigate(page, `${siteConfig.baseUrl}${pagePath}`);
    if (!response || response.status() >= 400) {
      report.gating.push(
        `Received HTTP status ${response ? response.status() : 'unknown'} when loading page.`
      );
      return report;
    }

    const stability = await waitForPageStability(page);
    if (!stability.ok) {
      report.gating.push(`Page did not reach a stable state: ${stability.message}`);
      return report;
    }

    const reflowData = await page.evaluate(reflowEvaluationScript);
    report.viewportWidth = reflowData.viewportWidth;
    report.scrollWidth = reflowData.scrollWidth;
    report.horizontalOverflow = reflowData.horizontalOverflow;
    report.offenders = reflowData.offenders;

    if (reflowData.horizontalOverflow > MAX_OVERFLOW_TOLERANCE_PX) {
      report.gating.push(
        `Horizontal overflow of ${reflowData.horizontalOverflow}px detected at 320px viewport.`
      );
    } else if (reflowData.horizontalOverflow > 0) {
      report.advisories.push(
        `Horizontal overflow of ${reflowData.horizontalOverflow}px detected at 320px viewport (within tolerance).`
      );
    }

    if (!reflowData.offenders.length && reflowData.horizontalOverflow > 0) {
      report.advisories.push(
        'Unable to identify specific overflow sources; investigate layout containers.'
      );
    }

    report.notes.push(
      `Viewport ${report.viewportWidth}px recorded ${report.horizontalOverflow}px horizontal overflow.`
    );
  } catch (error) {
    report.gating.push(`Navigation failed: ${error.message}`);
  }

  return report;
}

async function runIframeAudit(page, siteConfig, pagePath) {
  const report = {
    page: pagePath,
    frames: [],
    gating: [],
    warnings: [],
    advisories: [],
    notes: [],
  };

  try {
    const response = await safeNavigate(page, `${siteConfig.baseUrl}${pagePath}`);
    if (!response || response.status() >= 400) {
      report.gating.push(
        `Received HTTP status ${response ? response.status() : 'unknown'} when loading page.`
      );
      return report;
    }

    const stability = await waitForPageStability(page);
    if (!stability.ok) {
      report.gating.push(`Page did not reach a stable state: ${stability.message}`);
      return report;
    }

    const frameHandles = page.frames().filter((frame) => frame.parentFrame());
    if (!frameHandles.length) {
      report.advisories.push('No iframe elements detected on this page.');
      return report;
    }

    for (const [index, frame] of frameHandles.entries()) {
      const frameElement = await frame.frameElement();
      const meta = await frameElement.evaluate((el) => ({
        title: el.getAttribute('title') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        name: el.getAttribute('name') || null,
        role: el.getAttribute('role') || null,
        src: el.getAttribute('src') || null,
        allow: el.getAttribute('allow') || null,
      }));
      await frameElement.dispose();

      const sameOrigin = isSameOrigin(meta.src, siteConfig.baseUrl);
      const hasTitle = Boolean(meta.title || meta.ariaLabel || meta.name);
      const descriptive = hasTitle && (meta.title?.length > 3 || meta.ariaLabel?.length > 3);
      const summary = {
        index: index + 1,
        src: meta.src || 'n/a',
        allow: meta.allow,
        role: meta.role,
        title: meta.title || meta.ariaLabel || meta.name || 'Not provided',
        descriptive,
        sameOrigin,
      };
      if (!sameOrigin) {
        summary.warning = 'Cross-origin iframe — ensure title/aria-label communicates purpose.';
        report.warnings.push(summary.warning);
      }
      if (!descriptive) {
        summary.warning = 'Iframe title/label may be missing or non-descriptive.';
        report.warnings.push(summary.warning);
      }
      report.frames.push(summary);
    }
  } catch (error) {
    report.gating.push(`Navigation failed: ${error.message}`);
  }

  return report;
}

test.describe('Accessibility: Resilience checks', () => {
  let siteConfig;

  test.beforeEach(({ siteConfig: resolvedSiteConfig }) => {
    siteConfig = resolvedSiteConfig;
  });

  test('Respects prefers-reduced-motion', async ({ browser }, testInfo) => {
    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yMotionSampleSize', 'a11yResponsiveSampleSize'],
    });

    const concurrency = resolveConcurrencyLimit(
      process.env.A11Y_MOTION_CONCURRENCY,
      process.env.A11Y_PARALLEL_PAGES
    );

    const reports = await runPageTasks(
      browser,
      pages,
      async ({ page, pagePath }) => runReducedMotionAudit(page, siteConfig, pagePath),
      { concurrency, testInfo, logLabel: 'Reduced motion audit' }
    );

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);
    const { siteLabel, viewportLabel } = resolveAccessibilityMetadata(siteConfig, testInfo);
    applyViewportMetadata(reports, { viewportLabel, siteLabel });

    const runPayload = createRunSummaryPayload({
      baseName: `a11y-reduced-motion-summary-${slugify(siteLabel)}`,
      title: 'Reduced motion support summary',
      overview: {
        totalPagesAudited: reports.length,
        pagesRespectingPreference: reports.filter((report) => report.matchesReduce).length,
        pagesWithGatingIssues: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
        totalSignificantAnimations: reports.reduce(
          (sum, report) =>
            sum + (Array.isArray(report.significant) ? report.significant.length : 0),
          0
        ),
      },
      metadata: {
        spec: 'a11y.resilience.adaptive',
        summaryType: 'reduced-motion',
        projectName: viewportLabel,
        siteName: siteLabel,
        viewports: [viewportLabel],
        suppressPageEntries: true,
        scope: 'project',
      },
    });
    runPayload.details = {
      pages: reports.map((report) => ({
        page: report.page,
        matchesPreference: report.matchesReduce,
        animations: report.animations,
        significantAnimations: report.significant,
        gating: report.gating,
        warnings: report.warnings,
        advisories: report.advisories,
        notes: report.notes,
        projectName: viewportLabel,
        browser: viewportLabel,
        viewport: viewportLabel,
        viewports: [viewportLabel],
      })),
      wcagReferences: REDUCED_MOTION_WCAG_REFERENCES,
    };
    await attachSchemaSummary(testInfo, runPayload);

    for (const report of reports) {
      const pagePayload = createPageSummaryPayload({
        baseName: `a11y-reduced-motion-${slugify(siteLabel)}-${slugify(report.page)}`,
        title: `Reduced motion audit — ${report.page}`,
        page: report.page,
        viewport: viewportLabel,
        summary: {
          matchesPreference: report.matchesReduce,
          animations: report.animations,
          significantAnimations: report.significant,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          notes: report.notes,
          projectName: viewportLabel,
          browser: viewportLabel,
          viewport: viewportLabel,
          viewports: [viewportLabel],
        },
        metadata: {
          spec: 'a11y.resilience.adaptive',
          summaryType: 'reduced-motion',
          projectName: viewportLabel,
          siteName: siteLabel,
          viewports: [viewportLabel],
        },
      });
      await attachSchemaSummary(testInfo, pagePayload);
    }

    expect(gatingTotal, 'Reduced motion gating issues detected').toBe(0);
  });

  test('Maintains layout under 320px reflow', async ({ browser }, testInfo) => {
    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yReflowSampleSize', 'a11yResponsiveSampleSize'],
    });

    const concurrency = resolveConcurrencyLimit(
      process.env.A11Y_REFLOW_CONCURRENCY,
      process.env.A11Y_PARALLEL_PAGES
    );

    const reports = await runPageTasks(
      browser,
      pages,
      async ({ page, pagePath }) => runReflowAudit(page, siteConfig, pagePath),
      { concurrency, testInfo, logLabel: 'Reflow audit' }
    );

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);
    const { siteLabel, viewportLabel } = resolveAccessibilityMetadata(siteConfig, testInfo);
    applyViewportMetadata(reports, { viewportLabel, siteLabel });

    const reflowRunPayload = createRunSummaryPayload({
      baseName: `a11y-reflow-summary-${slugify(siteLabel)}`,
      title: '320px reflow summary',
      overview: {
        totalPagesAudited: reports.length,
        pagesWithOverflow: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
        maxOverflowPx: reports.reduce(
          (max, report) => Math.max(max, report.horizontalOverflow || 0),
          0
        ),
      },
      metadata: {
        spec: 'a11y.resilience.adaptive',
        summaryType: 'reflow',
        projectName: viewportLabel,
        siteName: siteLabel,
        viewports: [viewportLabel],
        suppressPageEntries: true,
        scope: 'project',
      },
    });
    reflowRunPayload.details = {
      pages: reports.map((report) => ({
        page: report.page,
        viewportWidth: report.viewportWidth,
        documentWidth: report.scrollWidth,
        horizontalOverflowPx: report.horizontalOverflow,
        gating: report.gating,
        warnings: report.warnings,
        advisories: report.advisories,
        overflowSources: report.offenders,
        notes: report.notes,
        projectName: viewportLabel,
        browser: viewportLabel,
        viewport: viewportLabel,
        viewports: [viewportLabel],
      })),
      wcagReferences: REFLOW_WCAG_REFERENCES,
      maxOverflowTolerancePx: MAX_OVERFLOW_TOLERANCE_PX,
    };
    await attachSchemaSummary(testInfo, reflowRunPayload);

    for (const report of reports) {
      const reflowPagePayload = createPageSummaryPayload({
        baseName: `a11y-reflow-${slugify(siteLabel)}-${slugify(report.page)}`,
        title: `320px reflow — ${report.page}`,
        page: report.page,
        viewport: viewportLabel,
        summary: {
          viewportWidth: report.viewportWidth,
          documentWidth: report.scrollWidth,
          horizontalOverflowPx: report.horizontalOverflow,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          overflowSources: report.offenders,
          notes: report.notes,
          projectName: viewportLabel,
          browser: viewportLabel,
          viewport: viewportLabel,
          viewports: [viewportLabel],
        },
        metadata: {
          spec: 'a11y.resilience.adaptive',
          summaryType: 'reflow',
          projectName: viewportLabel,
          siteName: siteLabel,
          viewports: [viewportLabel],
        },
      });
      await attachSchemaSummary(testInfo, reflowPagePayload);
    }

    expect(gatingTotal, 'Reflow gating issues detected').toBe(0);
  });

  test('Iframes expose accessible metadata', async ({ browser }, testInfo) => {
    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yIframeSampleSize', 'a11yResponsiveSampleSize'],
    });

    const concurrency = resolveConcurrencyLimit(
      process.env.A11Y_IFRAME_CONCURRENCY,
      process.env.A11Y_PARALLEL_PAGES
    );

    const reports = await runPageTasks(
      browser,
      pages,
      async ({ page, pagePath }) => runIframeAudit(page, siteConfig, pagePath),
      { concurrency, testInfo, logLabel: 'Iframe audit' }
    );

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);
    const { siteLabel, viewportLabel } = resolveAccessibilityMetadata(siteConfig, testInfo);
    applyViewportMetadata(reports, { viewportLabel, siteLabel });

    const runPayload = createRunSummaryPayload({
      baseName: `a11y-iframe-summary-${slugify(siteLabel)}`,
      title: 'Iframe accessibility summary',
      overview: {
        totalPagesAudited: reports.length,
        totalIframesDetected: reports.reduce(
          (sum, report) => sum + (Array.isArray(report.frames) ? report.frames.length : 0),
          0
        ),
        pagesWithMissingLabels: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
      },
      metadata: {
        spec: 'a11y.resilience.adaptive',
        summaryType: 'iframe-metadata',
        projectName: viewportLabel,
        siteName: siteLabel,
        viewports: [viewportLabel],
        suppressPageEntries: true,
        scope: 'project',
      },
    });
    runPayload.details = {
      pages: reports.map((report) => ({
        page: report.page,
        iframeCount: Array.isArray(report.frames) ? report.frames.length : 0,
        gating: report.gating,
        warnings: report.warnings,
        advisories: report.advisories,
        frames: report.frames,
        notes: report.notes,
        projectName: viewportLabel,
        browser: viewportLabel,
        viewport: viewportLabel,
        viewports: [viewportLabel],
      })),
      wcagReferences: IFRAME_WCAG_REFERENCES,
    };
    await attachSchemaSummary(testInfo, runPayload);

    for (const report of reports) {
      const pagePayload = createPageSummaryPayload({
        baseName: `a11y-iframe-${slugify(siteLabel)}-${slugify(report.page)}`,
        title: `Iframe metadata — ${report.page}`,
        page: report.page,
        viewport: viewportLabel,
        summary: {
          iframeCount: Array.isArray(report.frames) ? report.frames.length : 0,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          frames: report.frames,
          notes: report.notes,
          projectName: viewportLabel,
          browser: viewportLabel,
          viewport: viewportLabel,
          viewports: [viewportLabel],
        },
        metadata: {
          spec: 'a11y.resilience.adaptive',
          summaryType: 'iframe-metadata',
          projectName: viewportLabel,
          siteName: siteLabel,
          viewports: [viewportLabel],
        },
      });
      await attachSchemaSummary(testInfo, pagePayload);
    }

    expect(gatingTotal, 'Iframe accessibility gating issues detected').toBe(0);
  });
});
