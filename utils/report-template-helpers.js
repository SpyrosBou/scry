const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
};

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';

const formatPageLabel = (page) => {
  if (!page || page === '/') return 'Homepage';
  return String(page);
};

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const humaniseKey = (key) =>
  String(key || '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());

function schemaValueToHtml(value) {
  if (value == null) return '<span class="schema-value schema-value--empty">—</span>';
  if (typeof value === 'boolean') {
    return `<span class="schema-value">${value ? 'Yes' : 'No'}</span>`;
  }
  if (typeof value === 'number') {
    return `<span class="schema-value">${escapeHtml(value.toLocaleString())}</span>`;
  }
  if (typeof value === 'string') {
    return `<span class="schema-value">${escapeHtml(value)}</span>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="schema-value schema-value--empty">—</span>';
    }
    const simple = value.every(
      (item) => item == null || ['string', 'number', 'boolean'].includes(typeof item)
    );
    if (simple) {
      return `<span class="schema-value">${escapeHtml(
        value.map((item) => (item == null ? '—' : String(item))).join(', ')
      )}</span>`;
    }
    return `<ul class="schema-list">${value
      .map((item) => `<li>${schemaValueToHtml(item)}</li>`)
      .join('')}</ul>`;
  }
  if (isPlainObject(value)) {
    return renderSchemaMetrics(value);
  }
  return `<span class="schema-value">${escapeHtml(String(value))}</span>`;
}

function renderSchemaMetrics(data) {
  if (!isPlainObject(data)) {
    return schemaValueToHtml(data);
  }
  const items = Object.entries(data).map(([key, value]) => {
    return `
      <div class="schema-metrics__item">
        <dt>${escapeHtml(humaniseKey(key))}</dt>
        <dd>${schemaValueToHtml(value)}</dd>
      </div>
    `;
  });
  return `<dl class="schema-metrics">${items.join('')}</dl>`;
}

const formatCount = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed.toLocaleString();
  return value;
};

const describeCount = (value, noun, pluralForm) => {
  const count = Number(value);
  const safeCount = Number.isFinite(count) ? count : 0;
  const label = safeCount === 1 ? noun : pluralForm || `${noun}s`;
  return `${formatCount(safeCount)} ${label}`;
};

const INSIGHT_TONES = new Set(['success', 'danger', 'warning', 'info', 'muted']);

const renderInsightTiles = (tiles = []) => {
  const items = Array.isArray(tiles)
    ? tiles
        .map((tile) => {
          if (!tile || !tile.label) return null;
          const value =
            tile.value == null || tile.value === ''
              ? '—'
              : typeof tile.value === 'number' && Number.isFinite(tile.value)
                ? tile.value.toLocaleString()
                : String(tile.value);
          const tone =
            tile.tone && INSIGHT_TONES.has(tile.tone) ? ` insight-tiles__item--${tile.tone}` : '';
          const hint =
            tile.description != null && tile.description !== ''
              ? `<small class="insight-tiles__hint">${escapeHtml(String(tile.description))}</small>`
              : '';
          return `<div class="insight-tiles__item${tone}"><dt>${escapeHtml(
            tile.label
          )}</dt><dd>${escapeHtml(value)}</dd>${hint}</div>`;
        })
        .filter(Boolean)
    : [];

  if (items.length === 0) return '';
  return `<dl class="insight-tiles">${items.join('')}</dl>`;
};

const renderIssueGroup = ({ title, items, tone = 'muted', emptyMessage } = {}) => {
  const listItems = Array.isArray(items)
    ? items
        .map((item) => {
          if (item == null) return null;
          const text = String(item).trim();
          return text ? `<li>${escapeHtml(text)}</li>` : null;
        })
        .filter(Boolean)
    : [];
  const toneClass = tone && INSIGHT_TONES.has(tone) ? ` issue-group--${tone}` : '';
  const heading = escapeHtml(title || 'Details');
  if (listItems.length === 0) {
    if (!emptyMessage) return '';
    return `<section class="issue-group${toneClass}"><h4>${heading}</h4><p class="issue-group__empty">${escapeHtml(
      emptyMessage
    )}</p></section>`;
  }
  return `<section class="issue-group${toneClass}"><h4>${heading}</h4><ul class="issue-list">${listItems.join(
    ''
  )}</ul></section>`;
};

const summariseIssueEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries
    .map((entry) => {
      if (!entry) return null;
      const message = entry.message || entry.rule || entry.id || entry.summary;
      const text = String(message || '').trim();
      if (!text) return null;
      if (entry.count && entry.count > 1) {
        return `${text} (${formatCount(entry.count)})`;
      }
      return text;
    })
    .filter(Boolean);
};

const formatMillisecondsDisplay = (value) => {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString()} ms`;
};

const formatPercentage = (value) => {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(2)}%`;
};

const renderStatusSummaryList = (items, { className = 'status-summary' } = {}) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  const entries = items
    .filter((item) => item && Number(item.count) > 0)
    .map(
      (item) => `
        <li>
          <span class="status-pill ${escapeHtml(item.tone || 'status-info')}">${escapeHtml(item.label)}</span>
          <span>${escapeHtml(formatCount(item.count))}${item.suffix ? ` ${escapeHtml(item.suffix)}` : ''}</span>
        </li>
      `
    )
    .join('');
  if (!entries) return '';
  return `<ul class="${escapeHtml(className)}">${entries}</ul>`;
};

const formatIssueImpactLabel = (impact) => {
  if (!impact) return 'Info';
  const label = String(impact);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};

module.exports = {
  describeCount,
  escapeHtml,
  formatBytes,
  formatCount,
  formatIssueImpactLabel,
  formatMillisecondsDisplay,
  formatPageLabel,
  formatPercentage,
  humaniseKey,
  isPlainObject,
  renderInsightTiles,
  renderIssueGroup,
  renderSchemaMetrics,
  renderStatusSummaryList,
  schemaValueToHtml,
  slugify,
  summariseIssueEntries,
};
