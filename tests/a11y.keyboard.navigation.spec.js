const { test, expect } = require('../utils/test-fixtures');
const pixelmatch = require('pixelmatch');

test.use({ trace: 'off', video: 'off' });

const { PNG } = require('pngjs');
const SiteLoader = require('../utils/site-loader');
const { runPageTasks, resolveConcurrencyLimit } = require('../utils/concurrency-helpers');
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

const KEYBOARD_WCAG_REFERENCES = [
  { id: '2.1.1', name: 'Keyboard', level: 'A' },
  { id: '2.1.2', name: 'No Keyboard Trap', level: 'A' },
  { id: '2.4.1', name: 'Bypass Blocks', level: 'A' },
  { id: '2.4.3', name: 'Focus Order', level: 'A' },
  { id: '2.4.7', name: 'Focus Visible', level: 'AA' },
];

const DEFAULT_MAX_TAB_ITERATIONS = 20;
const FOCUS_DIFF_THRESHOLD = 0.02;

const focusableElementScript = () => {
  const candidates = Array.from(
    document.querySelectorAll(
      [
        'a[href]',
        'button',
        'input',
        'select',
        'textarea',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
        '[role="button"]',
        '[role="link"]',
        '[role="menuitem"]',
      ].join(', ')
    )
  );

  const focusable = candidates.filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  return focusable.slice(0, 25).map((el) => {
    const label =
      (el.innerText || el.textContent || '').trim() ||
      (el.getAttribute('aria-label') || '').trim() ||
      (el.getAttribute('title') || '').trim() ||
      (el.value || '').trim();

    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      role: el.getAttribute('role') || null,
      className: el.className || null,
      label: label.slice(0, 80),
      href: el.getAttribute('href') || null,
      tabIndex: el.tabIndex,
    };
  });
};

const activeElementSnapshotScript = () => {
  const el = document.activeElement;
  if (!el) {
    return { type: 'none' };
  }

  const style = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const label =
    (el.innerText || el.textContent || '').trim() ||
    (el.getAttribute('aria-label') || '').trim() ||
    (el.getAttribute('title') || '').trim() ||
    (el.value || '').trim();

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    role: el.getAttribute('role') || null,
    className: el.className || null,
    label: label.slice(0, 80),
    isBody: el === document.body,
    tabIndex: el.tabIndex,
    isVisible:
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      rect.width > 0 &&
      rect.height > 0,
    outlineStyle: style.outlineStyle,
    outlineWidth: style.outlineWidth,
    boxShadow: style.boxShadow,
    matchesFocusVisible: typeof el.matches === 'function' ? el.matches(':focus-visible') : false,
  };
};

const skipLinkMetadataScript = () => {
  const focusable = Array.from(
    document.querySelectorAll('a[href^="#"], button[href^="#"], [role="link"][href^="#"]')
  );

  const isLikelySkipLink = (el) => {
    const text = (el.innerText || el.textContent || '').trim();
    const label = (el.getAttribute('aria-label') || '').trim();
    if (!/skip/i.test(`${text} ${label}`)) return false;

    const href = el.getAttribute('href') || '';
    const targetSelector = href.startsWith('#') ? href : null;
    if (!targetSelector || targetSelector === '#') return false;

    const target = document.querySelector(targetSelector);
    if (!target) return false;

    const acceptableRoles = ['main', 'banner', 'contentinfo'];
    const role = target.getAttribute('role') || '';
    const idMatch = /^(main|content|primary|page)/i.test(target.id || '');
    const isLandmark = target.tagName.toLowerCase() === 'main' || acceptableRoles.includes(role.toLowerCase()) || idMatch;
    if (!isLandmark) return false;

    const rect = el.getBoundingClientRect();
    if (rect.top > 400) return false;

    const previouslyFocused = document.activeElement;
    el.focus({ preventScroll: true });
    const focusedStyles = window.getComputedStyle(el);
    const visibleOnFocus =
      focusedStyles.visibility !== 'hidden' &&
      focusedStyles.display !== 'none' &&
      !(focusedStyles.clipPath && focusedStyles.clipPath !== 'none') &&
      !(focusedStyles.clip && focusedStyles.clip !== 'auto');
    if (previouslyFocused && previouslyFocused !== el && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus({ preventScroll: true });
    } else if (previouslyFocused && typeof previouslyFocused.blur === 'function') {
      previouslyFocused.blur();
    }
    return visibleOnFocus;
  };

  const candidate = focusable.find(isLikelySkipLink);
  if (!candidate) return null;

  return {
    text: ((candidate.innerText || candidate.textContent || '').trim() || null)?.slice(0, 80) || null,
    href: candidate.getAttribute('href') || null,
    id: candidate.id || null,
    tag: candidate.tagName.toLowerCase(),
  };
};

const computeElementClip = (boundingBox, viewport) => {
  if (!boundingBox || !viewport) return null;
  const padding = 6;
  const x = Math.max(boundingBox.x - padding, 0);
  const y = Math.max(boundingBox.y - padding, 0);
  const maxWidth = Math.max(Math.min(boundingBox.width + padding * 2, viewport.width - x), 1);
  const maxHeight = Math.max(Math.min(boundingBox.height + padding * 2, viewport.height - y), 1);
  return {
    x,
    y,
    width: maxWidth,
    height: maxHeight,
  };
};

const detectFocusIndicator = async (page, elementHandle) => {
  const viewport = page.viewportSize();
  const box = await elementHandle.boundingBox();
  const clip = computeElementClip(box, viewport || { width: 1280, height: 720 });
  if (!clip) return { hasIndicator: false, diffRatio: 0 };

  let focusedBuffer;
  try {
    focusedBuffer = await page.screenshot({ clip, type: 'png' });
  } catch (_) {
    return { hasIndicator: false, diffRatio: 0 };
  }

  await elementHandle.evaluate((el) => {
    if (typeof el.blur === 'function') el.blur();
  });
  await page.waitForTimeout(75);

  let unfocusedBuffer;
  try {
    unfocusedBuffer = await page.screenshot({ clip, type: 'png' });
  } catch (_) {
    await elementHandle.evaluate((el) => {
      if (typeof el.focus === 'function') el.focus();
    });
    await page.waitForTimeout(50);
    return { hasIndicator: false, diffRatio: 0 };
  }

  await elementHandle.evaluate((el) => {
    if (typeof el.focus === 'function') el.focus();
  });
  await page.waitForTimeout(50);

  try {
    const focusedPng = PNG.sync.read(focusedBuffer);
    const unfocusedPng = PNG.sync.read(unfocusedBuffer);

    if (
      focusedPng.width !== unfocusedPng.width ||
      focusedPng.height !== unfocusedPng.height
    ) {
      return { hasIndicator: false, diffRatio: 0 };
    }

    const diff = new PNG({ width: focusedPng.width, height: focusedPng.height });
    const pixelDiff = pixelmatch(
      focusedPng.data,
      unfocusedPng.data,
      diff.data,
      focusedPng.width,
      focusedPng.height,
      { threshold: 0.2 }
    );
    const diffRatio = pixelDiff / (focusedPng.width * focusedPng.height);
    const screenshotDataUri = `data:image/png;base64,${focusedBuffer.toString('base64')}`;
    return { hasIndicator: diffRatio >= FOCUS_DIFF_THRESHOLD, diffRatio, screenshotDataUri };
  } catch (_) {
    return { hasIndicator: false, diffRatio: 0 };
  }
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

const findKeyboardReference = (id) =>
  KEYBOARD_WCAG_REFERENCES.find((reference) => reference.id === id) || null;

const formatKeyboardBadgeLabel = (reference) => {
  if (!reference || !reference.id) return null;
  const level = reference.level ? reference.level.toUpperCase() : '';
  return `WCAG ${reference.id}${level ? ` ${level}` : ''}`.trim();
};

const createKeyboardAdvisory = (message, wcagId, extras = {}) => {
  const { tags: extraTags, impact = 'minor', ...rest } = extras;
  const reference = findKeyboardReference(wcagId) || { id: wcagId };
  const badge = formatKeyboardBadgeLabel(reference);
  const tags = Array.isArray(extraTags) ? extraTags.filter(Boolean) : [];
  if (badge) tags.unshift(badge);
  if (reference.id && reference.name) {
    tags.push(`${reference.id} ${reference.name}`);
  }
  const uniqueTags = Array.from(new Set(tags));
  return {
    message,
    impact,
    wcag: badge || null,
    tags: uniqueTags,
    ...rest,
  };
};

const describeFocusTarget = (snapshot) => {
  const tag = snapshot?.tag || 'element';
  const idPart = snapshot?.id ? `#${snapshot.id}` : '';
  const descriptor = `${tag}${idPart}`.trim() || tag;
  const label = (snapshot?.label || '').trim() || 'unnamed element';
  const sample = label ? `${descriptor} — ${label}` : descriptor;
  return { descriptor, label, sample };
};

test.describe('Accessibility: Keyboard navigation', () => {
  let siteConfig;
  let errorContext;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');

    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
    errorContext = sharedErrorContext;
  });

  test('Keyboard focus flows are accessible', async ({ browser }, testInfo) => {
    test.setTimeout(7200000);

    const pages = selectAccessibilityTestPages(siteConfig, {
      defaultSize: DEFAULT_ACCESSIBILITY_SAMPLE,
      configKeys: ['a11yKeyboardSampleSize', 'a11yResponsiveSampleSize'],
    });

    const maxTabIterations = Number(process.env.A11Y_KEYBOARD_STEPS || DEFAULT_MAX_TAB_ITERATIONS);
    const concurrency = resolveConcurrencyLimit(
      process.env.A11Y_KEYBOARD_CONCURRENCY,
      process.env.A11Y_PARALLEL_PAGES
    );

    const reports = await runPageTasks(
      browser,
      pages,
      async ({ page, pagePath }) =>
        runKeyboardAudit(page, siteConfig, pagePath, {
          maxTabIterations,
        }),
      { concurrency, testInfo, logLabel: 'Keyboard audit' }
    );

    const gatingTotal = reports.reduce((total, report) => total + report.gating.length, 0);
    const projectName = siteConfig.name || process.env.SITE_NAME || 'default';

    const runPayload = createRunSummaryPayload({
      baseName: `a11y-keyboard-summary-${slugify(projectName)}`,
      title: 'Keyboard navigation summary',
      overview: {
        totalPagesAudited: reports.length,
        pagesWithGatingIssues: reports.filter((report) => report.gating.length > 0).length,
        pagesWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
        skipLinksDetected: reports.filter((report) => Boolean(report.skipLink)).length,
      },
      metadata: {
        spec: 'a11y.keyboard.navigation',
        summaryType: 'keyboard',
        projectName,
        suppressPageEntries: true,
        scope: 'project',
      },
    });
  runPayload.details = {
    pages: reports.map((report) => ({
      page: report.page,
      focusableCount: report.focusableCount,
      visitedCount: report.visitedCount,
      skipLink: report.skipLink,
      gating: report.gating,
      warnings: report.warnings,
      advisories: report.advisories,
      focusSequence: report.sequence,
      notes: report.notes,
    })),
    wcagReferences: KEYBOARD_WCAG_REFERENCES,
  };
    await attachSchemaSummary(testInfo, runPayload);

    for (const report of reports) {
      const pagePayload = createPageSummaryPayload({
        baseName: `a11y-keyboard-${slugify(projectName)}-${slugify(report.page)}`,
        title: `Keyboard audit — ${report.page}`,
        page: report.page,
        viewport: 'keyboard',
        summary: {
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          focusableCount: report.focusableCount,
          visitedCount: report.visitedCount,
          skipLink: report.skipLink,
          focusSequence: report.sequence,
          notes: report.notes,
        },
        metadata: {
          spec: 'a11y.keyboard.navigation',
          summaryType: 'keyboard',
          projectName,
        },
      });
      await attachSchemaSummary(testInfo, pagePayload);
    }

    expect(gatingTotal, 'Keyboard navigation gating issues detected').toBe(0);
  });
});

async function runKeyboardAudit(page, siteConfig, testPage, { maxTabIterations }) {
  const report = {
    page: testPage,
    focusableCount: 0,
    visitedCount: 0,
    skipLink: null,
    gating: [],
    warnings: [],
    advisories: [],
    sequence: [],
    notes: [],
  };

  try {
    const response = await safeNavigate(page, `${siteConfig.baseUrl}${testPage}`);
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

    const focusable = await page.evaluate(focusableElementScript);
    report.focusableCount = focusable.length;
    if (focusable.length === 0) {
      report.gating.push('No focusable elements detected on page.');
      return report;
    }

    report.skipLink = await page.evaluate(skipLinkMetadataScript);
    if (!report.skipLink) {
      report.advisories.push(
        createKeyboardAdvisory('Skip navigation link not detected near top of document.', '2.4.1', {
          summary: 'Skip navigation link not detected near top of document.',
        })
      );
    }

    await page.evaluate(() => {
      if (document.body) document.body.focus({ preventScroll: true });
    });

    const visited = [];

    for (let step = 0; step < Math.min(maxTabIterations, focusable.length); step += 1) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(75);

      const snapshot = await page.evaluate(activeElementSnapshotScript);
      if (!snapshot || snapshot.type === 'none') {
        report.gating.push('No active element after tabbing — possible focus trap.');
        break;
      }

      if (snapshot.isBody) {
        report.gating.push('Tab order returned focus to <body>, indicating a keyboard trap.');
        break;
      }

      const identity = `${snapshot.tag}|${snapshot.id || ''}|${snapshot.role || ''}|${snapshot.label || ''}`;
      visited.push(identity);

      const activeElementHandle = await page.evaluateHandle(() => document.activeElement);
      let hasIndicator = false;
      let nodeScreenshot = null;
      if (activeElementHandle && activeElementHandle.asElement()) {
        const result = await detectFocusIndicator(page, activeElementHandle.asElement());
        hasIndicator = result.hasIndicator;
        nodeScreenshot = result.screenshotDataUri || null;
      }
      if (activeElementHandle) await activeElementHandle.dispose();

      if (!snapshot.isVisible) {
        report.gating.push(
          `Keyboard focus moved to an element that is visually hidden (${snapshot.tag} ${snapshot.id ? `#${snapshot.id}` : ''}).`
        );
      }
      if (!hasIndicator) {
        const focusTarget = describeFocusTarget(snapshot);
        report.advisories.push(
          createKeyboardAdvisory(
            `Unable to detect focus indicator change for ${focusTarget.descriptor} (${focusTarget.label}).`,
            '2.4.7',
            {
              summary: 'Unable to detect focus indicator change',
              samples: [{ label: focusTarget.sample, screenshotDataUri: nodeScreenshot }],
            }
          )
        );
      }

      report.sequence.push({
        index: step + 1,
        hasIndicator,
        summary: `${snapshot.tag}${snapshot.id ? `#${snapshot.id}` : ''}${
          snapshot.role ? ` [role=${snapshot.role}]` : ''
        } — ${snapshot.label || 'no accessible label'}`,
      });
    }

    report.visitedCount = visited.length;

    if (visited.length <= 1 && focusable.length > 1) {
      report.gating.push('Tab order did not progress beyond the first interactive element.');
    }

    if (visited.length > 1) {
      await page.keyboard.press('Shift+Tab');
      await page.waitForTimeout(75);
      const reverseSnapshot = await page.evaluate(activeElementSnapshotScript);
      if (!reverseSnapshot || reverseSnapshot.isBody) {
        report.gating.push('Reverse tabbing returned focus to <body>; keyboard users may get trapped.');
      }
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
    }

    report.notes.push(
      `Traversed ${report.visitedCount} of ${report.focusableCount} focusable elements in tab sequence.`
    );
    if (report.skipLink && (report.skipLink.text || report.skipLink.href)) {
      report.notes.push(
        `Skip link detected (${report.skipLink.text || report.skipLink.href}) targeting ${report.skipLink.href}.`
      );
    }
  } catch (error) {
    report.gating.push(`Navigation failed: ${error.message}`);
  } finally {
    // cleaned up by runPageTasks
  }

  return report;
}
