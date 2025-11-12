const { test } = require('@playwright/test');
const { assertReportSummaryPayload } = require('./report-schema-validator');

const SUMMARY_STYLES = '';

const PER_PAGE_TOGGLE_SCRIPT = `
(function () {
  const scriptEl = document.currentScript;
  if (!scriptEl) return;
  const listSection = scriptEl.previousElementSibling;
  if (!listSection) return;
  const accordions = Array.from(listSection.querySelectorAll('details.summary-page'));
  if (accordions.length === 0) return;

  const setOpenState = (open) => {
    accordions.forEach((accordion) => {
      accordion.open = open;
    });
  };

  listSection.querySelectorAll('[data-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      setOpenState(button.dataset.toggle === 'expand');
    });
  });
})();
`;

const DESCRIPTION_BYTE_LIMIT = 18_000_000;

const wrapHtml = (content) => `${SUMMARY_STYLES}${content}`;

const renderPerPageAccordion = (items, options = {}) => {
  const entries = Array.isArray(items) ? items.filter(Boolean) : [];
  if (entries.length === 0) return '';

  const {
    heading = 'Per-page breakdown',
    showLabel = 'Show all',
    hideLabel = 'Hide all',
    summaryClass = '',
    containerClass = 'summary-report summary-a11y',
    renderCard,
    formatSummaryLabel,
  } = options;

  if (typeof renderCard !== 'function') return '';

  const summaryClassName = ['summary-page', summaryClass].filter(Boolean).join(' ');
  const labelFormatter =
    typeof formatSummaryLabel === 'function'
      ? formatSummaryLabel
      : (entry) => entry?.page || 'Page';

  const detailsHtml = entries
    .map((entry) => {
      const cardHtml = renderCard(entry);
      if (!cardHtml) return '';
      const summaryLabel = escapeHtml(labelFormatter(entry));
      const extraSummaryClass =
        entry && entry._summaryClass ? ` ${escapeHtml(entry._summaryClass)}` : '';
      return `
        <details class="${summaryClassName}${extraSummaryClass}">
          <summary>${summaryLabel}</summary>
          <div class="summary-page__body">
            ${cardHtml}
          </div>
        </details>
      `;
    })
    .filter(Boolean)
    .join('\n');

  if (!detailsHtml.trim()) return '';

  const escapedContainerClass = escapeHtml(containerClass);

  return `
    <section class="${escapedContainerClass}" data-per-page="list">
      <div class="summary-per-page-header">
        <h3>${escapeHtml(heading)}</h3>
        <div class="summary-toggle-controls">
          <button type="button" class="summary-toggle-button" data-toggle="expand">${escapeHtml(showLabel)}</button>
          <button type="button" class="summary-toggle-button" data-toggle="collapse">${escapeHtml(hideLabel)}</button>
        </div>
      </div>
      ${detailsHtml}
    </section>
    <script>${PER_PAGE_TOGGLE_SCRIPT}</script>
  `;
};

const renderSummaryMetrics = (entries) => {
  const MISSING_DATA_LABEL = 'DATA MISSING';
  const items = Array.isArray(entries)
    ? entries
        .map((entry) => {
          if (!entry || typeof entry.label !== 'string') return '';
          const label = entry.label.trim();
          if (!label) return '';
          const rawValue = entry.value;
          let displayValue;
          if (rawValue === null || rawValue === undefined || rawValue === '') {
            displayValue = MISSING_DATA_LABEL;
          } else if (typeof rawValue === 'number') {
            displayValue = rawValue.toLocaleString();
          } else {
            displayValue = String(rawValue);
          }
          return `
      <div class="schema-metrics__item">
        <dt>${escapeHtml(label)}</dt>
        <dd><span class="schema-value">${escapeHtml(displayValue)}</span></dd>
      </div>
    `;
        })
        .filter(Boolean)
        .join('\n')
    : '';

  if (!items) return '';

  return `<dl class="schema-metrics">${items}</dl>`;
};

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveTestInfo = (maybeTestInfo) => {
  if (maybeTestInfo) return maybeTestInfo;
  try {
    return test.info();
  } catch (_error) {
    throw new Error(
      'attachSummary must be called within a Playwright test or provided an explicit testInfo instance.'
    );
  }
};

async function attachSummary(testInfoOrOptions, maybeOptions) {
  const hasExplicitTestInfo = Boolean(maybeOptions);
  const testInfo = resolveTestInfo(hasExplicitTestInfo ? testInfoOrOptions : undefined);
  const options = hasExplicitTestInfo ? maybeOptions : testInfoOrOptions;

  if (!options || typeof options !== 'object') {
    throw new Error('attachSummary requires an options object.');
  }

  const { baseName, htmlBody, markdown, setDescription = false, title = null } = options;
  if (!baseName) {
    throw new Error('attachSummary requires a baseName value.');
  }

  const payload = {
    type: 'custom-report-summary',
    baseName,
    title: title ? String(title) : null,
    setDescription: Boolean(setDescription),
    htmlBody: htmlBody ? wrapHtml(htmlBody) : null,
    markdown: markdown || null,
    createdAt: new Date().toISOString(),
  };

  await testInfo.attach(`${baseName}.summary.json`, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
  });

  if (payload.htmlBody) {
    const byteLength = Buffer.byteLength(payload.htmlBody, 'utf8');
    if (byteLength <= DESCRIPTION_BYTE_LIMIT) {
      await testInfo.attach(`${baseName}.summary.html`, {
        contentType: 'text/html',
        body: Buffer.from(payload.htmlBody, 'utf8'),
      });
    } else {
      await testInfo.attach(`${baseName}.summary-truncated.txt`, {
        contentType: 'text/plain',
        body: Buffer.from(
          `Summary HTML (${byteLength.toLocaleString()} bytes) exceeds inline byte limit (${DESCRIPTION_BYTE_LIMIT.toLocaleString()} bytes).`,
          'utf8'
        ),
      });
    }
  }

  if (payload.markdown) {
    await testInfo.attach(`${baseName}.summary.md`, {
      contentType: 'text/markdown',
      body: Buffer.from(payload.markdown, 'utf8'),
    });
  }
}

async function attachSchemaSummary(testInfoOrPayload, maybePayload) {
  const hasExplicitTestInfo = Boolean(maybePayload);
  const testInfo = resolveTestInfo(hasExplicitTestInfo ? testInfoOrPayload : undefined);
  const payload = hasExplicitTestInfo ? maybePayload : testInfoOrPayload;

  if (!payload || typeof payload !== 'object') {
    throw new Error('attachSchemaSummary requires a payload object.');
  }

  assertReportSummaryPayload(payload);

  const baseName = payload.baseName || payload.kind || 'summary';
  await testInfo.attach(`${baseName}.summary.schema.json`, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
  });
}

module.exports = {
  attachSummary,
  attachSchemaSummary,
  escapeHtml,
  SUMMARY_STYLES,
  PER_PAGE_TOGGLE_SCRIPT,
  renderPerPageAccordion,
  renderSummaryMetrics,
  wrapHtml,
};
