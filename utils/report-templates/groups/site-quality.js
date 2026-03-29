const {
  describeCount,
  escapeHtml,
  formatCount,
  formatMillisecondsDisplay,
  formatPercentage,
  humaniseKey,
  isPlainObject,
  renderInsightTiles,
  renderIssueGroup,
  summariseIssueEntries,
} = require('../../report-template-helpers');
const { renderSummaryMetrics } = require('../../reporting-utils');
const { KIND_PAGE_SUMMARY } = require('../../report-schema');
const createBucketedSuiteRenderer = require('./helpers/bucketed-suite');

module.exports = function createSiteQualityRenderers({
  collectSchemaProjects,
  firstRunPayload,
  collectIssueMessages,
  renderSuiteFindingsBlock,
  renderProjectBlockSection,
  renderSchemaGroupContainer,
  formatPageLabel,
  renderPerPageIssuesTable,
  formatUniqueRulesHeading,
  stripAnsiSequences,
  simplifyUrlForDisplay,
  normalizeInteractiveMessage,
  normalizeAvailabilityMessage,
  normalizeHttpMessage,
  normalizePerformanceMessage,
  normalizeVisualMessage,
  renderInternalLinksPageCard,
  renderInteractivePageCard,
  renderAvailabilityPageCard,
  renderHttpPageCard,
  renderPerformancePageCard,
  renderVisualPageCard,
}) {
  const renderBucketedSuite = createBucketedSuiteRenderer({
    collectSchemaProjects,
    renderSuiteFindingsBlock,
    renderProjectBlockSection,
    renderSchemaGroupContainer,
  });

  const renderInternalLinksGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload || !Array.isArray(runPayload.details?.pages)) return null;

      const pagesData = runPayload.details.pages;
      const metadata = runPayload.metadata || {};
      const projectLabel = metadata.projectName || bucket.projectName || 'Chrome';
      const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

      const gatingIssues = collectIssueMessages(
        pagesData,
        ['gating', 'gatingIssues'],
        'critical'
      ).filter((issue) => issue.pageCount > 0);
      const warningIssues = collectIssueMessages(pagesData, 'warnings', 'moderate').filter(
        (issue) => issue.pageCount > 0
      );
      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'minor').filter(
        (issue) => issue.pageCount > 0
      );

      const perPageEntries = pagesData.map((summary) => {
        const brokenCount = summary.brokenCount ?? 0;
        const hasGating =
          brokenCount > 0 ||
          (Array.isArray(summary.gating) && summary.gating.length > 0) ||
          (Array.isArray(summary.brokenSample) && summary.brokenSample.length > 0);
        const hasWarnings = Array.isArray(summary.warnings) && summary.warnings.length > 0;
        const hasAdvisories = Array.isArray(summary.advisories) && summary.advisories.length > 0;
        const summaryClass = hasGating
          ? 'summary-page--fail'
          : hasWarnings
            ? 'summary-page--warn'
            : hasAdvisories
              ? 'summary-page--advisory'
              : 'summary-page--ok';
        return {
          ...summary,
          page: summary.page,
          _summaryClass: summaryClass,
        };
      });

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues: [...warningIssues, ...advisoryIssues],
        perPageEntries,
        gatingOptions: {
          title: 'Blocking link issues',
          emptyMessage: 'No blocking link issues detected.',
          viewportLabel,
          includeWcagColumn: false,
        },
        advisoryOptions: {
          title: 'Link advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
          includeWcagColumn: false,
        },
        perPageOptions: {
          heading: 'Per-page findings',
          summaryClass: 'summary-page--internal-links',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderInternalLinksPageCard(entrySummary, { projectLabel }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });

  const renderInteractiveGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload || !Array.isArray(runPayload.details?.pages)) return null;

      const pagesData = runPayload.details.pages;
      const metadata = runPayload.metadata || {};
      const projectLabel = metadata.projectName || bucket.projectName || 'Chrome';
      const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

      const gatingIssues = collectIssueMessages(pagesData, 'gating', 'critical', {
        normalize: normalizeInteractiveMessage,
      }).filter((issue) => issue.pageCount > 0);

      const warningIssues = collectIssueMessages(pagesData, 'warnings', 'moderate', {
        normalize: normalizeInteractiveMessage,
      }).filter((issue) => issue.pageCount > 0);

      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'minor', {
        normalize: normalizeInteractiveMessage,
      }).filter((issue) => issue.pageCount > 0);

      const perPageEntries = pagesData.map((summary) => {
        const consoleErrors = summary.consoleErrors ?? 0;
        const resourceErrors = summary.resourceErrors ?? 0;
        const hasGating =
          consoleErrors > 0 ||
          resourceErrors > 0 ||
          (Array.isArray(summary.gating) && summary.gating.length > 0);
        const hasWarnings = Array.isArray(summary.warnings) && summary.warnings.length > 0;
        const hasAdvisories = Array.isArray(summary.advisories) && summary.advisories.length > 0;
        const summaryClass = hasGating
          ? 'summary-page--fail'
          : hasWarnings
            ? 'summary-page--warn'
            : hasAdvisories
              ? 'summary-page--advisory'
              : 'summary-page--ok';
        return {
          ...summary,
          page: summary.page,
          _summaryClass: summaryClass,
        };
      });

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues: [...warningIssues, ...advisoryIssues],
        perPageEntries,
        gatingOptions: {
          title: 'Blocking console issues',
          emptyMessage: 'No console or resource errors detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'Console advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-page findings',
          summaryClass: 'summary-page--interactive',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderInteractivePageCard(entrySummary, { projectLabel }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });

  const renderAvailabilityGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const projectLabel = metadata.projectName || bucket.projectName || 'default';
      const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);

      const pagesData = (detailPages.length ? detailPages : pageEntryPayloads).map((payload) =>
        payload.summary ? payload.summary : payload
      );
      if (pagesData.length === 0) return null;

      const gatingIssues = collectIssueMessages(pagesData, 'gating', 'critical', {
        normalize: normalizeAvailabilityMessage,
        dedupeIgnoreImpact: true,
      }).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(pagesData, ['warnings', 'advisories'], 'moderate', {
        normalize: normalizeAvailabilityMessage,
        dedupeIgnoreImpact: true,
      });

      const perPageEntries =
        pageEntryPayloads.length > 0
          ? pageEntryPayloads.map((payload) => {
              const summary = payload.summary || {};
              const gating = Array.isArray(summary.gating) ? summary.gating : [];
              const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
              const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
              const summaryClass =
                gating.length > 0
                  ? 'summary-page--fail'
                  : warnings.length
                    ? 'summary-page--warn'
                    : advisories.length
                      ? 'summary-page--advisory'
                      : 'summary-page--ok';
              return {
                ...summary,
                page: payload.page || summary.page,
                _summaryClass: summaryClass,
              };
            })
          : pagesData.map((summary) => {
              const gating = Array.isArray(summary.gating) ? summary.gating : [];
              const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
              const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
              const summaryClass =
                gating.length > 0
                  ? 'summary-page--fail'
                  : warnings.length
                    ? 'summary-page--warn'
                    : advisories.length
                      ? 'summary-page--advisory'
                      : 'summary-page--ok';
              return {
                ...summary,
                page: summary.page,
                _summaryClass: summaryClass,
              };
            });

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking availability issues',
          emptyMessage: 'No blocking availability issues detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'Availability advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-page availability findings',
          summaryClass: 'summary-page--availability',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderAvailabilityPageCard(entrySummary, { projectLabel }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });

  const renderHttpGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const projectLabel = metadata.projectName || bucket.projectName || 'default';
      const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);

      const pagesData = (detailPages.length ? detailPages : pageEntryPayloads).map((payload) =>
        payload.summary ? payload.summary : payload
      );
      if (pagesData.length === 0) return null;

      const normalizeFailedCheck = ({ label, details, status, statusText }) => {
        const message = label ? String(label).trim() : null;
        if (!message) return null;
        return {
          type: 'failed-check',
          label: message,
          message,
          detail: details ? stripAnsiSequences(details).trim() : null,
          status,
          statusText,
        };
      };

      const pagesWithHttpMetadata = pagesData.map((page) => {
        const failedChecks = Array.isArray(page.failedChecks) ? page.failedChecks : [];
        const normalizedChecks = failedChecks
          .map((check) => normalizeFailedCheck(check))
          .filter(Boolean)
          .map((entry) => ({
            ...entry,
            status: entry.status ?? page.status,
            statusText: entry.statusText ?? page.statusText,
          }));

        const mapMessages = (items) =>
          (Array.isArray(items) ? items : [])
            .filter((item) => item != null)
            .map((item) =>
              typeof item === 'object'
                ? {
                    ...item,
                    status: item.status ?? page.status,
                    statusText: item.statusText ?? page.statusText,
                  }
                : {
                    message: item,
                    status: page.status,
                    statusText: page.statusText,
                  }
            );

        return {
          ...page,
          httpGating: mapMessages(page.gating),
          httpFailedChecks: normalizedChecks,
          httpWarnings: mapMessages(page.warnings),
          httpAdvisories: mapMessages(page.advisories),
        };
      });

      const gatingIssues = collectIssueMessages(
        pagesWithHttpMetadata.map((page) => ({
          ...page,
          gatingCombined: [...page.httpGating, ...page.httpFailedChecks],
        })),
        'gatingCombined',
        'critical',
        {
          normalize: normalizeHttpMessage,
          dedupeIgnoreImpact: true,
        }
      ).filter((issue) => issue.pageCount > 0);

      const advisoryIssues = collectIssueMessages(
        pagesWithHttpMetadata.map((page) => ({
          ...page,
          advisoryCombined: [...page.httpWarnings, ...page.httpAdvisories],
        })),
        'advisoryCombined',
        'moderate',
        {
          normalize: normalizeHttpMessage,
          dedupeIgnoreImpact: true,
        }
      );

      const perPageEntries =
        pageEntryPayloads.length > 0
          ? pageEntryPayloads.map((payload) => {
              const summary = payload.summary || {};
              const gating = Array.isArray(summary.gating) ? summary.gating : [];
              const failedChecks = Array.isArray(summary.failedChecks) ? summary.failedChecks : [];
              const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
              const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
              const summaryClass =
                gating.length > 0 || failedChecks.length > 0
                  ? 'summary-page--fail'
                  : warnings.length
                    ? 'summary-page--warn'
                    : advisories.length
                      ? 'summary-page--advisory'
                      : 'summary-page--ok';
              return {
                ...summary,
                page: payload.page || summary.page,
                _summaryClass: summaryClass,
              };
            })
          : pagesData.map((summary) => {
              const gating = Array.isArray(summary.gating) ? summary.gating : [];
              const failedChecks = Array.isArray(summary.failedChecks) ? summary.failedChecks : [];
              const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
              const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
              const summaryClass =
                gating.length > 0 || failedChecks.length > 0
                  ? 'summary-page--fail'
                  : warnings.length
                    ? 'summary-page--warn'
                    : advisories.length
                      ? 'summary-page--advisory'
                      : 'summary-page--ok';
              return {
                ...summary,
                page: summary.page,
                _summaryClass: summaryClass,
              };
            });

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking HTTP issues',
          emptyMessage: 'No blocking HTTP issues detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'HTTP response advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-page HTTP findings',
          summaryClass: 'summary-page--http',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) =>
            renderHttpPageCard(entrySummary, { projectLabel, viewportLabel }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });

  const renderPerformanceGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const projectLabel = metadata.projectName || bucket.projectName || 'default';
      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);

      const pagesData = (pageEntryPayloads.length ? pageEntryPayloads : detailPages).map(
        (payload) => (payload.summary ? payload.summary : payload)
      );
      if (pagesData.length === 0) return null;

      const normalizeBreaches = (page) => {
        const list = Array.isArray(page.budgetBreaches) ? page.budgetBreaches : [];
        return list.map((breach) => {
          const metricKey = breach?.metric || 'metric';
          const metricLabel = humaniseKey(metricKey);
          const value = Number.isFinite(breach?.value) ? Math.round(breach.value) : null;
          const budget = Number.isFinite(breach?.budget) ? Math.round(breach.budget) : null;
          const detail = value != null && budget != null ? `${value}ms > ${budget}ms` : null;
          return {
            metric: metricKey,
            message: `${metricLabel} budget exceeded`,
            detail,
          };
        });
      };

      const pagesForIssues = pagesData.map((page) => {
        const gatingList = Array.isArray(page.gating) ? page.gating : [];
        const normalizedGating = gatingList.map((entry) =>
          typeof entry === 'object' ? entry : { message: entry }
        );
        return {
          ...page,
          performanceGating: [...normalizedGating, ...normalizeBreaches(page)],
        };
      });

      const pagesForAdvisories = pagesData.map((page) => {
        const combined = []
          .concat(Array.isArray(page.warnings) ? page.warnings : [])
          .concat(Array.isArray(page.advisories) ? page.advisories : []);
        const normalisedCombined = combined
          .filter((entry) => entry != null)
          .map((entry) => (typeof entry === 'object' ? entry : { message: entry }));
        return {
          ...page,
          performanceAdvisories: normalisedCombined,
        };
      });

      const gatingIssues = collectIssueMessages(
        pagesForIssues,
        'performanceGating',
        'critical',
        {
          normalize: normalizePerformanceMessage,
          dedupeIgnoreImpact: true,
        }
      ).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(
        pagesForAdvisories,
        'performanceAdvisories',
        'moderate',
        {
          normalize: normalizePerformanceMessage,
          dedupeIgnoreImpact: true,
        }
      );

      const perPageEntries =
        pageEntryPayloads.length > 0
          ? pageEntryPayloads.map((payload) => {
              const summary = payload.summary || {};
              const gating = Array.isArray(summary.gating) ? summary.gating : [];
              const breachesForPage = normalizeBreaches(summary);
              const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
              const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
              const summaryClass =
                gating.length > 0 || breachesForPage.length > 0
                  ? 'summary-page--fail'
                  : warnings.length
                    ? 'summary-page--warn'
                    : advisories.length
                      ? 'summary-page--advisory'
                      : 'summary-page--ok';
              return {
                ...summary,
                page: payload.page || summary.page,
                budgetBreaches: summary.budgetBreaches || [],
                _summaryClass: summaryClass,
              };
            })
          : pagesData.map((summary) => {
              const breachesForPage = normalizeBreaches(summary);
              const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
              const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
              const summaryClass =
                breachesForPage.length > 0
                  ? 'summary-page--fail'
                  : warnings.length
                    ? 'summary-page--warn'
                    : advisories.length
                      ? 'summary-page--advisory'
                      : 'summary-page--ok';
              return {
                ...summary,
                page: summary.page,
                budgetBreaches: summary.budgetBreaches || [],
                _summaryClass: summaryClass,
              };
            });

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking performance issues',
          emptyMessage: 'No performance budget breaches detected.',
        },
        advisoryOptions: {
          title: 'Performance advisories',
          emptyMessage: 'No advisories detected.',
        },
        perPageOptions: {
          heading: 'Per-page performance findings',
          summaryClass: 'summary-page--performance',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) => renderPerformancePageCard(entrySummary, { projectLabel }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });


  const renderVisualGroupHtml = (group) =>
    renderBucketedSuite(group, (bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const viewportLabel =
        metadata.viewport ||
        (Array.isArray(metadata.viewports) ? metadata.viewports.join(', ') : null) ||
        metadata.projectName ||
        bucket.projectName ||
        'Visual regression';
      const projectLabel = metadata.projectName || bucket.projectName || viewportLabel;

      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);

      const pagesData =
        detailPages.length > 0
          ? detailPages
          : pageEntryPayloads.map((payload) => payload.summary || payload);

      if (pagesData.length === 0 && pageEntryPayloads.length === 0) return null;

      let perPageEntries = (bucket.pageEntries || []).map((entry) => {
        const payload = entry.payload || {};
        const summary = payload.summary || {};
        const result = (summary.result || '').toLowerCase();
        const gatingList = []
          .concat(Array.isArray(summary.gating) ? summary.gating : [])
          .filter(Boolean);
        if (summary.error) gatingList.push(summary.error);
        if (result === 'diff') gatingList.push('Visual diff detected');
        const warningsList = Array.isArray(summary.warnings) ? summary.warnings : [];
        const advisoriesList = Array.isArray(summary.advisories) ? summary.advisories : [];
        const summaryClass =
          gatingList.length > 0 || result === 'diff' || result === 'error'
            ? 'summary-page--fail'
            : warningsList.length > 0
              ? 'summary-page--warn'
              : advisoriesList.length > 0
                ? 'summary-page--advisory'
                : 'summary-page--ok';

        return {
          ...summary,
          page: payload.page || summary.page,
          viewport: summary.viewport || viewportLabel,
          _result: result,
          _summaryClass: summaryClass,
        };
      });

      if (perPageEntries.length === 0) {
        perPageEntries = pagesData.map((summary) => {
          const result = (summary.result || '').toLowerCase();
          const gatingList = []
            .concat(Array.isArray(summary.gating) ? summary.gating : [])
            .filter(Boolean);
          if (summary.error) gatingList.push(summary.error);
          if (result === 'diff') gatingList.push('Visual diff detected');
          const warningsList = Array.isArray(summary.warnings) ? summary.warnings : [];
          const advisoriesList = Array.isArray(summary.advisories) ? summary.advisories : [];
          const summaryClass =
            gatingList.length > 0 || result === 'diff' || result === 'error'
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
            _result: result,
            _summaryClass: summaryClass,
          };
        });
      }

      const overview = runPayload.overview || {};
      const thresholdsUsed = Array.isArray(overview.thresholdsUsed) ? overview.thresholdsUsed : [];

      const pagesForIssues = perPageEntries.map((entry) => {
        const artifacts = entry.artifacts || {};
        const diffSample = entry._result === 'diff' && artifacts.diff ? `attachment://${artifacts.diff}` : null;
        const gatingList = []
          .concat(
            (Array.isArray(entry.gating) ? entry.gating : []).map((item) =>
              typeof item === 'object' ? item : { message: item }
            )
          )
          .filter(Boolean);
        if (entry.error) gatingList.push({ message: entry.error });
        if (entry._result === 'diff') {
          gatingList.push({
            message: 'Visual diff detected',
            sample: diffSample || artifacts.actual || artifacts.baseline || null,
          });
        }
        const advisoryList = []
          .concat(Array.isArray(entry.warnings) ? entry.warnings : [])
          .concat(Array.isArray(entry.advisories) ? entry.advisories : [])
          .filter(Boolean)
          .map((item) => (typeof item === 'object' ? item : { message: item }));
        return {
          ...entry,
          visualGating: gatingList,
          visualAdvisories: advisoryList,
        };
      });

      const gatingIssues = collectIssueMessages(
        pagesForIssues,
        'visualGating',
        'critical',
        {
          normalize: normalizeVisualMessage,
          dedupeIgnoreImpact: true,
        }
      ).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(
        pagesForIssues,
        'visualAdvisories',
        'moderate',
        {
          normalize: normalizeVisualMessage,
          dedupeIgnoreImpact: true,
        }
      );

      return {
        projectLabel,
        gatingIssues,
        advisoryIssues,
        perPageEntries,
        gatingOptions: {
          title: 'Blocking visual issues',
          emptyMessage: 'No blocking visual issues detected.',
          viewportLabel,
        },
        advisoryOptions: {
          title: 'Visual advisories',
          emptyMessage: 'No advisories detected.',
          viewportLabel,
        },
        perPageOptions: {
          heading: 'Per-page visual findings',
          summaryClass: 'summary-page--visual',
          containerClass: 'summary-report summary-a11y summary-a11y--per-page',
          renderCard: (entrySummary) =>
            renderVisualPageCard(entrySummary, {
              viewportLabel,
              thresholdsUsed,
            }),
          formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
        },
      };
    });


  return {
    renderInternalLinksGroupHtml,
    renderInteractiveGroupHtml,
    renderAvailabilityGroupHtml,
    renderHttpGroupHtml,
    renderPerformanceGroupHtml,
    renderVisualGroupHtml,
  };
};
