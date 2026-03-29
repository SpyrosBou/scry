const createBucketedSuiteRenderer = require('./helpers/bucketed-suite');

module.exports = function createResponsiveRenderers({
  collectSchemaProjects,
  firstRunPayload,
  collectIssueMessages,
  renderSuiteFindingsBlock,
  renderProjectBlockSection,
  renderSchemaGroupContainer,
  renderPerPageIssuesTable,
  formatUniqueRulesHeading,
  formatPageLabel,
  renderSummaryMetrics,
  renderSchemaMetricsMarkdown,
  normalizeResponsiveMessage,
  aggregatePageIssueEntries,
  formatMillisecondsDisplay,
  escapeHtml,
  formatCount,
  ensureDisplayValue,
  ensurePageLabel,
}) {
  const renderBucketedSuite = createBucketedSuiteRenderer({
    collectSchemaProjects,
    renderSuiteFindingsBlock,
    renderProjectBlockSection,
    renderSchemaGroupContainer,
  });

  const normaliseComparisons = (bucket, runPayload) => {
    const details = runPayload?.details || {};
    if (Array.isArray(details.comparisons) && details.comparisons.length > 0) {
      return details.comparisons.map((comparison) => ({
        ...comparison,
        page: comparison.page || details.page || runPayload?.metadata?.page || '/',
      }));
    }

    return (bucket.pageEntries || []).map((entry) => {
      const payload = entry.payload || {};
      return {
        ...(payload.summary || {}),
        page: payload.page || details.page || runPayload?.metadata?.page || '/',
      };
    });
  };

  const aggregateMessages = (items, impact) => {
    const map = new Map();
    (items || []).forEach((raw) => {
      const message = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!message) return;
      if (!map.has(message)) map.set(message, { impact, message, count: 0 });
      map.get(message).count += 1;
    });
    return Array.from(map.values());
  };

  const renderEntriesTable = (entries, heading, options = {}) =>
    entries.length
      ? renderPerPageIssuesTable(
          entries.map((entry) => ({
            impact: entry.impact,
            id: entry.message,
            nodesCount: entry.count,
          })),
          heading,
          { ...options, includeWcagColumn: false }
        )
      : '';

  const renderResponsiveStructureGroupMarkdown = (group) => {
    const buckets = collectSchemaProjects(group);
    if (buckets.length === 0) return '';

    const sections = buckets.map((bucket) => {
      const runPayload = firstRunPayload(bucket);
      const pages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];

      const heading = [
        group.title || 'Responsive structure summary',
        bucket.projectName || runPayload?.metadata?.projectName || 'default',
      ].join(' – ');

      const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

      const header =
        '| Page | Load (ms) | Threshold | Header | Navigation | Content | Footer | Issues |';
      const separator = '| --- | --- | --- | --- | --- | --- | --- | --- |';
      const rows = pages.map((page) => {
        const issues = [...(page.gatingIssues || []), ...(page.warnings || [])];
        const issuesCell = issues.length ? issues.map((item) => `⚠️ ${item}`).join('<br />') : 'None';
        return `| \`${page.page || 'unknown'}\` | ${page.loadTimeMs != null ? Math.round(page.loadTimeMs) : '—'} | ${page.thresholdMs != null ? Math.round(page.thresholdMs) : '—'} | ${page.headerPresent ? '✅' : '⚠️'} | ${page.navigationPresent ? '✅' : '⚠️'} | ${page.contentPresent ? '✅' : '⚠️'} | ${page.footerPresent ? '✅' : '⚠️'} | ${issuesCell} |`;
      });

      const parts = [`## ${heading}`];
      if (overview) parts.push(overview);
      if (rows.length > 0) {
        parts.push('', header, separator, ...rows);
      } else {
        parts.push('', '_No responsive structure data captured._');
      }
      return parts.join('\n');
    });

    return sections.join('\n\n');
  };

  const renderResponsiveWpGroupMarkdown = (group) => {
    const buckets = collectSchemaProjects(group);
    if (buckets.length === 0) return '';

    const sections = buckets.map((bucket) => {
      const runPayload = firstRunPayload(bucket);
      const pages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const heading = `${group.title || 'WordPress responsive features summary'} – ${bucket.projectName || runPayload?.metadata?.projectName || 'default'}`;
      const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

      const header = '| Viewport | Responsive | Block elements | Widgets | Warnings | Info |';
      const separator = '| --- | --- | --- | --- | --- | --- |';
      const rows = pages.map((page) => {
        const warnings = (page.warnings || []).length
          ? page.warnings.map((item) => `⚠️ ${item}`).join('<br />')
          : 'None';
        const info = (page.info || []).length
          ? page.info.map((item) => `ℹ️ ${item}`).join('<br />')
          : 'None';
        return `| ${page.viewport || 'viewport'} | ${page.responsiveDetected ? '✅' : '⚠️'} | ${page.blockElements ?? 0} | ${page.widgets ?? 0} | ${warnings} | ${info} |`;
      });

      const parts = [`## ${heading}`];
      if (overview) parts.push(overview);
      if (rows.length > 0) {
        parts.push('', header, separator, ...rows);
      } else {
        parts.push('', '_No WordPress responsive data captured._');
      }
      return parts.join('\n');
    });

    return sections.join('\n\n');
  };

  const renderResponsiveStructurePageCard = (summary, { viewportLabel } = {}) => {
    if (!summary) return '';

    const gating = []
      .concat(
        Array.isArray(summary.gating) ? summary.gating : [],
        Array.isArray(summary.gatingIssues) ? summary.gatingIssues : [],
        Array.isArray(summary.errors) ? summary.errors : []
      )
      .filter(Boolean);
    const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
    const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
    const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];
    const info = Array.isArray(summary.info) ? summary.info.filter(Boolean) : [];

    const statusMeta =
      gating.length > 0
        ? { className: 'status-error', label: `${formatCount(gating.length)} blocking issue(s)` }
        : warnings.length > 0
          ? { className: 'status-warning', label: 'Warnings present' }
          : advisories.length > 0
            ? { className: 'status-info', label: 'Advisories present' }
            : { className: 'status-ok', label: 'Pass' };

    const metrics = renderSummaryMetrics([
      { label: 'Viewport', value: ensureDisplayValue(summary.viewport || viewportLabel) },
      { label: 'Load time', value: formatMillisecondsDisplay(summary.loadTimeMs) },
      { label: 'Threshold', value: formatMillisecondsDisplay(summary.thresholdMs) },
      {
        label: 'Header landmark',
        value: summary.headerPresent === false ? 'Missing' : 'Present',
      },
      {
        label: 'Navigation landmark',
        value: summary.navigationPresent === false ? 'Missing' : 'Present',
      },
      {
        label: 'Content landmark',
        value: summary.contentPresent === false ? 'Missing' : 'Present',
      },
      {
        label: 'Footer landmark',
        value: summary.footerPresent === false ? 'Missing' : 'Present',
      },
    ]);

    const gatingEntries = aggregateMessages(gating, 'critical');
    const warningEntries = aggregateMessages(warnings, 'moderate');
    const advisoryEntries = aggregateMessages(advisories, 'minor');

    const gatingSection =
      renderEntriesTable(
        gatingEntries,
        formatUniqueRulesHeading('Blocking issues', gatingEntries.length)
      ) || '<p class="details">No blocking responsive issues detected.</p>';

    const warningSection =
      renderEntriesTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`) ||
      (warnings.length > 0 ? '' : '<p class="details">No warnings recorded.</p>');

    const advisorySection =
      renderEntriesTable(
        advisoryEntries,
        formatUniqueRulesHeading('Advisories', advisoryEntries.length),
        {
          headingClass: 'summary-heading-best-practice',
        }
      ) || '';

    const notesHtml = notes.length
      ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
          .map((note) => `<li>${escapeHtml(String(note))}</li>`)
          .join('')}</ul></details>`
      : '';

    const infoHtml = info.length
      ? `<details><summary>Informational checks (${info.length})</summary><ul class="details">${info
          .map((entry) => `<li>${escapeHtml(String(entry))}</li>`)
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
        ${infoHtml}
        ${gatingSection}
        ${warningSection}
        ${advisorySection}
      </section>
    `;
  };

  const renderResponsiveStructureGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const projectLabel =
        metadata.projectName || bucket.projectName || 'Responsive structure audit';
      const viewportLabel = (viewportList.length ? viewportList.join(', ') : null) || projectLabel;

      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.summary);

      const pagesData =
        detailPages.length > 0
          ? detailPages
          : pageEntryPayloads.map((payload) => payload.summary || payload);

      if (pagesData.length === 0) return null;

      const pagesForGating = pagesData.map((page) => {
        const combined = []
          .concat(
            Array.isArray(page.gatingIssues) ? page.gatingIssues : [],
            Array.isArray(page.gating) ? page.gating : [],
            Array.isArray(page.errors) ? page.errors : []
          )
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry }));
        return {
          ...page,
          responsiveGating: combined,
        };
      });
      const gatingIssues = collectIssueMessages(pagesForGating, 'responsiveGating', 'critical', {
        normalize: normalizeResponsiveMessage,
        dedupeIgnoreImpact: true,
      }).filter((issue) => issue.pageCount > 0);

      const pagesForAdvisories = pagesData.map((page) => {
        const combined = []
          .concat(
            Array.isArray(page.warnings) ? page.warnings : [],
            Array.isArray(page.advisories) ? page.advisories : []
          )
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry }));
        return {
          ...page,
          responsiveAdvisories: combined,
        };
      });
      const advisoryIssues = collectIssueMessages(
        pagesForAdvisories,
        'responsiveAdvisories',
        'moderate',
        {
          normalize: normalizeResponsiveMessage,
          dedupeIgnoreImpact: true,
        }
      );

      let perPageEntries = (bucket.pageEntries || []).map((entry) => {
        const payload = entry.payload || {};
        const summary = payload.summary || {};
        const gatingList = []
          .concat(
            Array.isArray(summary.gating) ? summary.gating : [],
            Array.isArray(summary.gatingIssues) ? summary.gatingIssues : [],
            Array.isArray(summary.errors) ? summary.errors : []
          )
          .filter(Boolean);
        const warningsList = Array.isArray(summary.warnings) ? summary.warnings : [];
        const advisoriesList = Array.isArray(summary.advisories) ? summary.advisories : [];
        const summaryClass =
          gatingList.length > 0
            ? 'summary-page--fail'
            : warningsList.length > 0
              ? 'summary-page--warn'
              : advisoriesList.length > 0
                ? 'summary-page--advisory'
                : 'summary-page--ok';

        return {
          ...summary,
          page: payload.page || summary.page,
          viewport: payload.metadata?.viewport || summary.viewport || viewportLabel,
          _summaryClass: summaryClass,
        };
      });

      if (perPageEntries.length === 0) {
        perPageEntries = pagesData.map((summary) => {
          const gatingList = []
            .concat(
              Array.isArray(summary.gating) ? summary.gating : [],
              Array.isArray(summary.gatingIssues) ? summary.gatingIssues : [],
              Array.isArray(summary.errors) ? summary.errors : []
            )
            .filter(Boolean);
          const warningsList = Array.isArray(summary.warnings) ? summary.warnings : [];
          const advisoriesList = Array.isArray(summary.advisories) ? summary.advisories : [];
          const summaryClass =
            gatingList.length > 0
              ? 'summary-page--fail'
              : warningsList.length > 0
                ? 'summary-page--warn'
                : advisoriesList.length > 0
                  ? 'summary-page--advisory'
                  : 'summary-page--ok';
          return {
            ...summary,
            page: summary.page,
            viewport: summary.viewport || viewportLabel,
            _summaryClass: summaryClass,
          };
        });
      }

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking responsive issues',
          emptyMessage: 'No blocking responsive issues detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'Responsive advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-page responsive findings',
          summaryClass: 'summary-page--responsive',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) =>
            renderResponsiveStructurePageCard(entrySummary, { viewportLabel }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });

  const renderResponsiveWpPageCard = (summary, { projectLabel } = {}) => {
    if (!summary) return '';

    const gating = []
      .concat(
        Array.isArray(summary.gating) ? summary.gating : [],
        Array.isArray(summary.gatingIssues) ? summary.gatingIssues : []
      )
      .filter(Boolean);
    const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
    const advisories = Array.isArray(summary.advisories) ? summary.advisories.filter(Boolean) : [];
    const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

    const responsiveDetected = summary.responsiveDetected !== false;
    const hasGating = gating.length > 0;
    const hasWarnings = warnings.length > 0 || !responsiveDetected;
    const hasAdvisories = advisories.length > 0;

    let statusMeta = { className: 'status-ok', label: 'Pass' };
    if (hasGating) {
      statusMeta = {
        className: 'status-error',
        label: `${formatCount(gating.length)} blocking issue(s)`,
      };
    } else if (!responsiveDetected) {
      statusMeta = { className: 'status-warning', label: 'Responsive features missing' };
    } else if (hasWarnings) {
      statusMeta = { className: 'status-warning', label: 'Warnings present' };
    } else if (hasAdvisories) {
      statusMeta = { className: 'status-info', label: 'Advisories present' };
    }

    const metricsInput = [
      { label: 'Viewport', value: ensureDisplayValue(summary.viewport || projectLabel) },
      { label: 'Responsive layout', value: responsiveDetected ? 'Detected' : 'Missing' },
      { label: 'WordPress blocks', value: formatCount(summary.blockElements ?? 0) },
      { label: 'Widgets', value: formatCount(summary.widgets ?? 0) },
    ];
    if (summary.status != null) {
      metricsInput.push({ label: 'HTTP status', value: formatCount(summary.status) });
    }
    const metrics = renderSummaryMetrics(metricsInput);

    const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
    const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
    const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

    if (!responsiveDetected) {
      warningEntries.push({
        impact: 'moderate',
        id: 'Responsive WordPress features not detected',
        nodesCount: 1,
        tags: [],
      });
    }

    const gatingSection =
      gatingEntries.length > 0
        ? renderPerPageIssuesTable(
            gatingEntries,
            formatUniqueRulesHeading('Blocking issues', gatingEntries.length)
          )
        : '<p class="details">No blocking issues detected for this viewport.</p>';

    const warningSection =
      warningEntries.length > 0
        ? renderPerPageIssuesTable(
            warningEntries,
            `Warnings (${formatCount(warningEntries.length)})`
          )
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

    return `
      <section class="summary-report summary-a11y summary-a11y--page-card">
        <div class="page-card__header">
          <h3>${escapeHtml(ensurePageLabel(summary.page))}</h3>
          <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
        </div>
        ${metrics}
        ${notesHtml}
        ${gatingSection}
        ${warningSection}
        ${advisorySection}
      </section>
    `;
  };

  const renderResponsiveWpGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload) return null;

      const details = runPayload.details || {};
      const pagesData = Array.isArray(details.pages) ? details.pages : [];
      if (pagesData.length === 0) return null;

      const metadata = runPayload.metadata || {};
      const projectLabel =
        metadata.projectName || bucket.projectName || 'WordPress responsive features';
      const detailViewports = Array.isArray(details.viewports) ? details.viewports : [];
      const metadataViewports = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportList = detailViewports.length > 0 ? detailViewports : metadataViewports;
      const viewportLabel = viewportList.length ? viewportList.join(', ') : null;

      const issueSource = pagesData.map((page) => {
        const gatingList = []
          .concat(
            Array.isArray(page.gating) ? page.gating : [],
            Array.isArray(page.gatingIssues) ? page.gatingIssues : []
          )
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry }));
        const warningsList = (Array.isArray(page.warnings) ? page.warnings : [])
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry }));
        const advisoriesList = (Array.isArray(page.advisories) ? page.advisories : [])
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry }));
        return {
          ...page,
          page: `${page.viewport || 'Viewport'} › ${page.page || '/'}`,
          gatingNormalized: gatingList,
          warningsNormalized: warningsList,
          advisoriesNormalized: advisoriesList,
        };
      });

      const gatingIssues = collectIssueMessages(issueSource, 'gatingNormalized', 'critical', {
        normalize: normalizeResponsiveMessage,
        dedupeIgnoreImpact: true,
      });
      const warningIssues = collectIssueMessages(issueSource, 'warningsNormalized', 'moderate', {
        normalize: normalizeResponsiveMessage,
        dedupeIgnoreImpact: true,
      });
      const advisoryIssues = collectIssueMessages(issueSource, 'advisoriesNormalized', 'minor', {
        normalize: normalizeResponsiveMessage,
        dedupeIgnoreImpact: true,
      });
      const combinedAdvisories = warningIssues.concat(advisoryIssues);

      let perPageEntries = (bucket.pageEntries || []).map((entry) => {
        const payload = entry.payload || {};
        const summary = payload.summary || {};
        const gatingList = []
          .concat(
            Array.isArray(summary.gating) ? summary.gating : [],
            Array.isArray(summary.gatingIssues) ? summary.gatingIssues : []
          )
          .filter(Boolean);
        const warningsList = Array.isArray(summary.warnings) ? summary.warnings : [];
        const advisoriesList = Array.isArray(summary.advisories) ? summary.advisories : [];
        const responsiveDetected = summary.responsiveDetected !== false;
        const summaryClass = gatingList.length
          ? 'summary-page--fail'
          : !responsiveDetected || warningsList.length > 0
            ? 'summary-page--warn'
            : advisoriesList.length > 0
              ? 'summary-page--advisory'
              : 'summary-page--ok';
        return {
          ...summary,
          page: payload.page || summary.page,
          viewport: payload.viewport || summary.viewport,
          _summaryClass: summaryClass,
        };
      });

      if (perPageEntries.length === 0) {
        perPageEntries = pagesData.map((summary) => {
          const gatingList = Array.isArray(summary.gating) ? summary.gating : [];
          const warningsList = Array.isArray(summary.warnings) ? summary.warnings : [];
          const advisoriesList = Array.isArray(summary.advisories) ? summary.advisories : [];
          const responsiveDetected = summary.responsiveDetected !== false;
          const summaryClass = gatingList.length
            ? 'summary-page--fail'
            : !responsiveDetected || warningsList.length > 0
              ? 'summary-page--warn'
              : advisoriesList.length > 0
                ? 'summary-page--advisory'
                : 'summary-page--ok';
          return {
            ...summary,
            page: summary.page,
            viewport: summary.viewport,
            _summaryClass: summaryClass,
          };
        });
      }

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues: combinedAdvisories,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking WordPress responsive issues',
          emptyMessage: 'No blocking WordPress responsive issues detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'WordPress responsive advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-viewport WordPress responsive findings',
          summaryClass: 'summary-page--responsive',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderResponsiveWpPageCard(entrySummary, { projectLabel }),
          formatSummaryLabel: (entrySummary) =>
            `${entrySummary?.viewport || 'Viewport'} — ${formatPageLabel(entrySummary?.page || '/')}`,
        },
      };
    });

  const renderResponsiveConsistencyPageCard = (summary) => {
    if (!summary) return '';

    const gating = Array.isArray(summary.gating) ? summary.gating.filter(Boolean) : [];
    const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
    const advisories = Array.isArray(summary.advisories) ? summary.advisories.filter(Boolean) : [];
    const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

    const statusMeta =
      gating.length > 0
        ? { className: 'status-error', label: `${formatCount(gating.length)} blocking issue(s)` }
        : warnings.length > 0
          ? { className: 'status-warning', label: 'Warnings present' }
          : advisories.length > 0
            ? { className: 'status-info', label: 'Advisories present' }
            : { className: 'status-ok', label: 'Pass' };

    const metrics = renderSummaryMetrics([
      { label: 'Page', value: ensureDisplayValue(summary.page) },
      {
        label: 'Comparison',
        value: `${summary.baselineViewport || 'baseline'} vs ${summary.compareViewport || 'comparison'}`,
      },
      { label: 'Heading delta', value: summary.headingDiff ?? 0 },
      {
        label: 'Navigation match',
        value: summary.baseline?.hasNav === summary.compare?.hasNav ? 'Aligned' : 'Mismatch',
      },
      {
        label: 'Main match',
        value: summary.baseline?.hasMain === summary.compare?.hasMain ? 'Aligned' : 'Mismatch',
      },
      {
        label: 'Footer match',
        value: summary.baseline?.hasFooter === summary.compare?.hasFooter ? 'Aligned' : 'Mismatch',
      },
    ]);

    const gatingEntries = aggregateMessages(gating, 'critical');
    const warningEntries = aggregateMessages(warnings, 'moderate');
    const advisoryEntries = aggregateMessages(advisories, 'minor');

    const gatingSection =
      renderEntriesTable(
        gatingEntries,
        formatUniqueRulesHeading('Blocking consistency issues', gatingEntries.length)
      ) || '<p class="details">No blocking consistency issues detected.</p>';

    const warningSection =
      renderEntriesTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`) ||
      (warnings.length > 0 ? '' : '<p class="details">No warnings recorded.</p>');

    const advisorySection =
      renderEntriesTable(
        advisoryEntries,
        formatUniqueRulesHeading('Advisories', advisoryEntries.length),
        {
          headingClass: 'summary-heading-best-practice',
        }
      ) || '';

    const notesHtml = notes.length
      ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
          .map((note) => `<li>${escapeHtml(String(note))}</li>`)
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
        ${gatingSection}
        ${warningSection}
        ${advisorySection}
      </section>
    `;
  };

  const renderResponsiveConsistencyGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload) return null;

      const comparisons = normaliseComparisons(bucket, runPayload);
      if (comparisons.length === 0) return null;

      const issueSource = comparisons.map((comparison) => ({
        ...comparison,
        page: `${comparison.page || '/'} › ${comparison.baselineViewport || 'baseline'} vs ${comparison.compareViewport || 'comparison'}`,
        consistencyGating: []
          .concat(Array.isArray(comparison.gating) ? comparison.gating : [])
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry })),
        consistencyAdvisories: []
          .concat(Array.isArray(comparison.warnings) ? comparison.warnings : [])
          .concat(Array.isArray(comparison.advisories) ? comparison.advisories : [])
          .filter(Boolean)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry })),
      }));

      const gatingIssues = collectIssueMessages(issueSource, 'consistencyGating', 'critical', {
        dedupeIgnoreImpact: true,
      });
      const advisoryIssues = collectIssueMessages(
        issueSource,
        'consistencyAdvisories',
        'moderate',
        {
          dedupeIgnoreImpact: true,
        }
      );

      const perPageEntries = comparisons.map((comparison) => ({
        ...comparison,
        _summaryClass: Array.isArray(comparison.gating) && comparison.gating.length
          ? 'summary-page--fail'
          : Array.isArray(comparison.warnings) && comparison.warnings.length
            ? 'summary-page--warn'
            : Array.isArray(comparison.advisories) && comparison.advisories.length
              ? 'summary-page--advisory'
              : 'summary-page--ok',
      }));

      return {
        projectLabel:
          runPayload.metadata?.projectName || bucket.projectName || 'Responsive consistency',
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking cross-viewport issues',
          emptyMessage: 'No blocking cross-viewport issues detected.',
        },
        advisoryOptions: {
          title: 'Cross-viewport advisories',
          emptyMessage: 'No advisories detected.',
        },
        perPageOptions: {
          heading: 'Per-comparison findings',
          summaryClass: 'summary-page--responsive',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderResponsiveConsistencyPageCard(entrySummary),
          formatSummaryLabel: (entrySummary) =>
            `${formatPageLabel(entrySummary?.page || 'Page')} — ${entrySummary?.baselineViewport || 'baseline'} vs ${entrySummary?.compareViewport || 'comparison'}`,
        },
      };
    });

  const renderResponsiveConsistencyGroupMarkdown = (group) => {
    const buckets = collectSchemaProjects(group);
    if (buckets.length === 0) return '';

    const sections = buckets.map((bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload) return '';

      const projectLabel = runPayload.metadata?.projectName || bucket.projectName || 'default';
      const comparisons = normaliseComparisons(bucket, runPayload);
      const heading = `${group.title || 'Cross-viewport consistency summary'} – ${projectLabel}`;
      const overview = runPayload.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

      const header = '| Page | Comparison | Heading diff | Nav | Main | Footer | Issues |';
      const separator = '| --- | --- | --- | --- | --- | --- | --- |';
      const rows = comparisons.map((entry) => {
        const issues = []
          .concat(Array.isArray(entry.gating) ? entry.gating : [])
          .concat(Array.isArray(entry.warnings) ? entry.warnings : [])
          .concat(Array.isArray(entry.advisories) ? entry.advisories : []);
        const issuesCell = issues.length ? issues.map((issue) => `⚠️ ${issue}`).join('<br />') : 'None';
        const navMatch = entry.baseline?.hasNav === entry.compare?.hasNav ? '✅' : '⚠️';
        const mainMatch = entry.baseline?.hasMain === entry.compare?.hasMain ? '✅' : '⚠️';
        const footerMatch = entry.baseline?.hasFooter === entry.compare?.hasFooter ? '✅' : '⚠️';
        return `| \`${entry.page || '/'}\` | ${entry.baselineViewport || 'baseline'} vs ${entry.compareViewport || 'comparison'} | ${entry.headingDiff ?? '—'} | ${navMatch} | ${mainMatch} | ${footerMatch} | ${issuesCell} |`;
      });

      const parts = [`## ${heading}`];
      if (overview) parts.push(overview);
      if (rows.length > 0) {
        parts.push('', header, separator, ...rows);
      } else {
        parts.push('', '_No responsive consistency data captured._');
      }
      return parts.join('\n');
    });

    return sections.join('\n\n');
  };

  return {
    renderResponsiveStructureGroupHtml,
    renderResponsiveStructureGroupMarkdown,
    renderResponsiveStructurePageCard,
    renderResponsiveWpGroupHtml,
    renderResponsiveWpGroupMarkdown,
    renderResponsiveWpPageCard,
    renderResponsiveConsistencyGroupHtml,
    renderResponsiveConsistencyGroupMarkdown,
    renderResponsiveConsistencyPageCard,
  };
};
