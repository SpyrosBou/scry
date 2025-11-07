const { escapeHtml, formatCount } = require('../../report-template-helpers');

module.exports = function createAccessibilityRenderers({
  deriveWcagPageStatus,
  formatWcagStability,
  renderPerPageIssuesTable,
}) {
  const renderWcagPageCard = (summary, { viewportLabel, failThreshold } = {}) => {
    if (!summary) return '';
    if (summary.cardHtml) return summary.cardHtml;

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

    const gatingSection = violations.length
      ? renderPerPageIssuesTable(
          violations,
          `Gating WCAG violations (${formatCount(violations.length)})`
        )
      : '<p class="details">No gating violations detected.</p>';

    const advisorySection = advisories.length
      ? renderPerPageIssuesTable(
          advisories,
          `WCAG advisory findings (${formatCount(advisories.length)})`
        )
      : '';

    const bestPracticeSection = bestPractices.length
      ? renderPerPageIssuesTable(
          bestPractices,
          `Best-practice advisories (${formatCount(bestPractices.length)})`,
          { headingClass: 'summary-heading-best-practice' }
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

  return {
    renderWcagPageCard,
  };
};
