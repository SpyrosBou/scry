module.exports = function createAccessibilityPanelRenderers({
  aggregatePageIssueEntries,
  aggregateStructureIssues,
  assembleSuiteSections,
  collectIssueMessages,
  collectSchemaProjects,
  ensureDisplayValue,
  ensurePageLabel,
  escapeHtml,
  firstRunPayload,
  formatCount,
  formatPageLabel,
  formatUniqueRulesHeading,
  makeKeyboardIssueEntry,
  MISSING_DATA_LABEL,
  renderKeyboardPageIssuesTable,
  renderKeyboardRunSummary,
  renderPerPageIssuesTable,
  renderProjectBlockSection,
  renderSchemaGroupContainer,
  renderSuiteFindingsBlock,
  renderSuiteGatingTable,
  renderSummaryMetrics,
}) {
const renderKeyboardPageCard = (summary, { projectLabel, viewportLabel } = {}) => {
  if (!summary) return '';

  const gating = Array.isArray(summary.gatingIssues)
    ? summary.gatingIssues
    : Array.isArray(summary.gating)
      ? summary.gating
      : [];
  const executionFailures = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const focusSequence = Array.isArray(summary.focusSequence) ? summary.focusSequence : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const effectiveViewport =
    summary.viewport || viewportLabel || summary.projectName || projectLabel;
  const viewportName = ensureDisplayValue(effectiveViewport || projectLabel);
  const browserLabel = summary.browser || viewportLabel || projectLabel || 'Chrome';
  const viewportsList =
    Array.isArray(summary.viewports) && summary.viewports.length
      ? summary.viewports
      : effectiveViewport
        ? [effectiveViewport]
        : [];
  const projectNameLabel = summary.projectName || projectLabel || browserLabel;
  const siteNameLabel = summary.siteName || projectNameLabel;
  const focusableCount = Number.isFinite(summary.focusableCount) ? summary.focusableCount : null;
  const visitedCount = Number.isFinite(summary.visitedCount) ? summary.visitedCount : null;
  const coveragePercent =
    focusableCount && visitedCount != null && focusableCount > 0
      ? Math.round((visitedCount / focusableCount) * 100)
      : null;

  const skipLink = summary.skipLink;
  const skipLabel = skipLink
    ? `Present — ${escapeHtml(skipLink.text || skipLink.href || 'skip link')}`
    : 'Missing';

  const hasGating = gating.length > 0;
  const hasExecutionFailures = executionFailures.length > 0;
  const hasAdvisories = advisories.length > 0;
  const statusMeta = (() => {
    if (hasGating) {
      return {
        className: 'status-error',
        label: `${formatCount(gating.length)} gating issue(s)`,
      };
    }
    if (hasExecutionFailures) {
      return {
        className: 'status-error',
        label: 'Execution failures',
      };
    }
    if (hasAdvisories) {
      return {
        className: 'status-info',
        label: 'Advisories present',
      };
    }
    return { className: 'status-ok', label: 'Pass' };
  })();

  const metaLines = [
    `<p class="details"><strong>Viewport:</strong> ${escapeHtml(viewportName)}</p>`,
    focusableCount != null
      ? `<p class="details"><strong>Focusable elements:</strong> ${escapeHtml(
          formatCount(focusableCount)
        )}</p>`
      : '',
    visitedCount != null
      ? `<p class="details"><strong>Visited via keyboard:</strong> ${escapeHtml(
          formatCount(visitedCount)
        )}${coveragePercent != null ? ` (~${coveragePercent}% coverage)` : ''}</p>`
      : '',
    `<p class="details"><strong>Skip link:</strong> ${skipLabel}</p>`,
    hasGating
      ? `<p class="details"><strong>Gating issues:</strong> ${escapeHtml(
          formatCount(gating.length)
        )}</p>`
      : '',
    hasExecutionFailures
      ? `<p class="details"><strong>Execution failures:</strong> ${escapeHtml(
          formatCount(executionFailures.length)
        )}</p>`
      : '',
    hasAdvisories
      ? `<p class="details"><strong>Advisories:</strong> ${escapeHtml(
          formatCount(advisories.length)
        )}</p>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const sequenceItems = focusSequence
    .slice(0, 25)
    .map((entry, index) => {
      const summaryText = entry.summary || `Stop ${index + 1}`;
      const indicatorLabel = entry.hasIndicator
        ? 'Focus indicator detected'
        : 'No focus indicator found';
      return `
        <li>
          <strong>Step ${index + 1}</strong>: ${escapeHtml(summaryText)} — ${indicatorLabel}
        </li>
      `;
    })
    .join('');

  const hydrateIssueMetadata = (issue = {}) => {
    const next = { ...issue };
    if (!next.browser) next.browser = browserLabel;
    if (!next.browsers || next.browsers.length === 0) {
      next.browsers = browserLabel ? [browserLabel] : undefined;
    }
    if (!next.viewport) next.viewport = effectiveViewport || browserLabel;
    if (!next.viewports || next.viewports.length === 0) {
      next.viewports = viewportsList.length ? viewportsList : next.viewport ? [next.viewport] : [];
    }
    if (!next.projectName) next.projectName = projectNameLabel;
    if (!next.siteName) next.siteName = siteNameLabel;
    return next;
  };

  const executionEntries = executionFailures.map((message) =>
    makeKeyboardIssueEntry(message, 'critical')
  );
  const gatingEntries = gating.map((message) => makeKeyboardIssueEntry(message, 'critical'));
  const advisoryEntries = advisories.map((message) => makeKeyboardIssueEntry(message, 'minor'));

  const executionSection = renderKeyboardPageIssuesTable(
    executionEntries,
    formatUniqueRulesHeading('Execution failures', executionEntries.length, {
      noun: 'unique issues',
    }),
    {
      emptyHtml: '',
      hydrate: hydrateIssueMetadata,
    }
  );

  const gatingSection = renderKeyboardPageIssuesTable(
    gatingEntries,
    formatUniqueRulesHeading('Gating keyboard issues', gatingEntries.length),
    {
      emptyHtml: '<p class="details">No gating issues detected.</p>',
      hydrate: hydrateIssueMetadata,
    }
  );

  const advisorySection = renderKeyboardPageIssuesTable(
    advisoryEntries,
    formatUniqueRulesHeading('Advisories', advisoryEntries.length),
    { headingClass: 'summary-heading-best-practice', hydrate: hydrateIssueMetadata }
  );

  const notesHtml = notes.length
    ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const sequenceHtml = sequenceItems
    ? `<details><summary>Focus sequence (${focusSequence.length} stops)</summary><ul class="details">${sequenceItems}</ul></details>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(ensurePageLabel(summary.page))}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      <div class="page-card__meta">
        ${metaLines}
      </div>
      ${notesHtml}
      ${executionSection}
      ${gatingSection}
      ${advisorySection}
      ${sequenceHtml}
    </section>
  `;
};

const renderKeyboardGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const multiBucket = buckets.length > 1;

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload) return '';

      const details = runPayload.details || {};
      const overview = runPayload.overview || {};
      const metadata = runPayload.metadata || {};
      const pagesData = Array.isArray(details.pages) ? details.pages : [];
      if (pagesData.length === 0) return '';

      const wcagRefs = Array.isArray(details.wcagReferences) ? details.wcagReferences : [];
      // Determine violated WCAG references for header chips (not assessed set).
      // We derive unique WCAG IDs from advisories/warnings, and map certain
      // gating messages to their corresponding criteria.
      const deriveViolatedWcagRefs = () => {
        const idSet = new Set();

        const addId = (id) => {
          const trimmed = String(id || '').trim();
          if (/^\d+\.\d+\.\d+$/.test(trimmed)) idSet.add(trimmed);
        };

        const extractIdFromItem = (item) => {
          if (!item || typeof item !== 'object') return null;
          if (typeof item.wcag === 'string') {
            const m = item.wcag.match(/(\d+\.\d+\.\d+)/);
            if (m) return m[1];
          }
          const tags = Array.isArray(item.tags)
            ? item.tags
            : Array.isArray(item.wcagTags)
              ? item.wcagTags
              : [];
          for (const t of tags) {
            const m = String(t || '').match(/(\d+\.\d+\.\d+)/);
            if (m) return m[1];
          }
          return null;
        };

        for (const page of pagesData) {
          // Advisories and warnings can carry explicit WCAG tags
          for (const groupKey of ['advisories', 'warnings']) {
            const items = Array.isArray(page?.[groupKey]) ? page[groupKey] : [];
            for (const it of items) {
              const id = extractIdFromItem(it);
              if (id) addId(id);
            }
          }

          // Map common gating messages to WCAG criteria
          const gating = []
            .concat(Array.isArray(page?.gating) ? page.gating : [])
            .concat(Array.isArray(page?.gatingIssues) ? page.gatingIssues : []);
          for (const raw of gating) {
            const msg = String((raw && raw.message) || raw || '').toLowerCase();
            if (!msg) continue;
            if (/(keyboard|focus) trap/.test(msg) || /returned focus to <body>/.test(msg)) {
              addId('2.1.2'); // No Keyboard Trap
            }
            if (/did not progress beyond the first interactive/.test(msg)) {
              addId('2.4.3'); // Focus Order
            }
            if (/visually hidden/.test(msg) || /no active element after tabbing/.test(msg)) {
              // Heuristic: often correlates with focus visibility/order issues
              addId('2.4.7'); // Focus Visible
            }
          }
        }

        if (!idSet.size) return [];
        // Map back to declared references to get names/levels
        const byId = new Map(wcagRefs.map((r) => [r.id, r]));
        return Array.from(idSet)
          .map((id) => byId.get(id))
          .filter(Boolean);
      };
      const violatedRefs = deriveViolatedWcagRefs();
      const viewportList =
        Array.isArray(details.viewports) && details.viewports.length
          ? details.viewports
          : Array.isArray(metadata.viewports) && metadata.viewports.length
            ? metadata.viewports
            : [];
      const projectLabel = metadata.projectName || bucket.projectName || 'Keyboard audit';
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;
      const viewportsCount = viewportList.length || 1;
      const failThreshold = details.failThreshold || overview.failThreshold || metadata.failOn;

      const normalizeKeyboardAdvisory = ({ message, raw }) => {
        const helpUrl = raw && typeof raw === 'object' ? raw.helpUrl || null : null;
        const helpHtml = raw && typeof raw === 'object' ? raw.helpHtml || null : null;
        const helpLabel = raw && typeof raw === 'object' ? raw.helpLabel || null : null;
        const source =
          (raw &&
            typeof raw === 'object' &&
            typeof raw.message === 'string' &&
            raw.message.trim()) ||
          (typeof message === 'string' ? message.trim() : '');
        if (!source) return null;

        if (/^unable to detect focus indicator change/i.test(source)) {
          const summary =
            (raw &&
              typeof raw === 'object' &&
              typeof raw.summary === 'string' &&
              raw.summary.trim()) ||
            'Unable to detect focus indicator change';
          const sampleCandidate =
            (raw && typeof raw === 'object' && raw.sample) ||
            source
              .replace(/^Unable to detect focus indicator change for\s*/i, '')
              .replace(/\.$/, '');
          const sample =
            typeof sampleCandidate === 'string' ? sampleCandidate.trim() : sampleCandidate;
          return {
            key: summary,
            label: summary,
            sample,
            helpUrl,
            helpHtml,
            helpLabel,
            wcagTags: ['2.4.7'],
            wcagBadge: 'WCAG 2.4.7 AA',
          };
        }

        if (/^skip navigation link not detected/i.test(source)) {
          const summary =
            (raw &&
              typeof raw === 'object' &&
              typeof raw.summary === 'string' &&
              raw.summary.trim()) ||
            'Skip navigation link not detected near top of document.';
          return {
            key: summary,
            label: summary,
            helpUrl,
            helpHtml,
            helpLabel,
            wcagTags: ['2.4.1'],
            wcagBadge: 'WCAG 2.4.1 A',
          };
        }

        return { key: source, label: source, helpUrl, helpHtml, helpLabel };
      };

      const normalizeKeyboardGating = ({ message }) => {
        const text = String(message || '').toLowerCase();
        const base = { key: message, label: message };
        if (/keyboard\s*trap/.test(text) || /returned\s+focus\s+to\s*<body>/.test(text)) {
          return { ...base, wcagTags: ['2.1.2'], wcagBadge: 'WCAG 2.1.2 A' };
        }
        if (/did not progress beyond the first interactive element/.test(text)) {
          return { ...base, wcagTags: ['2.4.3'], wcagBadge: 'WCAG 2.4.3 A' };
        }
        if (/visually hidden/.test(text) || /no active element after tabbing/.test(text)) {
          return { ...base, wcagTags: ['2.4.7'], wcagBadge: 'WCAG 2.4.7 AA' };
        }
        return base;
      };

      const runSummaryHtml = renderKeyboardRunSummary(
        overview,
        pagesData,
        violatedRefs.length ? violatedRefs : [],
        {
          viewportLabel,
          viewportsCount,
          failThreshold,
        }
      );

      const executionFailureIssues = collectIssueMessages(pagesData, 'warnings', 'critical', {
        normalize: normalizeKeyboardAdvisory,
      }).filter((issue) => issue.pageCount > 0);
      const gatingIssues = collectIssueMessages(pagesData, ['gating', 'gatingIssues'], 'critical', {
        normalize: normalizeKeyboardGating,
      }).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'minor', {
        normalize: normalizeKeyboardAdvisory,
      });

      const executionFailureTable = executionFailureIssues.length
        ? renderSuiteGatingTable(executionFailureIssues, {
            title: formatUniqueRulesHeading('Execution failures', executionFailureIssues.length, {
              noun: 'unique issues',
            }),
            emptyMessage: 'Execution failures recorded during this run.',
            viewportLabel,
            includeWcagColumn: true,
          })
        : '';

      const perPageEntries = pagesData.map((page) => {
        const gating = []
          .concat(
            Array.isArray(page.gating) ? page.gating : [],
            Array.isArray(page.gatingIssues) ? page.gatingIssues : []
          )
          .filter(Boolean);
        const executionIssues = Array.isArray(page.warnings) ? page.warnings : [];
        const advisories = Array.isArray(page.advisories) ? page.advisories : [];
        const summaryClass =
          gating.length > 0 || executionIssues.length > 0
            ? 'summary-page--fail'
            : advisories.length > 0
              ? 'summary-page--advisory'
              : 'summary-page--ok';
        return {
          ...page,
          page: ensurePageLabel(page.page || page.url),
          _summaryClass: summaryClass,
        };
      });

      const findingsHtml = renderSuiteFindingsBlock({
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking keyboard issues',
          emptyMessage: 'No blocking keyboard issues detected.',
          viewportLabel,
          includeWcagColumn: true,
        },
        advisoryOptions: {
          title: 'Keyboard advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
          includeWcagColumn: true,
        },
        perPageOptions: {
          heading: 'Per-page keyboard findings',
          summaryClass: 'summary-page--keyboard',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) =>
            renderKeyboardPageCard(entrySummary, {
              projectLabel,
              viewportLabel,
            }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      });

      const sectionContent = assembleSuiteSections([runSummaryHtml, executionFailureTable, findingsHtml]);
      if (!sectionContent) return '';

      if (multiBucket) {
        return renderProjectBlockSection({
          projectLabel,
          content: sectionContent,
        });
      }

      return sectionContent;
    })
    .filter(Boolean);

  return renderSchemaGroupContainer({
    sections,
    heading: multiBucket && group.title ? group.title : null,
    element: 'section',
  });
};

const renderReducedMotionPageCard = (summary) => {
  if (!summary) return '';

  const gating = []
    .concat(
      Array.isArray(summary.gating) ? summary.gating : [],
      Array.isArray(summary.gatingIssues) ? summary.gatingIssues : []
    )
    .filter(Boolean);
  const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories.filter(Boolean) : [];
  const significant = Array.isArray(summary.significantAnimations)
    ? summary.significantAnimations.filter(Boolean)
    : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];
  const animations = Array.isArray(summary.animations) ? summary.animations.filter(Boolean) : [];

  const matchesPreference = summary.matchesPreference;
  const hasGating = gating.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAdvisories = advisories.length > 0;
  const preferenceIgnored = matchesPreference === false;

  let statusMeta = { className: 'status-ok', label: 'Pass' };
  if (hasGating) {
    statusMeta = {
      className: 'status-error',
      label: `${formatCount(gating.length)} blocking issue(s)`,
    };
  } else if (hasWarnings) {
    statusMeta = { className: 'status-warning', label: 'Warnings present' };
  } else if (preferenceIgnored) {
    statusMeta = { className: 'status-warning', label: 'Preference ignored' };
  } else if (hasAdvisories) {
    statusMeta = { className: 'status-info', label: 'Advisories present' };
  }

  const preferenceLabel =
    matchesPreference === true
      ? 'Respected'
      : matchesPreference === false
        ? 'Ignored'
        : MISSING_DATA_LABEL;

  const metrics = renderSummaryMetrics([
    {
      label: 'Viewport',
      value: ensureDisplayValue(summary.viewport || summary.projectName),
    },
    { label: 'Prefers-reduced-motion', value: preferenceLabel },
    { label: 'Animations observed', value: formatCount(animations.length) },
    { label: 'Significant animations', value: formatCount(significant.length) },
  ]);

  const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
  const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
  const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

  const gatingSection =
    gatingEntries.length > 0
      ? renderPerPageIssuesTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking reduced-motion issues', gatingEntries.length)
        )
      : '<p class="details">No blocking reduced-motion issues detected.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderPerPageIssuesTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderPerPageIssuesTable(
          advisoryEntries,
          formatUniqueRulesHeading('Advisories', advisoryEntries.length),
          { headingClass: 'summary-heading-best-practice' }
        )
      : '';

  const notesHtml = notes.length
    ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const significantHtml = significant.length
    ? `<details><summary>Significant animations (${significant.length})</summary><ul class="details">${significant
        .map((anim) => {
          const label = anim?.name || anim?.type || 'Animation';
          const selector = anim?.selector ? ` on ${anim.selector}` : '';
          const duration = Number.isFinite(anim?.duration)
            ? `${Math.round(anim.duration)}ms`
            : 'unknown duration';
          const iterations =
            anim?.iterations != null && anim.iterations !== 'infinite'
              ? String(anim.iterations)
              : 'unspecified iterations';
          return `<li>${escapeHtml(`${label}${selector} (${duration}, ${iterations})`)}</li>`;
        })
        .join('')}</ul></details>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(ensurePageLabel(summary.page))}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${metrics}
      ${notesHtml}
      ${significantHtml}
      ${gatingSection}
      ${warningSection}
      ${advisorySection}
    </section>
  `;
};

const renderReducedMotionGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const multiBucket = buckets.length > 1;

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const pagesData = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      if (pagesData.length === 0) return '';

      const metadata = runPayload.metadata || {};
      const viewportList =
        Array.isArray(runPayload.details?.viewports) && runPayload.details.viewports.length
          ? runPayload.details.viewports
          : Array.isArray(metadata.viewports) && metadata.viewports.length
            ? metadata.viewports
            : [];
      const projectLabel = metadata.projectName || bucket.projectName || 'Reduced motion audit';
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

      const gatingIssues = collectIssueMessages(
        pagesData,
        ['gating', 'gatingIssues'],
        'critical'
      ).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(
        pagesData,
        ['warnings', 'advisories'],
        'moderate'
      );

      const perPageEntries = (bucket.pageEntries || []).map((entry) => {
        const payload = entry.payload || {};
        const summary = payload.summary || {};
        const gating = []
          .concat(
            Array.isArray(summary.gating) ? summary.gating : [],
            Array.isArray(summary.gatingIssues) ? summary.gatingIssues : []
          )
          .filter(Boolean);
        const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
        const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
        const summaryClass =
          gating.length > 0
            ? 'summary-page--fail'
            : warnings.length > 0
              ? 'summary-page--warn'
              : advisories.length > 0
                ? 'summary-page--advisory'
                : 'summary-page--ok';
        return {
          ...summary,
          page: payload.page || summary.page,
          _summaryClass: summaryClass,
        };
      });

      const sectionContent = renderSuiteFindingsBlock({
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking reduced-motion issues',
          emptyMessage: 'No blocking reduced-motion issues detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'Reduced-motion advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-page reduced-motion findings',
          summaryClass: 'summary-page--reduced-motion',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderReducedMotionPageCard(entrySummary),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      });
      if (!sectionContent) return '';

      if (multiBucket) {
        return renderProjectBlockSection({
          projectLabel,
          content: sectionContent,
        });
      }

      return sectionContent;
    })
    .filter(Boolean);

  return renderSchemaGroupContainer({
    sections,
    heading: multiBucket && group.title ? group.title : null,
    element: 'article',
  });
};

const renderReflowPageCard = (summary) => {
  if (!summary) return '';

  const gating = []
    .concat(
      Array.isArray(summary.gatingIssues) ? summary.gatingIssues : [],
      Array.isArray(summary.gating) ? summary.gating : []
    )
    .filter(Boolean);
  const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories.filter(Boolean) : [];
  const overflowSources = Array.isArray(summary.overflowSources)
    ? summary.overflowSources.filter(Boolean)
    : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const horizontalOverflow = Number.isFinite(summary.horizontalOverflowPx)
    ? summary.horizontalOverflowPx
    : Number(summary.horizontalOverflowPx) || 0;

  const hasGating = gating.length > 0;
  const hasWarnings = warnings.length > 0 || horizontalOverflow > 0;
  const hasAdvisories = advisories.length > 0;

  let statusMeta = { className: 'status-ok', label: 'Pass' };
  if (hasGating) {
    statusMeta = {
      className: 'status-error',
      label: `${formatCount(gating.length)} blocking issue(s)`,
    };
  } else if (hasWarnings) {
    statusMeta = { className: 'status-warning', label: 'Potential overflow detected' };
  } else if (hasAdvisories) {
    statusMeta = { className: 'status-info', label: 'Advisories present' };
  }

  const formatPx = (value) => {
    if (Number.isFinite(value)) return `${Math.round(value)}px`;
    if (value != null && value !== '') return String(value);
    return MISSING_DATA_LABEL;
  };

  const metrics = renderSummaryMetrics([
    { label: 'Viewport', value: ensureDisplayValue(summary.viewport || summary.projectName) },
    { label: 'Viewport width', value: formatPx(summary.viewportWidth) },
    { label: 'Document width', value: formatPx(summary.documentWidth) },
    { label: 'Horizontal overflow', value: formatPx(horizontalOverflow) },
  ]);

  const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
  const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
  const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

  const gatingSection =
    gatingEntries.length > 0
      ? renderPerPageIssuesTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking reflow issues', gatingEntries.length)
        )
      : '<p class="details">No blocking reflow issues detected.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderPerPageIssuesTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : horizontalOverflow > 0
        ? `<p class="details">Horizontal overflow measured at ${escapeHtml(formatPx(horizontalOverflow))}.</p>`
        : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderPerPageIssuesTable(
          advisoryEntries,
          formatUniqueRulesHeading('Advisories', advisoryEntries.length),
          { headingClass: 'summary-heading-best-practice' }
        )
      : '';

  const notesHtml = notes.length
    ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const overflowHtml = overflowSources.length
    ? `<details><summary>Potential overflow sources (${overflowSources.length})</summary><ul class="details">${overflowSources
        .map((offender) => {
          const tag = offender?.tag || 'element';
          const id = offender?.id ? `#${offender.id}` : '';
          const className = offender?.className ? `.${offender.className}` : '';
          const selector = `${tag}${id}${className}`;
          const text = offender?.text ? ` — ${offender.text}` : '';
          const left = Number.isFinite(offender?.rectLeft) ? Math.round(offender.rectLeft) : null;
          const right = Number.isFinite(offender?.rectRight)
            ? Math.round(offender.rectRight)
            : null;
          const extent =
            left != null && right != null
              ? ` (L ${left}px / R ${right}px)`
              : offender?.extent
                ? ` (${offender.extent})`
                : '';
          return `<li>${escapeHtml(`${selector}${extent}${text}`)}</li>`;
        })
        .join('')}</ul></details>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(ensurePageLabel(summary.page))}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${metrics}
      ${notesHtml}
      ${overflowHtml}
      ${gatingSection}
      ${warningSection}
      ${advisorySection}
    </section>
  `;
};

const renderReflowGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const multiBucket = buckets.length > 1;

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket) || {};
    const pagesData = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
    if (pagesData.length === 0) return '';

    const gatingIssues = collectIssueMessages(
      pagesData,
      ['gating', 'gatingIssues'],
      'critical'
    ).filter((issue) => issue.pageCount > 0);
    const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'moderate');

    const perPageEntries = (bucket.pageEntries || []).map((entry) => {
      const payload = entry.payload || {};
      const summary = payload.summary || {};
      const gating = Array.isArray(summary.gatingIssues)
        ? summary.gatingIssues
        : summary.gating || [];
      const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
      const summaryClass =
        (gating || []).length > 0
          ? 'summary-page--fail'
          : advisories.length > 0
            ? 'summary-page--advisory'
            : 'summary-page--ok';
      return {
        ...summary,
        page: payload.page || summary.page,
        _summaryClass: summaryClass,
      };
    });

    const sectionContent = renderSuiteFindingsBlock({
      gatingIssues,
      advisoryIssues,
      perPageEntries,
      gatingOptions: {
        title: 'Blocking reflow issues',
        emptyMessage: 'No blocking reflow issues detected.',
        includeWcagColumn: true,
      },
      advisoryOptions: {
        title: 'Reflow advisories',
        emptyMessage: 'No advisories detected.',
        includeWcagColumn: true,
      },
      perPageOptions: {
        heading: 'Per-page reflow findings',
        summaryClass: 'summary-page--reflow',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) => renderReflowPageCard(entrySummary),
        formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
      },
    });
    if (!sectionContent) return '';

    if (multiBucket) {
      const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
      return renderProjectBlockSection({
        projectLabel,
        content: sectionContent,
      });
    }

    return sectionContent;
  }).filter(Boolean);

  return renderSchemaGroupContainer({
    sections,
    heading: multiBucket && group.title ? group.title : null,
    element: 'article',
  });
};

const renderIframePageCard = (summary) => {
  if (!summary) return '';

  const gating = []
    .concat(
      Array.isArray(summary.gatingIssues) ? summary.gatingIssues : [],
      Array.isArray(summary.gating) ? summary.gating : []
    )
    .filter(Boolean);
  const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories.filter(Boolean) : [];
  const frames = Array.isArray(summary.frames) ? summary.frames.filter(Boolean) : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const unlabeledFrames = frames.filter((frame) => {
    if (!frame || typeof frame !== 'object') return false;
    return !(frame.title || frame.ariaLabel || frame.name);
  }).length;

  const hasGating = gating.length > 0;
  const hasWarnings = warnings.length > 0 || unlabeledFrames > 0;
  const hasAdvisories = advisories.length > 0;

  let statusMeta = { className: 'status-ok', label: 'Pass' };
  if (hasGating) {
    statusMeta = {
      className: 'status-error',
      label: `${formatCount(gating.length)} blocking issue(s)`,
    };
  } else if (hasWarnings) {
    statusMeta = { className: 'status-warning', label: 'Needs attention' };
  } else if (hasAdvisories) {
    statusMeta = { className: 'status-info', label: 'Advisories present' };
  }

  const iframeCount = Number.isFinite(summary.iframeCount) ? summary.iframeCount : frames.length;
  const crossOriginCount = frames.filter((frame) => frame && frame.crossOrigin).length;

  const metrics = renderSummaryMetrics([
    { label: 'Viewport', value: ensureDisplayValue(summary.viewport || summary.projectName) },
    { label: 'Iframes detected', value: formatCount(iframeCount) },
    { label: 'Cross-origin frames', value: formatCount(crossOriginCount) },
    { label: 'Missing accessible name', value: formatCount(unlabeledFrames) },
  ]);

  const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
  const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
  const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

  const gatingSection =
    gatingEntries.length > 0
      ? renderPerPageIssuesTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking iframe issues', gatingEntries.length)
        )
      : '<p class="details">No blocking iframe issues detected.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderPerPageIssuesTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : unlabeledFrames > 0
        ? `<p class="details">${escapeHtml(
            formatCount(unlabeledFrames)
          )} iframe(s) lack an accessible name.</p>`
        : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderPerPageIssuesTable(
          advisoryEntries,
          formatUniqueRulesHeading('Advisories', advisoryEntries.length),
          { headingClass: 'summary-heading-best-practice' }
        )
      : '';

  const notesHtml = notes.length
    ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const framesHtml = frames.length
    ? `<details><summary>Iframe inventory (${frames.length})</summary><ul class="details">${frames
        .map((frame, index) => {
          if (!frame || typeof frame !== 'object') return '';
          const originLabel = frame.crossOrigin ? 'Cross-origin' : 'Same-origin';
          const label = frame.title || frame.ariaLabel || frame.name || 'No accessible name';
          const location = frame.resolvedUrl || frame.src || `#${frame.index ?? index}`;
          return `<li>${escapeHtml(`${originLabel} → ${location} (${label})`)}</li>`;
        })
        .filter(Boolean)
        .join('')}</ul></details>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(ensurePageLabel(summary.page))}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${metrics}
      ${notesHtml}
      ${framesHtml}
      ${gatingSection}
      ${warningSection}
      ${advisorySection}
    </section>
  `;
};

const renderIframeGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const multiBucket = buckets.length > 1;

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const pagesData = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      if (pagesData.length === 0) return '';

      const gatingIssues = collectIssueMessages(
        pagesData,
        ['gating', 'gatingIssues'],
        'critical'
      ).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'moderate');

      const perPageEntries = (bucket.pageEntries || []).map((entry) => {
        const payload = entry.payload || {};
        const summary = payload.summary || {};
        const gating = []
          .concat(
            Array.isArray(summary.gating) ? summary.gating : [],
            Array.isArray(summary.gatingIssues) ? summary.gatingIssues : []
          )
          .filter(Boolean);
        const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
        const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
        const summaryClass =
          gating.length > 0 || warnings.length > 0
            ? 'summary-page--fail'
            : advisories.length > 0
              ? 'summary-page--advisory'
              : 'summary-page--ok';
        return {
          ...summary,
          page: payload.page || summary.page,
          _summaryClass: summaryClass,
        };
      });

      const sectionContent = renderSuiteFindingsBlock({
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking iframe issues',
          emptyMessage: 'No blocking iframe issues detected.',
          includeWcagColumn: true,
        },
        advisoryOptions: {
          title: 'Iframe advisories',
          emptyMessage: 'No advisories detected.',
          includeWcagColumn: true,
        },
        perPageOptions: {
          heading: 'Per-page iframe findings',
          summaryClass: 'summary-page--iframe',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderIframePageCard(entrySummary),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      });
      if (!sectionContent) return '';

      if (multiBucket) {
        const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'Iframes';
        return renderProjectBlockSection({
          projectLabel,
          content: sectionContent,
        });
      }

      return sectionContent;
    })
    .filter(Boolean);

  return renderSchemaGroupContainer({
    sections,
    heading: multiBucket && group.title ? group.title : null,
    element: 'article',
  });
};

const renderStructurePageCard = (summary) => {
  if (!summary) return '';
  const gating = Array.isArray(summary.gatingIssues)
    ? summary.gatingIssues
    : Array.isArray(summary.gating)
      ? summary.gating
      : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const headingSkips = Array.isArray(summary.headingSkips) ? summary.headingSkips : [];
  const headingOutline = Array.isArray(summary.headingOutline) ? summary.headingOutline : [];

  const hasGating = gating.length > 0;
  const hasWarnings = warnings.length > 0 || headingSkips.length > 0;
  const hasAdvisories = advisories.length > 0;

  const statusMeta = hasGating
    ? { className: 'status-error', label: `${formatCount(gating.length)} gating issue(s)` }
    : hasWarnings
      ? { className: 'status-warning', label: 'Needs attention' }
      : hasAdvisories
        ? { className: 'status-info', label: 'Advisories present' }
        : { className: 'status-ok', label: 'Pass' };

  const gatingEntries = aggregateStructureIssues(gating, 'critical');
  const warningEntries = aggregateStructureIssues([...warnings, ...headingSkips], 'moderate');
  let advisoryEntries = aggregateStructureIssues(advisories, 'minor');
  // Remove advisories that duplicate warnings by message/id to avoid
  // showing the same "Heading level sequence" issue as both moderate and minor.
  if (warningEntries.length && advisoryEntries.length) {
    const warnKeys = new Set(warningEntries.map((w) => (w.id || w.rule || '').toLowerCase()));
    advisoryEntries = advisoryEntries.filter(
      (a) => !warnKeys.has(String(a.id || a.rule || '').toLowerCase())
    );
  }

  const metaLines = [
    `<p class="details"><strong>H1 count:</strong> ${escapeHtml(
      formatCount(summary.h1Count ?? 'n/a')
    )}</p>`,
    `<p class="details"><strong>Main landmark:</strong> ${summary.hasMainLandmark ? 'Present' : 'Missing'}</p>`,
    `<p class="details"><strong>Navigation landmarks:</strong> ${escapeHtml(
      formatCount(summary.navigationLandmarks ?? 0)
    )}</p>`,
    `<p class="details"><strong>Header landmarks:</strong> ${escapeHtml(
      formatCount(summary.headerLandmarks ?? 0)
    )}</p>`,
    `<p class="details"><strong>Footer landmarks:</strong> ${escapeHtml(
      formatCount(summary.footerLandmarks ?? 0)
    )}</p>`,
  ]
    .filter(Boolean)
    .join('\n');

  const headingOutlineList = headingOutline
    .map(
      (entry) =>
        `<li><code>${escapeHtml(entry.text || 'Untitled heading')}</code> (H${entry.level ?? '?'})</li>`
    )
    .join('');

  const headingOutlineHtml = headingOutlineList
    ? `<details><summary>Heading outline (${headingOutline.length} headings)</summary><ul class="details">${headingOutlineList}</ul></details>`
    : '';

  const hydrateStructureIssue = (entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const resolvedViewports = Array.isArray(entry.viewports) && entry.viewports.length
      ? entry.viewports
      : Array.isArray(summary.viewports) && summary.viewports.length
        ? summary.viewports
        : summary.viewport
          ? [summary.viewport]
          : [];
    return {
      ...entry,
      browser: entry.browser || summary.browser || summary.projectName,
      projectName: entry.projectName || summary.projectName,
      viewport: entry.viewport || summary.viewport,
      viewports: resolvedViewports,
    };
  };

  const gatingSection = gatingEntries.length
    ? renderPerPageIssuesTable(
        gatingEntries,
        `Gating structural issues (${formatCount(gatingEntries.length)})`,
        { hydrate: hydrateStructureIssue }
      )
    : '<p class="details">No gating issues detected.</p>';

  const warningsSection = warningEntries.length
    ? renderPerPageIssuesTable(
        warningEntries,
        `Structural warnings (${formatCount(warningEntries.length)})`,
        { hydrate: hydrateStructureIssue }
      )
    : '<p class="details">No structural warnings detected.</p>';

  const advisoriesSection = advisoryEntries.length
    ? renderPerPageIssuesTable(
        advisoryEntries,
        `Structural advisories (${formatCount(advisoryEntries.length)})`,
        { headingClass: 'summary-heading-best-practice', hydrate: hydrateStructureIssue }
      )
    : '<p class="details">No structural advisories detected.</p>';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(ensurePageLabel(summary.page))}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      <div class="page-card__meta">
        ${metaLines}
      </div>
      ${gatingSection}
      ${warningsSection}
      ${advisoriesSection}
      ${headingOutlineHtml}
    </section>
  `;
};

const renderStructureGroupHtml = (group) => {
  const firstSummary = Array.isArray(group?.summaries) ? group.summaries[0] : null;
  if (firstSummary?.metadata?.scope === 'page' || (group.runEntries || []).length === 0) {
    return '';
  }
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const multiBucket = buckets.length > 1;

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const metadata = runPayload?.metadata || {};
    const detailViewports = Array.isArray(runPayload?.details?.viewports)
      ? runPayload.details.viewports
      : [];
    const metadataViewports = Array.isArray(metadata.viewports) ? metadata.viewports : [];
    const viewportList =
      detailViewports.length > 0
        ? detailViewports
        : metadataViewports.length > 0
          ? metadataViewports
          : [];
    const projectLabel = metadata.projectName || bucket.projectName || 'Selected project';
    const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

    let aggregatedGatingIssues = null;
    let aggregatedAdvisories = null;

    if (runPayload) {
      const pagesData = Array.isArray(runPayload.details?.pages) ? runPayload.details.pages : [];

      const pickStructureSample = (raw) => {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.sample != null) {
          const label = String(raw.sample).trim();
          if (label) return label;
        }
        if (Array.isArray(raw.samples)) {
          for (const value of raw.samples) {
            const label = String(value || '').trim();
            if (label) return label;
          }
        }
        return null;
      };

      const normalizeStructureAdvisory = ({ message, raw }) => {
        const helpUrl = raw && typeof raw === 'object' ? raw.helpUrl || null : null;
        const helpHtml = raw && typeof raw === 'object' ? raw.helpHtml || null : null;
        const helpLabel = raw && typeof raw === 'object' ? raw.helpLabel || null : null;
        const summary =
          (raw &&
            typeof raw === 'object' &&
            typeof raw.summary === 'string' &&
            raw.summary.trim()) ||
          (typeof message === 'string' ? message.trim() : '');
        const sample = pickStructureSample(raw);
        if (summary) {
          return { key: summary, label: summary, sample, helpUrl, helpHtml, helpLabel };
        }
        const trimmedMessage = typeof message === 'string' ? message.trim() : '';
        const fallback = trimmedMessage || 'Structural advisory';
        return { key: fallback, label: fallback, sample, helpUrl, helpHtml, helpLabel };
      };

      const normalizeStructureGating = ({ message, raw }) => {
        const helpUrl = raw && typeof raw === 'object' ? raw.helpUrl || null : null;
        const helpHtml = raw && typeof raw === 'object' ? raw.helpHtml || null : null;
        const helpLabel = raw && typeof raw === 'object' ? raw.helpLabel || null : null;
        const summary =
          (raw &&
            typeof raw === 'object' &&
            typeof raw.summary === 'string' &&
            raw.summary.trim()) ||
          (typeof message === 'string' ? message.trim() : '');
        const sample = pickStructureSample(raw);
        if (summary) {
          return { key: summary, label: summary, sample, helpUrl, helpHtml, helpLabel };
        }
        const trimmedMessage = typeof message === 'string' ? message.trim() : '';
        const fallback = trimmedMessage || 'Structural gating issue';
        return { key: fallback, label: fallback, sample, helpUrl, helpHtml, helpLabel };
      };

      const gatingIssues = collectIssueMessages(pagesData, ['gatingIssues', 'gating'], 'critical', {
        normalize: normalizeStructureGating,
      }).filter((issue) => issue.pageCount > 0);

      const combinedDedupe = collectIssueMessages(
        pagesData,
        ['headingSkips', 'warnings', 'advisories'],
        'minor',
        {
          normalize: normalizeStructureAdvisory,
          dedupeIgnoreImpact: true,
        }
      ).filter((issue) => issue.pageCount > 0);

      aggregatedGatingIssues = gatingIssues;
      aggregatedAdvisories = combinedDedupe;
    }

    const perPageSource = Array.isArray(runPayload?.details?.pages)
      ? runPayload.details.pages.map((page) => ({
          page,
          payload: {
            page: page.page,
            summary: page,
          },
        }))
      : bucket.pageEntries;

    const perPageEntries = (perPageSource || []).map((entry) => {
      const payload = entry.payload || {};
      const summary = payload.summary || entry.page || {};
      const pageLabel = payload.page || summary.page;
      const gating = Array.isArray(summary.gating)
        ? summary.gating
        : Array.isArray(summary.gatingIssues)
          ? summary.gatingIssues
          : [];
      const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
      const headingSkips = Array.isArray(summary.headingSkips) ? summary.headingSkips : [];
      const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
      const summaryClass = gating.length
        ? 'summary-page--fail'
        : warnings.length || headingSkips.length
          ? 'summary-page--warn'
          : advisories.length
            ? 'summary-page--advisory'
            : 'summary-page--ok';
      return {
        ...summary,
        page: pageLabel,
        _summaryClass: summaryClass,
      };
    });

    const sectionContent = renderSuiteFindingsBlock({
      gatingIssues: aggregatedGatingIssues,
      advisoryIssues: aggregatedAdvisories,
      perPageEntries,
      gatingOptions: {
        title: formatUniqueRulesHeading(
          'Gating structural issues',
          Array.isArray(aggregatedGatingIssues) ? aggregatedGatingIssues.length : 0
        ),
        emptyMessage: 'No gating issues detected.',
        viewportLabel,
        includeWcagColumn: true,
      },
      advisoryOptions: {
        title: formatUniqueRulesHeading(
          'Structural advisories and warnings',
          Array.isArray(aggregatedAdvisories) ? aggregatedAdvisories.length : 0
        ),
        emptyMessage: 'No advisories detected.',
        viewportLabel,
        includeWcagColumn: true,
      },
      perPageOptions: {
        heading: 'Per-page structure findings',
        summaryClass: 'summary-page--structure',
        renderCard: (entrySummary) => renderStructurePageCard(entrySummary),
        formatSummaryLabel: (entrySummary) => ensurePageLabel(entrySummary?.page),
      },
    });
    if (!sectionContent) return '';

    if (multiBucket) {
      const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'Project';
      return renderProjectBlockSection({
        projectLabel,
        content: sectionContent,
      });
    }

    return sectionContent;
  }).filter(Boolean);

  return renderSchemaGroupContainer({
    sections,
    heading: multiBucket && group.title ? group.title : null,
    element: 'article',
  });
};

  return {
    renderKeyboardPageCard,
    renderKeyboardGroupHtml,
    renderReducedMotionPageCard,
    renderReducedMotionGroupHtml,
    renderReflowPageCard,
    renderReflowGroupHtml,
    renderIframePageCard,
    renderIframeGroupHtml,
    renderStructurePageCard,
    renderStructureGroupHtml,
  };
};
