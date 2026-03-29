const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');

test.use({ trace: 'off', video: 'off' });
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');
const {
  DEFAULT_ACCESSIBILITY_SAMPLE,
  selectAccessibilityTestPages,
} = require('../utils/a11y-shared');

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
      const timing = effect && typeof effect.getComputedTiming === 'function' ? effect.getComputedTiming() : {};

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
      const classList = Array.from(el.classList || []).slice(0, 3).join('.');
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

test.describe('Accessibility: Resilience checks', () => {
  let siteConfig;
  let errorContext;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');

    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
    errorContext = sharedErrorContext;
  });

  test('Respects prefers-reduced-motion', async ({ page }, testInfo) => {
    test.setTimeout(7200000);

    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yMotionSampleSize', 'a11yResponsiveSampleSize'],
    });

    const reports = [];

    for (const testPage of pages) {
      await test.step(`Reduced motion audit: ${testPage}`, async () => {
        const report = {
          page: testPage,
          matchesReduce: true,
          animations: [],
          significant: [],
          gating: [],
          warnings: [],
          advisories: [],
          notes: [],
        };
        reports.push(report);

        try {
          await page.emulateMedia({ reducedMotion: 'reduce' });
        } catch (_) {
          // emulateMedia may not be supported in some environments; continue regardless
        }

        let response;
        try {
          response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        } catch (error) {
          report.gating.push(`Navigation failed: ${error.message}`);
          return;
        }

        if (!response || response.status() >= 400) {
          report.gating.push(
            `Received HTTP status ${response ? response.status() : 'unknown'} when loading page.`
          );
          return;
        }

        const stability = await waitForPageStability(page);
        if (!stability.ok) {
          report.gating.push(`Page did not reach a stable state: ${stability.message}`);
          return;
        }

        const motionData = await page.evaluate(reducedMotionEvaluationScript);
        report.matchesReduce = motionData.matchesReduce;
        report.animations = motionData.animations;
        report.significant = motionData.significantAnimations;

        if (!motionData.matchesReduce) {
          report.advisories.push('prefers-reduced-motion media query did not match; site may lack reduced motion styles.');
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
          report.advisories.push('No running animations detected; ensure interactive components still function as expected.');
        }

        report.notes.push(
          `Detected ${report.animations.length} animations (${report.significant.length} significant) with reduced motion preference ${report.matchesReduce ? 'respected' : 'ignored'}.`
        );
      });
    }

    await page.emulateMedia(null).catch(() => {});

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);

    const projectName = siteConfig.name || process.env.SITE_NAME || 'default';

    const runPayload = createRunSummaryPayload({
      baseName: `a11y-reduced-motion-summary-${slugify(projectName)}`,
      title: 'Reduced motion support summary',
      overview: {
        totalPagesAudited: reports.length,
        pagesRespectingPreference: reports.filter((report) => report.matchesReduce).length,
        pagesWithGatingIssues: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
        totalSignificantAnimations: reports.reduce((sum, report) => sum + report.significant.length, 0),
      },
      metadata: {
        spec: 'a11y.resilience.adaptive',
        summaryType: 'reduced-motion',
        projectName,
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
      })),
      wcagReferences: REDUCED_MOTION_WCAG_REFERENCES,
    };
    await attachSchemaSummary(testInfo, runPayload);

    for (const report of reports) {
      const pagePayload = createPageSummaryPayload({
        baseName: `a11y-reduced-motion-${slugify(projectName)}-${slugify(report.page)}`,
        title: `Reduced motion audit — ${report.page}`,
        page: report.page,
        viewport: 'reduced-motion',
        summary: {
          matchesPreference: report.matchesReduce,
          animations: report.animations,
          significantAnimations: report.significant,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          notes: report.notes,
        },
        metadata: {
          spec: 'a11y.resilience.adaptive',
          summaryType: 'reduced-motion',
          projectName,
        },
      });
      await attachSchemaSummary(testInfo, pagePayload);
    }

    expect(gatingTotal, 'Reduced motion gating issues detected').toBe(0);
  });

  test('Maintains layout under 320px reflow', async ({ page }, testInfo) => {
    test.setTimeout(7200000);

    const originalViewport = page.viewportSize() || { width: 1280, height: 720 };
    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yReflowSampleSize', 'a11yResponsiveSampleSize'],
    });

    const reports = [];

    for (const testPage of pages) {
      await test.step(`Reflow audit: ${testPage}`, async () => {
        const report = {
          page: testPage,
          viewportWidth: RELOW_VIEWPORT.width,
          scrollWidth: RELOW_VIEWPORT.width,
          horizontalOverflow: 0,
          offenders: [],
          gating: [],
          warnings: [],
          advisories: [],
          notes: [],
        };
        reports.push(report);

        try {
          await page.setViewportSize(RELOW_VIEWPORT);
        } catch (error) {
          report.gating.push(`Unable to set mobile viewport: ${error.message}`);
          return;
        }

        let response;
        try {
          response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        } catch (error) {
          report.gating.push(`Navigation failed: ${error.message}`);
          return;
        }

        if (!response || response.status() >= 400) {
          report.gating.push(
            `Received HTTP status ${response ? response.status() : 'unknown'} when loading page.`
          );
          return;
        }

        const stability = await waitForPageStability(page);
        if (!stability.ok) {
          report.gating.push(`Page did not reach a stable state: ${stability.message}`);
          return;
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
          report.advisories.push('Unable to identify specific overflow sources; investigate layout containers.');
        }

        report.notes.push(
          `Viewport ${report.viewportWidth}px recorded ${report.horizontalOverflow}px horizontal overflow.`
        );
      });

      await page.setViewportSize(originalViewport).catch(() => {});
    }

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);

    const projectName = siteConfig.name || process.env.SITE_NAME || 'default';

    const reflowRunPayload = createRunSummaryPayload({
      baseName: `a11y-reflow-summary-${slugify(projectName)}`,
      title: '320px reflow summary',
      overview: {
        totalPagesAudited: reports.length,
        pagesWithOverflow: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
        maxOverflowPx: reports.reduce((max, report) => Math.max(max, report.horizontalOverflow || 0), 0),
      },
      metadata: {
        spec: 'a11y.resilience.adaptive',
        summaryType: 'reflow',
        projectName,
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
      })),
      wcagReferences: REFLOW_WCAG_REFERENCES,
      maxOverflowTolerancePx: MAX_OVERFLOW_TOLERANCE_PX,
    };
    await attachSchemaSummary(testInfo, reflowRunPayload);

    for (const report of reports) {
      const reflowPagePayload = createPageSummaryPayload({
        baseName: `a11y-reflow-${slugify(projectName)}-${slugify(report.page)}`,
        title: `320px reflow — ${report.page}`,
        page: report.page,
        viewport: '320px',
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
        },
        metadata: {
          spec: 'a11y.resilience.adaptive',
          summaryType: 'reflow',
          projectName,
        },
      });
      await attachSchemaSummary(testInfo, reflowPagePayload);
    }

    expect(gatingTotal, 'Reflow gating issues detected').toBe(0);
  });

  test('Iframes expose accessible metadata', async ({ page }, testInfo) => {
    test.setTimeout(7200000);

    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yIframeSampleSize', 'a11yResponsiveSampleSize'],
    });

    const reports = [];

    for (const testPage of pages) {
      await test.step(`Iframe audit: ${testPage}`, async () => {
        const report = {
          page: testPage,
          frames: [],
          gating: [],
          warnings: [],
          advisories: [],
          notes: [],
        };
        reports.push(report);

        let response;
        try {
          response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
        } catch (error) {
          report.gating.push(`Navigation failed: ${error.message}`);
          return;
        }

        if (!response || response.status() >= 400) {
          report.gating.push(
            `Received HTTP status ${response ? response.status() : 'unknown'} when loading page.`
          );
          return;
        }

        const stability = await waitForPageStability(page);
        if (!stability.ok) {
          report.gating.push(`Page did not reach a stable state: ${stability.message}`);
          return;
        }

        const frameHandles = page.frames().filter((frame) => frame.parentFrame());

        if (!frameHandles.length) {
          report.advisories.push('No iframe elements detected on this page.');
          return;
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

          const frameUrl = frame.url();
          const crossOrigin = !isSameOrigin(frameUrl, siteConfig.baseUrl);
          const accessibleLabel = meta.title || meta.ariaLabel || meta.name;

          report.frames.push({
            index,
            ...meta,
            resolvedUrl: frameUrl,
            crossOrigin,
            accessible: Boolean(accessibleLabel),
          });

          if (!accessibleLabel) {
            report.gating.push(
              `Iframe ${meta.src || frameUrl || `#${index}`} is missing accessible label (title/aria-label/name)${
                crossOrigin ? ' — cross-origin content cannot inherit context' : ''
              }.`
            );
          } else if (crossOrigin) {
            report.advisories.push(
              `Cross-origin iframe ${meta.src || frameUrl || `#${index}`} relies on accessible metadata; manual verification recommended.`
            );
          }

          if (!crossOrigin) {
            report.advisories.push(
              `Same-origin iframe ${meta.src || frameUrl || `#${index}`} detected; include it in deeper interactive audits if it contains key journeys.`
            );
          }
        }

        report.notes.push(
          `${report.frames.length} iframe(s) evaluated; ${report.frames.filter((frame) => frame.crossOrigin).length} cross-origin.`
        );
      });
    }

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);

    const projectName = siteConfig.name || process.env.SITE_NAME || 'default';

    const iframeRunPayload = createRunSummaryPayload({
      baseName: `a11y-iframe-summary-${slugify(projectName)}`,
      title: 'Iframe accessibility summary',
      overview: {
        totalPagesAudited: reports.length,
        totalIframesDetected: reports.reduce((sum, report) => sum + report.frames.length, 0),
        pagesWithMissingLabels: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
      },
      metadata: {
        spec: 'a11y.resilience.adaptive',
        summaryType: 'iframe-metadata',
        projectName,
        suppressPageEntries: true,
        scope: 'project',
      },
    });
    iframeRunPayload.details = {
      pages: reports.map((report) => ({
        page: report.page,
        iframeCount: report.frames.length,
        gating: report.gating,
        warnings: report.warnings,
        advisories: report.advisories,
        frames: report.frames,
        notes: report.notes,
      })),
      wcagReferences: IFRAME_WCAG_REFERENCES,
    };
    await attachSchemaSummary(testInfo, iframeRunPayload);

    for (const report of reports) {
      const iframePagePayload = createPageSummaryPayload({
        baseName: `a11y-iframe-${slugify(projectName)}-${slugify(report.page)}`,
        title: `Iframe metadata — ${report.page}`,
        page: report.page,
        viewport: 'iframe-audit',
        summary: {
          iframeCount: report.frames.length,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          frames: report.frames,
          notes: report.notes,
        },
        metadata: {
          spec: 'a11y.resilience.adaptive',
          summaryType: 'iframe-metadata',
          projectName,
        },
      });
      await attachSchemaSummary(testInfo, iframePagePayload);
    }

    expect(gatingTotal, 'Iframe accessibility gating issues detected').toBe(0);
  });
});
