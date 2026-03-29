const { escapeHtml, formatCount } = require('../../report-template-helpers');

module.exports = function createAccessibilityRenderers({
  deriveWcagPageStatus,
  formatWcagStability,
  renderPerPageIssuesTable,
  collectSchemaProjects,
  firstRunPayload,
  assembleSuiteSections,
  renderProjectBlockSection,
  renderSchemaGroupContainer,
  renderAccessibilityRuleTable,
  formatRuleHeading,
  formatPageLabel,
  renderSchemaMetricsMarkdown,
  renderWcagRunSummary,
  WCAG_PER_PAGE_TOGGLE_SCRIPT,
  KIND_PAGE_SUMMARY,
}) {
  const renderWcagPageCard = (summary, { viewportLabel, failThreshold } = {}) => {
    if (!summary) return '';

    const statusMeta = deriveWcagPageStatus(summary);
    const violations = Array.isArray(summary.violations) ? summary.violations : [];
    const advisories =
      Array.isArray(summary.advisoriesList) && summary.advisoriesList.length
        ? summary.advisoriesList
        : Array.isArray(summary.advisories)
          ? summary.advisories
          : [];
    const bestPractices =
      Array.isArray(summary.bestPracticesList) && summary.bestPracticesList.length
        ? summary.bestPracticesList
        : Array.isArray(summary.bestPractices)
          ? summary.bestPractices
          : [];
    const stabilityHtml = formatWcagStability(summary.stability);
    const advisoryCount = summary.advisoryFindings ?? advisories.length;
    const bestPracticeCount = summary.bestPracticeFindings ?? bestPractices.length;

    const metaLines = [
      `<p class="details"><strong>Viewport:</strong> ${escapeHtml(
        summary.projectName || viewportLabel || 'Not recorded'
      )}</p>`,
      stabilityHtml ? `<p class="details"><strong>Stability:</strong> ${stabilityHtml}</p>` : '',
      `<p class="details"><strong>Gating:</strong> ${escapeHtml(
        summary.gatingLabel || failThreshold || 'Not recorded'
      )}</p>`,
      advisoryCount
        ? `<p class="details"><strong>Advisory findings:</strong> ${escapeHtml(
            formatCount(advisoryCount)
          )}</p>`
        : '',
      bestPracticeCount
        ? `<p class="details"><strong>Best-practice advisories:</strong> ${escapeHtml(
            formatCount(bestPracticeCount)
          )}</p>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];
    const notesHtml = notes.length
      ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
          .map((note) => `<li>${escapeHtml(String(note))}</li>`)
          .join('')}</ul></details>`
      : '';

    const hydrateIssueMetadata = (issue = {}) => {
      const viewports = Array.isArray(issue.viewports) && issue.viewports.length
        ? issue.viewports
        : Array.isArray(summary.viewports) && summary.viewports.length
          ? summary.viewports
          : viewportLabel
            ? [viewportLabel]
            : [];
      const browserLabel =
        issue.browser || summary.browser || viewportLabel || summary.projectName || null;
      return {
        ...issue,
        browser: browserLabel,
        browsers:
          Array.isArray(issue.browsers) && issue.browsers.length
            ? issue.browsers
            : browserLabel
              ? [browserLabel]
              : undefined,
        viewport: issue.viewport || viewports[0] || viewportLabel || null,
        viewports,
      };
    };

    const gatingSection = violations.length
      ? renderPerPageIssuesTable(
          violations,
          `Gating WCAG violations (${formatCount(violations.length)})`,
          { hydrate: hydrateIssueMetadata }
        )
      : '<p class="details">No gating violations detected.</p>';

    const advisorySection = advisories.length
      ? renderPerPageIssuesTable(
          advisories,
          `WCAG advisory findings (${formatCount(advisories.length)})`,
          { hydrate: hydrateIssueMetadata }
        )
      : '';

    const bestPracticeSection = bestPractices.length
      ? renderPerPageIssuesTable(
          bestPractices,
          `Best-practice advisories (${formatCount(bestPractices.length)})`,
          { headingClass: 'summary-heading-best-practice', hydrate: hydrateIssueMetadata }
        )
      : '';

    return `
      <section class="summary-report summary-a11y summary-a11y--page-card">
        <div class="page-card__header">
          <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
          <span class="status-pill ${statusMeta.pillClass}">${escapeHtml(statusMeta.pillLabel)}</span>
        </div>
        <div class="page-card__meta">
          ${metaLines}
        </div>
        ${notesHtml}
        ${gatingSection}
        ${advisorySection}
        ${bestPracticeSection}
      </section>
    `;
  };

  const renderWcagPerPageSection = (pages, options = {}) => {
    const entries = Array.isArray(pages) ? pages : [];
    if (entries.length === 0) return '';

    const detailsHtml = entries
      .map((page) => {
        const summary = page.summary || page;
        const statusMeta = deriveWcagPageStatus(summary);
        const cardHtml = renderWcagPageCard(summary, options);
        if (!cardHtml) return '';
        const label = formatPageLabel(summary.page || page.page || 'Page');
        return `
          <details class="summary-page summary-page--wcag ${statusMeta.pageClass}">
            <summary>${escapeHtml(label)}</summary>
            <div class="summary-page__body">
              ${cardHtml}
            </div>
          </details>
        `;
      })
      .filter(Boolean)
      .join('\n');

    if (!detailsHtml.trim()) return '';

    return `
      <section class="summary-report summary-a11y summary-a11y--per-page" data-per-page="list">
        <div class="summary-per-page-header">
          <h3>Per-page findings</h3>
          <div class="summary-toggle-controls">
            <button type="button" class="summary-toggle-button" data-toggle="expand">Expand all</button>
            <button type="button" class="summary-toggle-button" data-toggle="collapse">Collapse all</button>
          </div>
        </div>
        ${detailsHtml}
      </section>
      <script>${WCAG_PER_PAGE_TOGGLE_SCRIPT}</script>
    `;
  };

  const renderAccessibilityGroupHtml = (group) => {
    const buckets = collectSchemaProjects(group);
    if (buckets.length === 0) return '';

    const dataReady = buckets.every((bucket) => {
      const runPayload = firstRunPayload(bucket);
      return runPayload?.details && Array.isArray(runPayload.details.pages);
    });

    if (!dataReady) {
      return '';
    }
    const multiBucket = buckets.length > 1;

    const sections = buckets
      .map((bucket) => {
        const runPayload = firstRunPayload(bucket);
        if (!runPayload) return '';

        const details = runPayload.details || {};
        const overview = runPayload.overview || {};
        const metadata = runPayload.metadata || {};
        const projectLabel = metadata.projectName || bucket.projectName || 'Chrome';
        const viewportList =
          Array.isArray(details.viewports) && details.viewports.length
            ? details.viewports
            : Array.isArray(metadata.viewports) && metadata.viewports.length
              ? metadata.viewports
              : projectLabel
                ? [projectLabel]
                : [];
        const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;
        const viewportCount = viewportList.length || 1;

        const runSummaryHtml = renderWcagRunSummary(overview, details, {
          viewportLabel,
          viewportsCount: viewportCount,
        });

        const ruleSnapshots = Array.isArray(runPayload.ruleSnapshots)
          ? runPayload.ruleSnapshots
          : [];
        const gatingRules = ruleSnapshots.filter(
          (snapshot) => (snapshot.category || '').toLowerCase() === 'gating'
        );
        const advisoryRules = ruleSnapshots.filter(
          (snapshot) => (snapshot.category || '').toLowerCase() === 'advisory'
        );
        const bestPracticeRules = ruleSnapshots.filter(
          (snapshot) => (snapshot.category || '').toLowerCase() === 'best-practice'
        );

        const ruleSections = [
          renderAccessibilityRuleTable(
            formatRuleHeading('Gating WCAG violations', gatingRules.length),
            gatingRules,
            {
              sectionClass: 'summary-a11y--rule-table summary-a11y--rule-table-gating',
              projectName: projectLabel,
            }
          ),
          renderAccessibilityRuleTable(
            formatRuleHeading('WCAG advisory findings', advisoryRules.length),
            advisoryRules,
            {
              sectionClass: 'summary-a11y--rule-table summary-a11y--rule-table-advisory',
              projectName: projectLabel,
            }
          ),
          renderAccessibilityRuleTable(
            formatRuleHeading('Best-practice advisories', bestPracticeRules.length),
            bestPracticeRules,
            {
              headingClass: 'summary-heading-best-practice',
              sectionClass: 'summary-a11y--rule-table summary-a11y--rule-table-best-practice',
              projectName: projectLabel,
            }
          ),
        ]
          .filter(Boolean)
          .join('\n');

        const perPageEntries = (bucket.pageEntries || [])
          .map((entry) => entry.payload || {})
          .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);
        const perPageSource =
          perPageEntries.length > 0
            ? perPageEntries
            : Array.isArray(details.pages)
              ? details.pages
              : [];

        const perPageHtml = renderWcagPerPageSection(perPageSource, {
          viewportLabel,
          failThreshold: details.failThreshold || overview.failThreshold || metadata.failOn,
        });

        const content = assembleSuiteSections([runSummaryHtml, ruleSections, perPageHtml]);
        if (!content) return '';

        if (multiBucket) {
          return renderProjectBlockSection({
            projectLabel,
            content,
          });
        }

        return content;
      })
      .filter(Boolean);

    return renderSchemaGroupContainer({
      sections,
      heading: multiBucket && group.title ? group.title : null,
      element: 'section',
    });
  };

  const formatAccessibilityNotesMarkdown = (summary) => {
    const notes = Array.isArray(summary.notes) ? summary.notes.slice(0, 10) : [];
    const extra = [];
    if (summary.stability) {
      const stability = summary.stability || {};
      const label = stability.ok ? 'Stable' : 'Stability issue';
      const detail = stability.strategy ? `${label} (strategy: ${stability.strategy})` : label;
      extra.push(detail);
    }
    if (summary.httpStatus && summary.httpStatus !== 200) {
      extra.push(`HTTP ${summary.httpStatus}`);
    }
    const combined = [...notes, ...extra];
    if (combined.length === 0) return 'None';
    return combined.map((note) => String(note)).join('<br />');
  };

  const renderAccessibilityGroupMarkdown = (group) => {
    const buckets = collectSchemaProjects(group);
    if (buckets.length === 0) return '';

    const sections = buckets
      .map((bucket) => {
        const runPayload = firstRunPayload(bucket);
        const pages = bucket.pageEntries
          .map((entry) => entry.payload || {})
          .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);
        const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
        const heading = `${group.title || 'WCAG findings summary'} – ${projectLabel}`;
        const overview = runPayload?.overview
          ? renderSchemaMetricsMarkdown(runPayload.overview)
          : '';

        const pageSections = pages.map((payload) => {
          const summary = payload.summary || {};

          const status = summary.status || 'passed';
          const statusLabel = status.replace(/[-_/]+/g, ' ');
          const notes = formatAccessibilityNotesMarkdown(summary);
          return `### ${payload.page || 'unknown'}\n\n- Status: ${statusLabel}\n- Gating: ${summary.gatingViolations ?? 0}\n- Advisory: ${summary.advisoryFindings ?? 0}\n- Best practice: ${summary.bestPracticeFindings ?? 0}\n- HTTP: ${summary.httpStatus ?? '—'}\n- Notes: ${notes}`;
        });

        const parts = [`## ${heading}`];
        if (overview) parts.push(overview);
        parts.push(...pageSections);
        return parts.join('\n\n');
      })
      .filter(Boolean);

    return sections.join('\n\n');
  };

  return {
    renderWcagPageCard,
    renderAccessibilityGroupHtml,
    renderAccessibilityGroupMarkdown,
  };
};
