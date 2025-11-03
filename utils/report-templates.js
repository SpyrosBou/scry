const {
  SUMMARY_STYLES,
  renderPerPageAccordion,
  renderSummaryMetrics,
} = require('./reporting-utils');
const { KIND_RUN_SUMMARY, KIND_PAGE_SUMMARY } = require('./report-schema');

const fs = require('fs');
const path = require('path');

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

const renderRuleSnapshotsTable = (snapshots) => {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return '';
  const rows = snapshots
    .map((snapshot) => {
      const impact = snapshot.impact || snapshot.category || 'info';
      const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
      const viewports = Array.isArray(snapshot.viewports) ? snapshot.viewports : [];
      const wcagTags = Array.isArray(snapshot.wcagTags) ? snapshot.wcagTags : [];
      return `
        <tr class="impact-${impact.toLowerCase?.() || 'info'}">
          <td>${escapeHtml(impact)}</td>
          <td>${escapeHtml(snapshot.rule || 'rule')}</td>
          <td>${pages.length ? escapeHtml(pages.join(', ')) : '—'}</td>
          <td>${snapshot.nodes != null ? escapeHtml(String(snapshot.nodes)) : '—'}</td>
          <td>${viewports.length ? escapeHtml(viewports.join(', ')) : '—'}</td>
          <td>${wcagTags.length ? escapeHtml(wcagTags.join(', ')) : '—'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="schema-table">
      <thead>
        <tr><th>Impact</th><th>Rule</th><th>Pages</th><th>Nodes</th><th>Viewports</th><th>WCAG</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};

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

const renderUnifiedIssuesTable = (issues, { title, emptyMessage, variant, viewportLabel } = {}) => {
  if (!title) return '';

  const baseClass = [
    'summary-report summary-a11y summary-a11y--rule-table',
    variant === 'gating' ? 'summary-a11y--rule-table-gating' : 'summary-a11y--rule-table-advisory',
  ].join(' ');

  if (!Array.isArray(issues) || issues.length === 0) {
    return `
      <section class="${baseClass}">
        <h3>${escapeHtml(title)}</h3>
        <p class="details">${escapeHtml(emptyMessage || 'No issues detected.')}</p>
      </section>
    `;
  }

  const hasWcagData = issues.some((issue) => {
    if (typeof issue?.wcagHtml === 'string' && issue.wcagHtml.trim()) return true;
    if (issue?.wcagBadge != null && String(issue.wcagBadge).trim()) return true;
    if (Array.isArray(issue?.wcagTags) && issue.wcagTags.length > 0) return true;
    return false;
  });
  const hasHelpData = issues.some((issue) => {
    if (typeof issue?.helpHtml === 'string' && issue.helpHtml.trim()) return true;
    if (issue?.helpUrl != null && String(issue.helpUrl).trim()) return true;
    if (issue?.help != null && String(issue.help).trim()) return true;
    return false;
  });

  const rows = issues
    .slice()
    .sort((a, b) => {
      const aCount = Number.isFinite(a.pageCount) ? a.pageCount : 0;
      const bCount = Number.isFinite(b.pageCount) ? b.pageCount : 0;
      if (bCount !== aCount) return bCount - aCount;
      return (a.message || '').localeCompare(b.message || '');
    })
    .map((issue) => {
      const impact = String(issue.impact || 'info').toLowerCase();
      const pagesList =
        Array.isArray(issue.pages) && issue.pages.length > 0
          ? issue.pages.map((page) => `<code>${escapeHtml(page)}</code>`).join('<br />')
          : '—';
      const nodeCount =
        issue.instanceCount != null
          ? issue.instanceCount
          : issue.pageCount != null
            ? issue.pageCount
            : 0;
      const wcagHtml = (() => {
        if (!hasWcagData) return '';
        if (typeof issue.wcagHtml === 'string' && issue.wcagHtml.trim()) return issue.wcagHtml;
        if (issue.wcagBadge) {
          return `<span class="badge badge-wcag">${escapeHtml(issue.wcagBadge)}</span>`;
        }
        if (Array.isArray(issue.wcagTags) && issue.wcagTags.length > 0) {
          return renderWcagTagBadges(issue.wcagTags);
        }
        return '<span class="details">—</span>';
      })();
      const helpHtml = (() => {
        if (!hasHelpData) return '';
        if (typeof issue.helpHtml === 'string' && issue.helpHtml.trim()) return issue.helpHtml;
        const rawUrl =
          issue.helpUrl != null ? String(issue.helpUrl).trim() : String(issue.help || '').trim();
        if (rawUrl) {
          const label = issue.helpLabel ? String(issue.helpLabel).trim() : 'rule docs';
          return `<a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            label || 'rule docs'
          )}</a>`;
        }
        return '<span class="details">—</span>';
      })();

      const cells = [
        `<td>${escapeHtml(formatIssueImpactLabel(impact))}</td>`,
        `<td>${escapeHtml(issue.message || 'Issue')}</td>`,
        `<td>${viewportLabel ? escapeHtml(viewportLabel) : '—'}</td>`,
        `<td>${pagesList}</td>`,
        `<td>${escapeHtml(formatCount(nodeCount))}</td>`,
      ];

      if (hasWcagData) {
        cells.push(`<td>${wcagHtml}</td>`);
      }
      if (hasHelpData) {
        cells.push(`<td>${helpHtml}</td>`);
      }

      return `<tr class="impact-${escapeHtml(impact)}">${cells.join('')}</tr>`;
    })
    .join('');

  const headers = ['Impact', 'Issue', 'Viewport(s)', 'Pages', 'Nodes'];
  if (hasWcagData) {
    headers.push('WCAG level');
  }
  if (hasHelpData) {
    headers.push('Help');
  }

  return `
    <section class="${baseClass}">
      <h3>${escapeHtml(title)}</h3>
      <table class="schema-table">
        <thead><tr>${headers.map((heading) => `<th>${escapeHtml(heading)}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
};

const renderIssueSectionPair = ({
  gatingIssues = [],
  advisoryIssues = [],
  gatingTitle = 'Gating issues',
  advisoryTitle = 'Advisories',
  gatingEmptyMessage = 'No gating issues detected.',
  advisoryEmptyMessage = 'No advisories detected.',
  viewportLabel = null,
} = {}) => {
  const gatingCount = Array.isArray(gatingIssues) ? gatingIssues.length : 0;
  const advisoryCount = Array.isArray(advisoryIssues) ? advisoryIssues.length : 0;
  const sections = [
    renderUnifiedIssuesTable(gatingIssues, {
      title: formatUniqueRulesHeading(gatingTitle, gatingCount),
      emptyMessage: gatingEmptyMessage,
      variant: 'gating',
      viewportLabel,
    }),
    renderUnifiedIssuesTable(advisoryIssues, {
      title: formatUniqueRulesHeading(advisoryTitle, advisoryCount),
      emptyMessage: advisoryEmptyMessage,
      variant: 'advisory',
      viewportLabel,
    }),
  ].filter(Boolean);

  return sections.join('\n');
};

const collectIssueMessages = (pages, fields, defaultImpact, options = {}) => {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const fieldList = Array.isArray(fields) ? fields : [fields];
  const normalizeFn = typeof options.normalize === 'function' ? options.normalize : null;
  const dedupeIgnoreImpact = Boolean(options.dedupeIgnoreImpact);

  const map = new Map();

  for (const page of pages) {
    const pageId = page?.page || 'Unknown page';
    for (const field of fieldList) {
      const rawItems = Array.isArray(page?.[field]) ? page[field] : [];
      for (const rawItem of rawItems) {
        let message = '';
        let impact = defaultImpact;
        let help = null;
        let helpHtml = null;
        let helpLabel = null;
        let wcagBadge = null;
        let wcagTags = null;

        if (rawItem && typeof rawItem === 'object') {
          const candidate =
            rawItem.message ||
            rawItem.text ||
            rawItem.issue ||
            rawItem.description ||
            rawItem.id ||
            rawItem.rule;
          message = String(candidate || '').trim();
          if (rawItem.impact) impact = rawItem.impact;
          if (rawItem.helpUrl) help = rawItem.helpUrl;
          if (rawItem.helpHtml) helpHtml = rawItem.helpHtml;
          if (rawItem.helpLabel) helpLabel = rawItem.helpLabel;
          if (rawItem.wcag) {
            if (typeof rawItem.wcag === 'string') {
              wcagBadge = rawItem.wcag;
            } else if (typeof rawItem.wcag === 'object') {
              const badgeCandidate =
                rawItem.wcag.badge || rawItem.wcag.label || rawItem.wcag.text || null;
              if (badgeCandidate) wcagBadge = String(badgeCandidate);
              if (Array.isArray(rawItem.wcag.tags)) {
                wcagTags = rawItem.wcag.tags.filter(Boolean);
              }
            }
          }
          if (!wcagTags) {
            const candidateTags = rawItem.tags || rawItem.wcagTags;
            if (Array.isArray(candidateTags)) {
              wcagTags = candidateTags.filter(Boolean);
            }
          }
          if (!help && !helpHtml && Array.isArray(wcagTags) && wcagTags.length > 0) {
            const derived = deriveWcagHelpLink(wcagTags);
            if (derived) {
              help = derived.helpUrl;
              helpLabel = derived.helpLabel;
            }
          }
        } else {
          message = String(rawItem || '').trim();
        }

        const normalizedMessage = message.replace(/\s+/g, ' ').trim();
        if (!normalizedMessage) continue;

        let messageKey = normalizedMessage;
        let displayMessage = normalizedMessage;
        let sampleTarget = null;
        if (normalizeFn) {
          const normalized = normalizeFn({
            message: normalizedMessage,
            raw: rawItem,
            pageId,
          });
          if (normalized) {
            if (normalized.key) messageKey = normalized.key;
            if (normalized.label) displayMessage = normalized.label;
            if (normalized.sample) sampleTarget = normalized.sample;
            if (normalized.helpUrl) help = normalized.helpUrl;
            if (normalized.helpHtml) helpHtml = normalized.helpHtml;
            if (normalized.helpLabel) helpLabel = normalized.helpLabel;
          }
        }

        const key = JSON.stringify([
          messageKey,
          dedupeIgnoreImpact ? '' : impact || '',
          help || helpHtml || '',
          wcagBadge || '',
        ]);
        if (!map.has(key)) {
          map.set(key, {
            message: displayMessage,
            impact,
            helpUrl: help,
            helpHtml,
            helpLabel,
            wcagBadge: wcagBadge || null,
            wcagTags: new Set(Array.isArray(wcagTags) ? wcagTags : []),
            pages: new Set(),
            instanceCount: 0,
            samples: new Set(),
          });
        }

        const entry = map.get(key);
        entry.pages.add(pageId);
        entry.instanceCount += 1;
        if (rawItem && typeof rawItem === 'object' && Array.isArray(rawItem.samples)) {
          for (const rawSample of rawItem.samples) {
            if (rawSample != null) {
              const sampleValue = String(rawSample).trim();
              if (sampleValue) {
                entry.samples.add(sampleValue);
              }
            }
          }
        }
        if (rawItem && typeof rawItem === 'object' && rawItem.sample != null) {
          const sampleValue = String(rawItem.sample).trim();
          if (sampleValue) {
            entry.samples.add(sampleValue);
          }
        }
        if (wcagBadge && !entry.wcagBadge) {
          entry.wcagBadge = wcagBadge;
        }
        if (!entry.helpUrl && help) {
          entry.helpUrl = help;
        }
        if (!entry.helpHtml && helpHtml) {
          entry.helpHtml = helpHtml;
        }
        if (!entry.helpLabel && helpLabel) {
          entry.helpLabel = helpLabel;
        }
        if (Array.isArray(wcagTags)) {
          for (const tag of wcagTags) {
            if (tag) entry.wcagTags.add(tag);
          }
        }
        if (sampleTarget) {
          entry.samples.add(sampleTarget);
        }
      }
    }
  }

  return Array.from(map.values()).map((entry) => {
    const pages = Array.from(entry.pages);
    return {
      message: entry.message,
      impact: entry.impact,
      helpUrl: entry.helpUrl,
      helpHtml: entry.helpHtml,
      helpLabel: entry.helpLabel,
      wcagBadge: entry.wcagBadge,
      wcagTags: Array.from(entry.wcagTags || []),
      pages,
      pageCount: pages.length,
      instanceCount: entry.instanceCount,
      samples: Array.from(entry.samples || []),
    };
  });
};

const formatUniqueRulesHeading = (title, count, { noun = 'unique rules' } = {}) => {
  if (!count) return title;
  return `${title} (${formatCount(count)} ${noun})`;
};

const IMPACT_PRIORITY = {
  critical: 4,
  serious: 3,
  major: 3,
  error: 3,
  warning: 2,
  moderate: 2,
  minor: 1,
  advisory: 1,
  info: 0,
};

const impactWeight = (impact) => {
  if (!impact) return 0;
  const key = String(impact).toLowerCase();
  return IMPACT_PRIORITY[key] ?? 0;
};

const aggregatePageIssueEntries = (items, { defaultImpact = 'info', normalise } = {}) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const normaliseFn = typeof normalise === 'function' ? normalise : null;
  const map = new Map();

  for (const raw of items) {
    if (!raw) continue;

    let descriptor = null;
    if (normaliseFn) {
      descriptor = normaliseFn(raw);
      if (descriptor === null) continue;
    }

    let message = '';
    let impact = defaultImpact;
    let tags = null;
    let helpUrl = null;
    let key = null;

    if (descriptor && typeof descriptor === 'object') {
      message = descriptor.label || descriptor.message || descriptor.summary || descriptor.id || '';
      impact = descriptor.impact || impact;
      tags = Array.isArray(descriptor.tags) ? descriptor.tags : null;
      helpUrl = descriptor.helpUrl || null;
      key = descriptor.key || null;
    } else if (typeof descriptor === 'string') {
      message = descriptor;
    }

    if (!descriptor) {
      if (typeof raw === 'string') {
        message = raw;
      } else if (raw && typeof raw === 'object') {
        message =
          raw.message || raw.summary || raw.description || raw.id || raw.rule || raw.text || '';
        impact = raw.impact || impact;
        tags = Array.isArray(raw.tags) ? raw.tags : tags;
        helpUrl = raw.helpUrl || raw.help || helpUrl;
      }
    }

    message = String(message || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!message) continue;

    const entryKey = key ? String(key) : message;
    if (!map.has(entryKey)) {
      map.set(entryKey, {
        id: message,
        impact,
        weight: impactWeight(impact),
        nodesCount: 0,
        tags: new Set(Array.isArray(tags) ? tags.filter(Boolean) : []),
        helpUrl: helpUrl || null,
      });
    }

    const entry = map.get(entryKey);
    entry.nodesCount += 1;

    if (Array.isArray(tags)) {
      tags.filter(Boolean).forEach((tag) => entry.tags.add(tag));
    }

    const candidateImpact = impact || defaultImpact;
    const candidateWeight = impactWeight(candidateImpact);
    if (candidateWeight > entry.weight) {
      entry.weight = candidateWeight;
      entry.impact = candidateImpact;
    }

    if (!entry.helpUrl && helpUrl) {
      entry.helpUrl = helpUrl;
    }
  }

  return Array.from(map.values()).map((entry) => ({
    impact: entry.impact || defaultImpact,
    id: entry.id,
    nodesCount: entry.nodesCount,
    tags: Array.from(entry.tags),
    helpUrl: entry.helpUrl,
    helpHtml: entry.helpHtml || null,
    helpLabel: entry.helpLabel || null,
  }));
};

/* eslint-disable-next-line no-control-regex */
const ANSI_ESCAPE_REGEX = /\u001B\[[0-9;]*m/g;

const stripAnsiSequences = (value) => String(value ?? '').replace(ANSI_ESCAPE_REGEX, '');

const simplifyUrlForDisplay = (value) => {
  if (!value) return '';
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '/');
  } catch (_error) {
    return value;
  }
};

// Map WCAG success criteria to their \"Understanding\" document slugs.
// Source: https://www.w3.org/WAI/WCAG21/Understanding/ (fetched 2025-10-31).
const WCAG_UNDERSTANDING_SLUGS = {
  '1.1.1': 'non-text-content',
  '1.2.1': 'audio-only-and-video-only-prerecorded',
  '1.2.2': 'captions-prerecorded',
  '1.2.3': 'audio-description-or-media-alternative-prerecorded',
  '1.2.4': 'captions-live',
  '1.2.5': 'audio-description-prerecorded',
  '1.2.6': 'sign-language-prerecorded',
  '1.2.7': 'extended-audio-description-prerecorded',
  '1.2.8': 'media-alternative-prerecorded',
  '1.2.9': 'audio-only-live',
  '1.3.1': 'info-and-relationships',
  '1.3.2': 'meaningful-sequence',
  '1.3.3': 'sensory-characteristics',
  '1.3.4': 'orientation',
  '1.3.5': 'identify-input-purpose',
  '1.3.6': 'identify-purpose',
  '1.4.1': 'use-of-color',
  '1.4.2': 'audio-control',
  '1.4.3': 'contrast-minimum',
  '1.4.4': 'resize-text',
  '1.4.5': 'images-of-text',
  '1.4.6': 'contrast-enhanced',
  '1.4.7': 'low-or-no-background-audio',
  '1.4.8': 'visual-presentation',
  '1.4.9': 'images-of-text-no-exception',
  '1.4.10': 'reflow',
  '1.4.11': 'non-text-contrast',
  '1.4.12': 'text-spacing',
  '1.4.13': 'content-on-hover-or-focus',
  '2.1.1': 'keyboard',
  '2.1.2': 'no-keyboard-trap',
  '2.1.3': 'keyboard-no-exception',
  '2.1.4': 'character-key-shortcuts',
  '2.2.1': 'timing-adjustable',
  '2.2.2': 'pause-stop-hide',
  '2.2.3': 'no-timing',
  '2.2.4': 'interruptions',
  '2.2.5': 're-authenticating',
  '2.2.6': 'timeouts',
  '2.3.1': 'three-flashes-or-below-threshold',
  '2.3.2': 'three-flashes',
  '2.3.3': 'animation-from-interactions',
  '2.4.1': 'bypass-blocks',
  '2.4.2': 'page-titled',
  '2.4.3': 'focus-order',
  '2.4.4': 'link-purpose-in-context',
  '2.4.5': 'multiple-ways',
  '2.4.6': 'headings-and-labels',
  '2.4.7': 'focus-visible',
  '2.4.8': 'location',
  '2.4.9': 'link-purpose-link-only',
  '2.4.10': 'section-headings',
  '2.5.1': 'pointer-gestures',
  '2.5.2': 'pointer-cancellation',
  '2.5.3': 'label-in-name',
  '2.5.4': 'motion-actuation',
  '2.5.5': 'target-size',
  '2.5.6': 'concurrent-input-mechanisms',
  '3.1.1': 'language-of-page',
  '3.1.2': 'language-of-parts',
  '3.1.3': 'unusual-words',
  '3.1.4': 'abbreviations',
  '3.1.5': 'reading-level',
  '3.1.6': 'pronunciation',
  '3.2.1': 'on-focus',
  '3.2.2': 'on-input',
  '3.2.3': 'consistent-navigation',
  '3.2.4': 'consistent-identification',
  '3.2.5': 'change-on-request',
  '3.3.1': 'error-identification',
  '3.3.2': 'labels-or-instructions',
  '3.3.3': 'error-suggestion',
  '3.3.4': 'error-prevention-legal-financial-data',
  '3.3.5': 'help',
  '3.3.6': 'error-prevention-all',
  '4.1.1': 'parsing',
  '4.1.2': 'name-role-value',
  '4.1.3': 'status-messages',
};

const deriveWcagHelpLink = (tags) => {
  if (!Array.isArray(tags)) return null;

  const foundSections = new Set();
  const addSection = (value) => {
    if (!value) return;
    const section = String(value).trim();
    if (!section) return;
    const parts = section.split('.');
    if (parts.length !== 3) return;
    if (parts.some((part) => part.length === 0)) return;
    foundSections.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
  };

  for (const rawTag of tags) {
    if (!rawTag || typeof rawTag !== 'string') continue;
    const tag = rawTag.trim();
    if (!tag) continue;

    const dotted = tag.match(/([0-9]+(?:\.[0-9]+){2})/);
    if (dotted) addSection(dotted[1]);

    const underscored = tag.match(/([0-9]+(?:_[0-9]+){2})/);
    if (underscored) addSection(underscored[1].replace(/_/g, '.'));

    const spaced = tag.match(/wcag\s*([0-9])\.?([0-9])\.?([0-9]+)/i);
    if (spaced) addSection(`${spaced[1]}.${spaced[2]}.${spaced[3]}`);

    const compact = tag.match(/wcag(\d{3,4})/i);
    if (compact) {
      const digits = compact[1];
      if (digits.length >= 3) {
        const section = `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
        addSection(section);
      }
    }

    const criterion = tag.match(/(?:success\s+criterion|sc)\s*([0-9]+(?:\.[0-9]+){2})/i);
    if (criterion) addSection(criterion[1]);
  }

  if (foundSections.size === 0) return null;

  let fallbackSection = null;
  for (const section of foundSections) {
    const slug = WCAG_UNDERSTANDING_SLUGS[section];
    if (slug) {
      return {
        helpUrl: `https://www.w3.org/WAI/WCAG21/Understanding/${slug}.html`,
        helpLabel: `Understanding ${section}`,
      };
    }
    if (!fallbackSection) fallbackSection = section;
  }

  if (fallbackSection) {
    const anchor = fallbackSection.replace(/\./g, '-');
    return {
      helpUrl: `https://www.w3.org/TR/WCAG21/#sc-${anchor}`,
      helpLabel: `WCAG ${fallbackSection}`,
    };
  }

  return null;
};

const normalizeInteractiveMessage = (input) => {
  const helpUrl = input && typeof input === 'object' ? input.helpUrl || null : null;
  const helpHtml = input && typeof input === 'object' ? input.helpHtml || null : null;
  const helpLabel = input && typeof input === 'object' ? input.helpLabel || null : null;
  const resolveRawInput = (value) => {
    if (!value || typeof value !== 'object') return '';
    if (typeof value.raw === 'string') return value.raw;
    if (value.raw && typeof value.raw.message === 'string') return value.raw.message;
    return value.message || value.error || value.failure || '';
  };

  const raw =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object'
        ? resolveRawInput(input)
        : '';
  if (!raw) return null;

  let text = stripAnsiSequences(raw).trim();
  if (!text) return null;
  const newlineIndex = text.indexOf('\n');
  if (newlineIndex >= 0) {
    text = text.slice(0, newlineIndex).trim();
  }
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/#\d+/g, '#n');
  text = text.replace(/Timeout [0-9.]+ms exceeded/gi, 'Timeout exceeded');
  text = text.replace(/requestfailed/gi, 'request failed');
  text = text.replace(/request failed failed/gi, 'request failed');

  const urlMatch = text.match(/https?:\/\/\S+/i);
  if (urlMatch) {
    let candidate = urlMatch[0];
    while (candidate && /[),.;!?]$/.test(candidate)) {
      candidate = candidate.slice(0, -1);
    }
    const simplified = simplifyUrlForDisplay(candidate);
    text = text.replace(urlMatch[0], simplified);
  }

  if (!text) return null;
  return { key: text, label: text, helpUrl, helpHtml, helpLabel };
};

const formatWcagTagLabel = (tag) => {
  if (!tag) return null;
  const lower = String(tag).toLowerCase();
  if (!lower.includes('wcag')) return null;
  if (tag.toUpperCase().includes('WCAG') && tag.includes(' ')) return tag.toUpperCase();
  const levelMatch = lower.match(/^wcag(\d+)(a{1,3})$/);
  if (levelMatch) {
    const versionDigits = levelMatch[1];
    const grade = levelMatch[2].toUpperCase();
    let version = versionDigits;
    if (versionDigits.length === 1) {
      version = `${versionDigits}.0`;
    } else if (versionDigits.length === 2) {
      version = `${versionDigits[0]}.${versionDigits[1]}`;
    }
    return `WCAG ${version} ${grade}`;
  }
  const guidelineMatch = lower.match(/^wcag(\d)(\d)(\d)$/);
  if (guidelineMatch) {
    return `WCAG ${guidelineMatch[1]}.${guidelineMatch[2]}.${guidelineMatch[3]}`;
  }
  if (lower.startsWith('wcag')) {
    return lower.replace('wcag', 'WCAG ').toUpperCase();
  }
  return String(tag);
};

const renderWcagTagBadges = (tags) => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return '<span class="badge badge-neutral">No WCAG tag</span>';
  }
  const labels = Array.from(new Set(tags.map((tag) => formatWcagTagLabel(tag)).filter(Boolean)));
  if (labels.length === 0) {
    return '<span class="badge badge-neutral">No WCAG tag</span>';
  }
  return labels
    .map((label) => {
      const isNeutral = /^no wcag/i.test(label);
      const badgeClass = isNeutral ? 'badge badge-neutral' : 'badge badge-wcag';
      return `<span class="${badgeClass}">${escapeHtml(label)}</span>`;
    })
    .join('');
};

const extractNodeTargets = (nodes, limit = 3) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const targets = [];
  const enrichments = [];
  nodes.forEach((node) => {
    const screenshot =
      node?.screenshotDataUri || node?.screenshot || node?.image || node?.preview || null;
    if (Array.isArray(node?.target) && node.target.length > 0) {
      node.target.forEach((selector) => {
        if (selector) {
          targets.push(String(selector));
          enrichments.push({ label: String(selector), screenshot });
        }
      });
    } else if (typeof node?.html === 'string' && node.html.trim()) {
      const label = node.html.trim();
      targets.push(label);
      enrichments.push({ label, screenshot });
    }
  });
  if (!targets.length) return null;
  const unique = Array.from(new Set(targets)).slice(0, limit);
  const byLabel = new Map(enrichments.map((e) => [e.label, e]));
  return unique
    .map((label) => `<code>${escapeHtml(label)}</code>`)
    .join('<br />');
};

// Build a compact list of screenshot links for nodes that include
// a screenshot reference (data URI or relative path).
const extractNodeScreenshots = (nodes, limit = 3) => {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const hrefs = [];
  nodes.forEach((node) => {
    const href = node?.screenshotDataUri || node?.screenshot || node?.image || node?.preview || null;
    if (!href) return;
    const safeHref = String(href).startsWith('data:') || String(href).startsWith('http') || String(href).startsWith('/')
      ? String(href)
      : `./${String(href)}`;
    hrefs.push(safeHref);
  });
  if (hrefs.length === 0) return null;
  const unique = Array.from(new Set(hrefs)).slice(0, limit);
  return unique
    .map((href, idx) => `<a class="screenshot-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">View${unique.length > 1 ? ` #${idx + 1}` : ''}</a>`)
    .join('<br />');
};

const formatMilliseconds = (value) => {
  if (!Number.isFinite(value)) return null;
  if (value >= 1000) {
    const seconds = value / 1000;
    return seconds % 1 === 0 ? `${seconds.toFixed(0)}s` : `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
};

const formatWcagStability = (stability) => {
  if (!stability || typeof stability !== 'object') return null;
  const strategy = stability.successfulStrategy || stability.strategy || stability.strategyUsed;
  const elapsed =
    Number.isFinite(stability.totalElapsed) && stability.totalElapsed >= 0
      ? stability.totalElapsed
      : Number.isFinite(stability.duration) && stability.duration >= 0
        ? stability.duration
        : null;
  if (!strategy && elapsed == null) {
    return stability.ok === false ? 'Encountered stability issues.' : null;
  }
  const pieces = [];
  if (strategy) {
    pieces.push(`Reached <code>${escapeHtml(strategy)}</code>`);
  }
  if (elapsed != null) {
    pieces.push(`in ${formatMilliseconds(elapsed)}`);
  }
  return `${pieces.join(' ')}.`;
};

const deriveWcagPageStatus = (summary) => {
  const status = summary?.status;
  if (status === 'scan-error' || status === 'http-error' || status === 'stability-timeout') {
    return {
      pillClass: 'status-warning',
      pillLabel: 'Scan issue',
      pageClass: 'summary-page--warn',
    };
  }
  const violationsCount =
    summary?.gatingViolations ??
    (Array.isArray(summary?.violations) ? summary.violations.length : 0);

  if (violationsCount > 0) {
    return {
      pillClass: 'status-error',
      pillLabel: 'Accessibility violations',
      pageClass: 'summary-page--fail',
    };
  }

  const advisoriesList =
    (Array.isArray(summary?.advisoriesList) && summary.advisoriesList.length
      ? summary.advisoriesList
      : Array.isArray(summary?.advisories) && summary.advisories.length
        ? summary.advisories
        : Array.isArray(summary?.advisory)
          ? summary.advisory
          : []) || [];

  const bestPracticesList =
    (Array.isArray(summary?.bestPracticesList) && summary.bestPracticesList.length
      ? summary.bestPracticesList
      : Array.isArray(summary?.bestPractices) && summary.bestPractices.length
        ? summary.bestPractices
        : Array.isArray(summary?.bestPractice)
          ? summary.bestPractice
          : []) || [];

  const advisoryCount = summary?.advisoryFindings ?? advisoriesList.length;
  const bestPracticeCount = summary?.bestPracticeFindings ?? bestPracticesList.length;
  const hasAdvisories = (advisoryCount || 0) + (bestPracticeCount || 0) > 0;

  if (hasAdvisories) {
    return {
      pillClass: 'status-advisory',
      pillLabel: 'Advisories',
      pageClass: 'summary-page--advisory',
    };
  }

  return {
    pillClass: 'status-ok',
    pillLabel: 'Pass',
    pageClass: 'summary-page--ok',
  };
};

const WCAG_PER_PAGE_TOGGLE_SCRIPT = `
(function () {
  const scriptEl = document.currentScript;
  if (!scriptEl) return;
  const container = scriptEl.previousElementSibling;
  if (!container) return;
  const accordions = Array.from(container.querySelectorAll('details.summary-page'));
  if (accordions.length === 0) return;
  const toggles = container.querySelectorAll('[data-toggle]');
  toggles.forEach((button) => {
    button.addEventListener('click', () => {
      const open = button.dataset.toggle === 'expand';
      accordions.forEach((accordion) => {
        accordion.open = open;
      });
    });
  });
})();
`;

const formatRuleHeading = (label, count) =>
  count ? `${label} (${formatCount(count)} unique rules)` : label;

const renderAccessibilityRuleTable = (title, rules, { headingClass, sectionClass } = {}) => {
  if (!Array.isArray(rules) || rules.length === 0) return '';
  const rows = rules
    .map((rule) => {
      const wcagTags =
        Array.isArray(rule.wcagTags) && rule.wcagTags.length > 0 ? rule.wcagTags : [];
      const viewportsRaw = rule.viewports || rule.viewportsTested || [];
      const viewportList = Array.isArray(viewportsRaw)
        ? viewportsRaw.filter(Boolean)
        : viewportsRaw
          ? [viewportsRaw]
          : [];
      const viewportCell = viewportList.length ? viewportList.join(', ') : '—';
      const helpLink = rule.helpUrl
        ? `<a href="${escapeHtml(rule.helpUrl)}" target="_blank" rel="noopener noreferrer">rule docs</a>`
        : '<span class="details">—</span>';
      const wcagHtml = wcagTags.length ? renderWcagTagBadges(wcagTags) : renderWcagTagBadges([]);
      return `
        <tr class="impact-${escapeHtml((rule.impact || rule.category || 'info').toLowerCase())}">
          <td>${escapeHtml(rule.impact || rule.category || 'info')}</td>
          <td>${escapeHtml(rule.rule || rule.id || 'Unnamed rule')}</td>
          <td>${escapeHtml(viewportCell)}</td>
          <td>${escapeHtml(formatCount(Array.isArray(rule.pages) ? rule.pages.length : rule.pages || 0))}</td>
          <td>${escapeHtml(formatCount(rule.nodes ?? 0))}</td>
          <td>${wcagHtml}</td>
          <td>${helpLink}</td>
        </tr>
      `;
    })
    .join('');
  const headingAttr = headingClass ? ` class="${headingClass}"` : '';
  const sectionModifier = sectionClass ? ` ${sectionClass}` : '';
  return `
    <section class="summary-report summary-a11y${sectionModifier}">
      <h3${headingAttr}>${escapeHtml(title)}</h3>
      <table>
        <thead>
          <tr><th>Impact</th><th>Rule</th><th>Viewport(s)</th><th>Pages</th><th>Nodes</th><th>WCAG level</th><th>Help</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
};

const SUITE_GROUP_DEFINITIONS = [
  {
    id: 'accessibility',
    label: 'Accessibility',
    heading: 'WCAG & manual audits',
    summaryTypes: [
      'wcag',
      'forms',
      'keyboard',
      'reduced-motion',
      'reflow',
      'iframe-metadata',
      'structure',
    ],
  },
  {
    id: 'functionality',
    label: 'Functionality',
    heading: 'Console, links, and service health',
    summaryTypes: ['interactive', 'internal-links', 'availability', 'http', 'performance'],
  },
  {
    id: 'responsive',
    label: 'Responsive',
    heading: 'Breakpoint and WordPress coverage',
    summaryTypes: ['responsive-structure', 'wp-features'],
  },
  {
    id: 'visual',
    label: 'Visual',
    heading: 'Screenshot comparisons',
    summaryTypes: ['visual'],
  },
];

const SUITE_PANEL_DEFINITIONS = [
  {
    id: 'accessibility-wcag',
    summaryType: 'wcag',
    navGroup: 'Accessibility',
    navLabel: 'WCAG audit',
    specLabel: 'Accessibility',
    title: 'WCAG Findings',
    description:
      'Runs axe-core plus custom WCAG checks across the manifest to surface gating violations and advisory findings.',
  },
  {
    id: 'accessibility-forms',
    summaryType: 'forms',
    navGroup: 'Accessibility',
    navLabel: 'Forms validation',
    specLabel: 'Accessibility',
    title: 'Forms Validation Findings',
    description:
      'Evaluates configured forms for labelling, error messaging, and accessible validation responses.',
  },
  {
    id: 'accessibility-keyboard',
    summaryType: 'keyboard',
    navGroup: 'Accessibility',
    navLabel: 'Keyboard navigation',
    specLabel: 'Accessibility',
    title: 'Keyboard Navigation Findings',
    description:
      'Walks focus through key flows to confirm visible focus states, skip links, and navigable control ordering.',
  },
  {
    id: 'accessibility-structure',
    summaryType: 'structure',
    navGroup: 'Accessibility',
    navLabel: 'Structural semantics',
    specLabel: 'Accessibility',
    title: 'Structural Semantics Findings',
    description:
      'Audits headings and ARIA landmarks to ensure pages expose consistent document outlines and main regions.',
  },
  {
    id: 'functionality-links',
    summaryType: 'internal-links',
    navGroup: 'Functionality',
    navLabel: 'Internal link integrity',
    specLabel: 'Functionality',
    title: 'Internal Link Integrity',
    description:
      'Checks sampled internal links for HTTP errors or unexpected redirects so navigation remains intact.',
  },
  {
    id: 'functionality-interactive',
    summaryType: 'interactive',
    navGroup: 'Functionality',
    navLabel: 'Console & API stability',
    specLabel: 'Functionality',
    title: 'Console & API Stability',
    description:
      'Monitors console and network failures during lightweight interactions to catch regression crashes early.',
  },
  {
    id: 'functionality-availability',
    summaryType: 'availability',
    navGroup: 'Functionality',
    navLabel: 'Service endpoint health',
    specLabel: 'Functionality',
    title: 'Service Endpoint Health',
    description:
      'Verifies uptime checks, HTTP status expectations, and core service availability for the sampled pages.',
  },
  {
    id: 'responsive-layout',
    summaryType: 'responsive-structure',
    navGroup: 'Responsive',
    navLabel: 'Responsive breakpoint coverage',
    specLabel: 'Responsive',
    title: 'Responsive Breakpoint Coverage',
    description:
      'Captures layout structure across viewports, flagging missing navigation, headers, or content sections.',
  },
  {
    id: 'visual-regression',
    summaryType: 'visual',
    navGroup: 'Visual',
    navLabel: 'Visual regression',
    specLabel: 'Visual',
    title: 'Visual Regression Findings',
    description:
      'Highlights screenshot diffs, thresholds, and artifact previews for pages with detected pixel deltas.',
  },
];

const PANEL_STATUS_META = {
  fail: {
    label: 'Fail',
    specClass: 'spec-status--fail',
    navClass: 'status-fail',
  },
  warn: {
    label: 'Review',
    specClass: 'spec-status--warn',
    navClass: 'status-info',
  },
  pass: {
    label: 'Pass',
    specClass: 'spec-status--pass',
    navClass: 'status-pass',
  },
  info: {
    label: 'Overview',
    specClass: 'spec-status--info',
    navClass: 'status-info',
  },
};

const getNumericValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return 0;
};

const sumOverviewKeys = (entries, keys) =>
  entries.reduce((total, entry) => {
    if (!entry || typeof entry.overview !== 'object') return total;
    keys.forEach((key) => {
      if (key in entry.overview) {
        total += getNumericValue(entry.overview[key]);
      }
    });
    return total;
  }, 0);

const BLOCKING_PRIMARY_KEYS = [
  'totalGatingFindings',
  'totalConsoleErrors',
  'totalResourceErrors',
  'brokenLinksDetected',
  'diffs',
  'budgetBreaches',
  'budgetExceeded',
  'errors',
];

const BLOCKING_FALLBACK_KEYS = [
  'gatingPages',
  'pagesWithGatingIssues',
  'pagesWithErrors',
  'pagesWithFailedChecks',
  'pagesWithConsoleErrors',
  'pagesWithResourceErrors',
  'diffPages',
  'pagesWithDiffs',
];

const pickFirstAvailableKey = (source, keys) => {
  for (const key of keys) {
    if (source[key] != null) return key;
  }
  return null;
};

const deriveSuiteMetrics = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { blocking: 0, warnings: 0, advisories: 0, affectedPages: 0 };
  }

  let blocking = 0;
  let warnings = 0;
  let advisories = 0;
  let affectedPages = 0;

  entries.forEach((entry) => {
    const overview = entry?.overview || {};
    const hasPrimaryBlockingKey = BLOCKING_PRIMARY_KEYS.some((key) => overview[key] != null);
    if (hasPrimaryBlockingKey) {
      blocking += sumOverviewKeys([entry], BLOCKING_PRIMARY_KEYS);
    } else {
      const fallbackKey = pickFirstAvailableKey(overview, BLOCKING_FALLBACK_KEYS);
      if (fallbackKey) {
        blocking += getNumericValue(overview[fallbackKey]);
      }
    }

    warnings += sumOverviewKeys(
      [entry],
      ['pagesWithWarnings', 'advisoryPages', 'pagesWithAdvisories', 'warnings']
    );

    advisories += sumOverviewKeys(
      [entry],
      ['totalAdvisoryFindings', 'advisories', 'totalBestPracticeFindings']
    );

    affectedPages += sumOverviewKeys(
      [entry],
      ['gatingPages', 'pagesWithGatingIssues', 'pagesWithErrors', 'diffPages', 'pagesWithDiffs']
    );
  });

  return { blocking, warnings, advisories, affectedPages };
};

const collectRunSummariesByType = (records = []) => {
  const map = new Map();
  records.forEach((record) => {
    (record?.summaries || []).forEach((summary) => {
      if (!summary || summary.kind !== KIND_RUN_SUMMARY) return;
      const summaryType = summary.metadata?.summaryType;
      if (!summaryType) return;
      const scope = summary.metadata?.scope;
      const existing = map.get(summaryType);
      if (!existing) {
        map.set(summaryType, summary);
        return;
      }
      if (existing.metadata?.scope !== 'run' && scope === 'run') {
        map.set(summaryType, summary);
      }
    });
  });
  return map;
};

const formatNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString();
  return value;
};

const pluralise = (value, singular, plural) => {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count)) return singular;
  return count === 1 ? singular : plural;
};

const formatList = (values, emptyFallback = null) => {
  if (!Array.isArray(values) || values.length === 0) return emptyFallback;
  return values.join(', ');
};

const resolvePagesTested = (summaryMap) => {
  const preferredOrder = [
    { type: 'wcag', keys: ['totalPages', 'totalPagesAudited'] },
    { type: 'responsive-structure', keys: ['totalPages'] },
    { type: 'visual', keys: ['totalPages'] },
    { type: 'internal-links', keys: ['totalPages'] },
  ];

  for (const { type, keys } of preferredOrder) {
    const summary = summaryMap.get(type);
    if (!summary) continue;
    for (const key of keys) {
      const value = summary?.overview ? summary.overview[key] : null;
      const numeric = getNumericValue(value);
      if (numeric > 0) return numeric;
    }
  }

  let fallback = 0;
  summaryMap.forEach((summary) => {
    const overview = summary?.overview || {};
    ['totalPages', 'totalPagesAudited', 'pagesSampled'].forEach((key) => {
      const numeric = getNumericValue(overview[key]);
      if (numeric > fallback) fallback = numeric;
    });
  });

  return fallback || null;
};

const buildSuiteCards = (summaryMap) =>
  SUITE_GROUP_DEFINITIONS.map((group) => {
    const entries = group.summaryTypes
      .map((type) => summaryMap.get(type))
      .filter((entry) => Boolean(entry));

    if (entries.length === 0) return null;

    const metrics = deriveSuiteMetrics(entries);
    const specIds = new Set();
    entries.forEach((entry) => {
      const specId = entry.metadata?.spec;
      if (specId) {
        specIds.add(`${specId}.spec.js`);
      }
    });

    const specsText = specIds.size ? Array.from(specIds).join(', ') : 'Not captured';
    const hasBlocking = metrics.blocking > 0;
    const hasWarnings = metrics.warnings > 0 || metrics.advisories > 0;
    const statusClass = hasBlocking ? 'status-fail' : hasWarnings ? 'status-info' : 'status-pass';
    const blockingFindings = hasBlocking ? metrics.blocking : 0;
    const blockingPages = metrics.affectedPages || 0;
    const summaryText = hasBlocking
      ? 'Blocking issues detected. Open this suite tab for the affected pages and fixes.'
      : hasWarnings
        ? 'No blockers, but warnings were logged for follow-up.'
        : 'No blocking issues detected in this suite.';

    return {
      id: group.id,
      label: group.label,
      heading: group.heading,
      statusClass,
      specsText,
      blockingFindings,
      blockingPages,
      summaryText,
    };
  }).filter(Boolean);

const renderSuiteCardsSection = (suiteCards) => {
  if (!Array.isArray(suiteCards) || suiteCards.length === 0) return '';

  const cardsHtml = suiteCards
    .map(
      (card) => `
        <article class="suite-card ${escapeHtml(card.statusClass)}">
          <header>
            <p class="spec-label">${escapeHtml(card.label)}</p>
            <h4>${escapeHtml(card.heading)}</h4>
          </header>
          <ul class="suite-metrics suite-metrics--summary">
            <li><strong>Specs:</strong> ${escapeHtml(card.specsText)}</li>
            <li><strong>Blocking findings:</strong> ${
              card.blockingFindings
                ? `${escapeHtml(
                    formatNumber(card.blockingFindings)
                  )} ${escapeHtml(pluralise(card.blockingFindings, 'finding', 'findings'))}`
                : '0 findings'
            }</li>
            <li><strong>Blocking pages:</strong> ${
              card.blockingPages
                ? `${escapeHtml(
                    formatNumber(card.blockingPages)
                  )} ${escapeHtml(pluralise(card.blockingPages, 'page', 'pages'))}`
                : '0 pages'
            }</li>
          </ul>
          <p class="suite-status">${escapeHtml(card.summaryText)}</p>
        </article>
      `
    )
    .join('\n');

  return `
    <section class="suite-overview">
      <h3>Suites at a glance</h3>
      <div class="suite-grid">
        ${cardsHtml}
      </div>
    </section>
  `;
};

const resolveViewportsTested = (records = []) => {
  const viewports = new Set();
  records.forEach((record) => {
    (record?.summaries || []).forEach((summary) => {
      const meta = summary?.metadata || {};
      const metaViewports = Array.isArray(meta.viewports) ? meta.viewports : null;
      if (metaViewports && metaViewports.length > 0) {
        metaViewports.filter(Boolean).forEach((viewport) => viewports.add(String(viewport)));
      }
      if (meta.viewport) {
        viewports.add(String(meta.viewport));
      }
    });
  });
  return Array.from(viewports);
};

const renderSummaryStatCards = (run, summaryMap, suiteCards, schemaRecords, suitePanels = []) => {
  const pagesTested = resolvePagesTested(summaryMap);
  const projects = Array.isArray(run?.projects) ? run.projects.filter(Boolean) : [];
  const viewportsTested = resolveViewportsTested(schemaRecords);
  const siteLabel = run?.site?.baseUrl || run?.site?.name || null;

  const stats = [
    {
      label: 'SITE TESTED',
      count: siteLabel ? '1' : '—',
      meta: siteLabel || 'Not captured',
    },
    {
      label: 'PAGES SCANNED',
      count: pagesTested != null ? formatNumber(pagesTested) : '—',
      meta: pagesTested != null ? 'per test' : 'Not captured',
    },
    {
      label: 'SPEC PANELS',
      count: suitePanels.length ? formatNumber(suitePanels.length) : '—',
      meta: suitePanels.length ? 'Visible in sidebar' : 'None rendered',
    },
    {
      label: 'BROWSERS INCLUDED',
      count: projects.length ? formatNumber(projects.length) : '—',
      meta: projects.length ? formatList(projects) : 'Not captured',
    },
    {
      label: 'LAYOUTS COVERED',
      count: viewportsTested.length ? formatNumber(viewportsTested.length) : '—',
      meta: viewportsTested.length ? formatList(viewportsTested) : 'Not captured',
    },
  ];

  const cardsHtml = stats
    .map(
      (stat) => `
        <article class="summary-card">
          <h2 class="summary-card__title"><span class="summary-card__count">${escapeHtml(
            String(stat.count)
          )}</span> ${escapeHtml(stat.label)}</h2>
          <div class="meta">${escapeHtml(stat.meta)}</div>
        </article>
      `
    )
    .join('\n');

  return cardsHtml
    ? `
    <section class="summary-grid summary-grid--stats">
      ${cardsHtml}
    </section>
  `
    : '';
};

const renderSummaryOverview = (run, schemaRecords, suitePanels = []) => {
  const summaryMap = collectRunSummariesByType(schemaRecords);
  if (summaryMap.size === 0 && !run) return '';

  const suiteCards = buildSuiteCards(summaryMap);
  const statCards = renderSummaryStatCards(
    run,
    summaryMap,
    suiteCards,
    schemaRecords,
    Array.isArray(suitePanels) ? suitePanels : []
  );
  const suitesHtml = renderSuiteCardsSection(suiteCards);

  return [statCards, suitesHtml].filter(Boolean).join('\n');
};

const buildSchemaGroups = (records = []) => {
  const groups = new Map();
  records.forEach((record) => {
    const projectName = record.projectName || 'default';
    const testAnchorId = record.testAnchorId || null;
    (record.summaries || []).forEach((summary) => {
      if (!summary?.baseName) return;
      const baseName = summary.baseName;
      let group = groups.get(baseName);
      if (!group) {
        group = {
          baseName,
          title: summary.title || baseName,
          runEntries: [],
          pageEntries: [],
        };
        groups.set(baseName, group);
      }
      if (!group.title && summary.title) {
        group.title = summary.title;
      }
      const entry = { payload: summary, projectName, testAnchorId };
      if (summary.kind === KIND_RUN_SUMMARY) {
        group.runEntries.push(entry);
        if (summary.metadata?.suppressPageEntries) {
          group.suppressPageEntries = true;
        }
      } else if (summary.kind === KIND_PAGE_SUMMARY) {
        if (summary.metadata?.suppressPageEntries) {
          group.suppressPageEntries = true;
        }
        group.pageEntries.push(entry);
      }
    });
  });
  return Array.from(groups.values());
};

const renderSchemaRunEntry = (entry) => {
  const payload = entry.payload || {};
  const metadata = payload.metadata || {};
  const chips = [];
  if (metadata.scope) chips.push(`Scope: ${metadata.scope}`);
  if (metadata.projectName && metadata.scope !== 'run') {
    chips.push(`Project: ${metadata.projectName}`);
  }
  if (Array.isArray(metadata.viewports) && metadata.viewports.length > 0) {
    chips.push(`Viewports: ${metadata.viewports.join(', ')}`);
  }
  if (metadata.failOn) chips.push(`Threshold: ${metadata.failOn}`);

  const metaHtml = chips.length
    ? `<div class="schema-meta">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>`
    : '';
  const hasCustomHtml = Boolean(payload.htmlBody);
  const overviewHtml = hasCustomHtml
    ? payload.htmlBody
    : payload.overview
      ? renderSchemaMetrics(payload.overview)
      : '';
  const rulesHtml = hasCustomHtml ? '' : renderRuleSnapshotsTable(payload.ruleSnapshots);

  const body = [metaHtml, overviewHtml, rulesHtml].filter(Boolean).join('\n');
  if (!body) return '';

  return `
    <section class="schema-overview">
      ${body}
    </section>
  `;
};

const renderSchemaPageEntries = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const grouped = new Map();
  entries.forEach((entry) => {
    const payload = entry.payload || {};
    const page = payload.page || 'Unknown page';
    if (!grouped.has(page)) grouped.set(page, []);
    grouped.get(page).push(entry);
  });

  const accordions = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([page, pageEntries]) => {
      const sortedEntries = pageEntries.sort((a, b) =>
        (a.payload.viewport || '').localeCompare(b.payload.viewport || '')
      );
      const hasCustomCards = sortedEntries.some((entry) =>
        Boolean(entry.payload?.summary?.cardHtml)
      );

      const content = hasCustomCards
        ? sortedEntries
            .map((entry) => {
              const payload = entry.payload || {};
              const summaryData = payload.summary || {};
              if (summaryData.cardHtml) return summaryData.cardHtml;
              const fallback = renderSchemaMetrics(summaryData);
              return `<div class="schema-metrics">${fallback}</div>`;
            })
            .join('\n')
        : (() => {
            const rows = sortedEntries
              .map((entry) => {
                const payload = entry.payload || {};
                const viewport = payload.viewport || entry.projectName || 'default';
                const summaryHtml = payload.summary
                  ? renderSchemaMetrics(payload.summary)
                  : '<span class="schema-value schema-value--empty">No summary data</span>';
                return `
                  <tr>
                    <td>${escapeHtml(viewport)}</td>
                    <td>${summaryHtml}</td>
                  </tr>
                `;
              })
              .join('');
            return `
              <table class="schema-table">
                <thead><tr><th>Viewport</th><th>Summary</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            `;
          })();

      return `
        <details class="summary-page schema-page-accordion">
          <summary>${escapeHtml(page)}</summary>
          <div class="summary-page__body">
            ${content}
          </div>
        </details>
      `;
    });

  return accordions.join('');
};

const collectSchemaProjects = (group) => {
  const map = new Map();
  const ensure = (projectName) => {
    const key = projectName || 'default';
    if (!map.has(key)) {
      map.set(key, { projectName: key, runEntries: [], pageEntries: [] });
    }
    return map.get(key);
  };

  for (const entry of group.runEntries || []) {
    const meta = entry.payload?.metadata || {};
    const projectName =
      meta.projectName || entry.projectName || (meta.scope === 'run' ? 'run' : 'default');
    ensure(projectName).runEntries.push(entry);
  }

  for (const entry of group.pageEntries || []) {
    const meta = entry.payload?.metadata || {};
    const projectName = meta.projectName || entry.projectName || 'default';
    ensure(projectName).pageEntries.push(entry);
  }

  return Array.from(map.values());
};

const summaryTypeFromGroup = (group) => {
  for (const entry of group.runEntries || []) {
    const type = entry.payload?.metadata?.summaryType;
    if (type) return type;
  }
  for (const entry of group.pageEntries || []) {
    const type = entry.payload?.metadata?.summaryType;
    if (type) return type;
  }
  return null;
};

const renderWcagPageIssueTable = (entries, heading, options = {}) => {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const headingClass = options.headingClass ? ` class="${escapeHtml(options.headingClass)}"` : '';
  const rows = entries
    .map((entry) => {
      const impact = entry.impact || entry.category || 'info';
      const nodesCount = Array.isArray(entry.nodes) ? entry.nodes.length : entry.nodesCount || 0;
      const helpUrl = entry.helpUrl || entry.help || null;
      const targetsHtml = extractNodeTargets(entry.nodes || []);
      const screenshotsHtml = extractNodeScreenshots(entry.nodes || []);
      const wcagHtml = renderWcagTagBadges(entry.tags || entry.wcagTags || []);
      return `
        <tr class="impact-${escapeHtml((impact || 'info').toLowerCase())}">
          <td>${escapeHtml(impact || 'info')}</td>
          <td>${escapeHtml(entry.id || entry.rule || 'Unnamed rule')}</td>
          <td>${escapeHtml(formatCount(nodesCount))}</td>
          <td>${helpUrl ? `<a href="${escapeHtml(helpUrl)}" target="_blank" rel="noopener noreferrer">rule docs</a>` : '<span class="details">—</span>'}</td>
          <td>${wcagHtml}</td>
          <td>${screenshotsHtml || '<span class="details">—</span>'}</td>
          <td>${targetsHtml || '<span class="details">—</span>'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <h4${headingClass}>${escapeHtml(heading)}</h4>
    <div class="page-card__table">
      <table>
        <thead><tr><th>Impact</th><th>Rule</th><th>Nodes</th><th>Help</th><th>WCAG level</th><th>Screenshot</th><th>Culprit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
};

const renderWcagRunSummary = (overview, details, { viewportLabel, viewportsCount }) => {
  const pages = Array.isArray(details?.pages) ? details.pages : [];
  const totalPages = overview?.totalPages ?? pages.length;
  const failThreshold = details?.failThreshold || overview?.failThreshold;
  const gatingPages =
    overview?.gatingPages ?? pages.filter((page) => (page.gatingViolations || 0) > 0).length;
  const advisoryPages =
    overview?.advisoryPages ?? pages.filter((page) => (page.advisoryFindings || 0) > 0).length;
  const bestPracticePages =
    overview?.bestPracticePages ??
    pages.filter((page) => (page.bestPracticeFindings || 0) > 0).length;
  const scanIssues = pages.filter((page) =>
    ['scan-error', 'http-error', 'stability-timeout'].includes(page.status)
  ).length;
  const totalAdvisories =
    overview?.totalAdvisoryFindings ??
    pages.reduce((sum, page) => sum + (page.advisoryFindings || 0), 0);
  const totalBestPractice =
    overview?.totalBestPracticeFindings ??
    pages.reduce((sum, page) => sum + (page.bestPracticeFindings || 0), 0);

  const summaryItems = [
    {
      label: 'Accessibility violations',
      tone: 'status-error',
      count: gatingPages,
      suffix: 'page(s)',
    },
    {
      label: 'Advisory findings',
      tone: 'status-advisory',
      count: advisoryPages,
      suffix: 'page(s)',
    },
    {
      label: 'Best-practice advisories',
      tone: 'status-info',
      count: bestPracticePages,
      suffix: 'page(s)',
    },
  ];

  if (scanIssues > 0) {
    summaryItems.push({
      label: 'Scan issues',
      tone: 'status-warning',
      count: scanIssues,
      suffix: 'page(s)',
    });
  }

  const statusSummary = renderStatusSummaryList(summaryItems, { className: 'status-summary' });

  const advisoryNote =
    totalAdvisories > 0
      ? `<p class="details">Advisory findings appeared ${escapeHtml(
          formatCount(totalAdvisories)
        )} time(s) across ${escapeHtml(formatCount(advisoryPages))} page(s).</p>`
      : '';
  const bestPracticeNote =
    totalBestPractice > 0
      ? `<p class="details">Best-practice advisories appeared ${escapeHtml(
          formatCount(totalBestPractice)
        )} time(s) across ${escapeHtml(formatCount(bestPracticePages))} page(s).</p>`
      : '';
  const detailNotes = [advisoryNote, bestPracticeNote].filter(Boolean).join('\n');

  return `
    <section class="summary-report summary-a11y summary-a11y--run-summary">
      <h3>Accessibility run summary</h3>
      <p>Analyzed <strong>${escapeHtml(
        formatCount(totalPages)
      )}</strong> page(s) per browser across ${escapeHtml(
        formatCount(viewportsCount || 1)
      )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
      ${statusSummary}
      ${
        failThreshold
          ? `<p class="details">Gating threshold: ${escapeHtml(String(failThreshold))}</p>`
          : ''
      }
      ${detailNotes}
      <p class="legend">
        <span class="badge badge-critical">Critical</span>
        <span class="badge badge-serious">Serious</span>
        <span class="badge badge-wcag">WCAG A/AA/AAA</span>
      </p>
    </section>
  `;
};

const renderKeyboardRunSummary = (
  overview = {},
  pages = [],
  references = [],
  { viewportLabel, viewportsCount, failThreshold } = {}
) => {
  const totalPages = overview.totalPagesAudited ?? pages.length;
  const gatingPages =
    overview.pagesWithGatingIssues ??
    pages.filter(
      (page) => (Array.isArray(page.gating) ? page.gating : page.gatingIssues || []).length > 0
    ).length;
  const executionFailurePages =
    overview.pagesWithWarnings ??
    pages.filter((page) => (Array.isArray(page.warnings) ? page.warnings.length : 0) > 0).length;
  const advisoryPages =
    overview.pagesWithAdvisories ??
    pages.filter((page) => (Array.isArray(page.advisories) ? page.advisories.length : 0) > 0)
      .length;
  const skipLinksDetected =
    overview.skipLinksDetected ?? pages.filter((page) => Boolean(page.skipLink)).length;
  const pagesMissingSkip = totalPages > 0 ? Math.max(totalPages - skipLinksDetected, 0) : 0;

  const totalFocusable = pages.reduce(
    (sum, page) => sum + (Number.isFinite(page.focusableCount) ? page.focusableCount : 0),
    0
  );
  const totalVisited = pages.reduce(
    (sum, page) => sum + (Number.isFinite(page.visitedCount) ? page.visitedCount : 0),
    0
  );
  const coveragePercent =
    totalFocusable > 0 ? Math.round((totalVisited / totalFocusable) * 100) : null;

  const totalExecutionFailures = pages.reduce(
    (sum, page) => sum + (Array.isArray(page.warnings) ? page.warnings.length : 0),
    0
  );
  const totalAdvisories = pages.reduce(
    (sum, page) => sum + (Array.isArray(page.advisories) ? page.advisories.length : 0),
    0
  );

  const wcagBadges = Array.isArray(references)
    ? references
        .map(
          (ref) => `<span class="badge badge-wcag">${escapeHtml(`${ref.id} ${ref.name}`)}</span>`
        )
        .join(' ')
    : '';

  const statusItems = [];
  if (gatingPages > 0) {
    statusItems.push({
      label: 'Gating issues',
      tone: 'status-error',
      count: gatingPages,
      suffix: 'page(s)',
    });
  }
  if (executionFailurePages > 0) {
    statusItems.push({
      label: 'Execution failures',
      tone: 'status-error',
      count: executionFailurePages,
      suffix: 'page(s)',
    });
  }
  if (advisoryPages > 0) {
    statusItems.push({
      label: 'Advisories',
      tone: 'status-info',
      count: advisoryPages,
      suffix: 'page(s)',
    });
  }

  const statusSummary =
    renderStatusSummaryList(statusItems, { className: 'status-summary' }) ||
    '<p class="details">No keyboard issues detected across the audited pages.</p>';

  const detailNotes = [];
  if (totalFocusable > 0) {
    detailNotes.push(
      `<p class="details">Visited ${escapeHtml(
        formatCount(totalVisited)
      )} of ${escapeHtml(formatCount(totalFocusable))} focusable elements${
        coveragePercent != null ? ` (~${coveragePercent}% coverage)` : ''
      }.</p>`
    );
  }
  if (pagesMissingSkip > 0) {
    detailNotes.push(
      `<p class="details">Skip links missing on ${escapeHtml(
        formatCount(pagesMissingSkip)
      )} page(s).</p>`
    );
  } else if (skipLinksDetected > 0) {
    detailNotes.push(
      `<p class="details">Skip links detected on ${escapeHtml(
        formatCount(skipLinksDetected)
      )} page(s).</p>`
    );
  }
  if (totalExecutionFailures > 0) {
    detailNotes.push(
      `<p class="details">Execution failures recorded ${escapeHtml(
        formatCount(totalExecutionFailures)
      )} time(s) across ${escapeHtml(formatCount(executionFailurePages))} page(s).</p>`
    );
  }
  if (totalAdvisories > 0) {
    detailNotes.push(
      `<p class="details">Advisories recorded ${escapeHtml(
        formatCount(totalAdvisories)
      )} time(s) across ${escapeHtml(formatCount(advisoryPages))} page(s).</p>`
    );
  }

  const thresholdNote = failThreshold
    ? `<p class="details">Gating threshold: ${escapeHtml(String(failThreshold))}</p>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--run-summary">
      <h3>Keyboard run summary</h3>
      <p>Audited <strong>${escapeHtml(
        formatCount(totalPages)
      )}</strong> page(s) per browser across ${escapeHtml(
        formatCount(viewportsCount || 1)
      )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
      ${statusSummary}
      ${thresholdNote}
      ${detailNotes.join('\n')}
      ${wcagBadges ? `<p class="legend">${wcagBadges}</p>` : ''}
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

      const ruleSnapshots = Array.isArray(runPayload.ruleSnapshots) ? runPayload.ruleSnapshots : [];
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
          { sectionClass: 'summary-a11y--rule-table summary-a11y--rule-table-gating' }
        ),
        renderAccessibilityRuleTable(
          formatRuleHeading('WCAG advisory findings', advisoryRules.length),
          advisoryRules,
          { sectionClass: 'summary-a11y--rule-table summary-a11y--rule-table-advisory' }
        ),
        renderAccessibilityRuleTable(
          formatRuleHeading('Best-practice advisories', bestPracticeRules.length),
          bestPracticeRules,
          {
            headingClass: 'summary-heading-best-practice',
            sectionClass: 'summary-a11y--rule-table summary-a11y--rule-table-best-practice',
          }
        ),
      ]
        .filter(Boolean)
        .join('\n');

      const perPageHtml = renderWcagPerPageSection(details.pages || [], {
        viewportLabel,
        failThreshold: details.failThreshold || overview.failThreshold || metadata.failOn,
      });

      const content = [runSummaryHtml, ruleSections, perPageHtml].filter(Boolean).join('\n');
      if (!content.trim()) return '';

      if (multiBucket) {
        return `
          <section class="schema-group__project-block">
            <header class="schema-group__project"><h3>${escapeHtml(projectLabel)}</h3></header>
            ${content}
          </section>
        `;
      }

      return content;
    })
    .filter(Boolean)
    .join('\n');

  if (!sections.trim()) return '';

  const headline =
    multiBucket && group.title ? `<header><h2>${escapeHtml(group.title)}</h2></header>` : '';
  return `
    <section class="schema-group">
      ${headline}
      ${sections}
    </section>
  `;
};

const firstRunPayload = (bucket) =>
  bucket.runEntries.find((entry) => Boolean(entry?.payload))?.payload || null;

const renderInternalLinksGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    if (!runPayload || !Array.isArray(runPayload.details?.pages)) return '';

    const pagesData = runPayload.details.pages;
    const overview = runPayload.overview || {};
    const metadata = runPayload.metadata || {};
    const projectLabel = metadata.projectName || bucket.projectName || 'Chrome';

    const totalPages = overview.totalPages ?? pagesData.length;
    const brokenLinksDetected = overview.brokenLinksDetected ?? 0;
    const pagesWithBrokenLinks = overview.pagesWithBrokenLinks ?? 0;
    const totalLinksFound =
      overview.totalLinksFound ?? pagesData.reduce((sum, page) => sum + (page.totalLinks || 0), 0);
    const uniqueLinksChecked =
      overview.uniqueLinksChecked ??
      pagesData.reduce((sum, page) => sum + (page.uniqueChecked || 0), 0);
    const maxChecksPerPage = overview.maxChecksPerPage ?? null;

    const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
    const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

    const statusItems = [];
    if (pagesWithBrokenLinks > 0) {
      statusItems.push({
        label: 'Broken links',
        tone: 'status-error',
        count: pagesWithBrokenLinks,
        suffix: 'page(s)',
      });
    }

    const statusSummary =
      statusItems.length > 0
        ? renderStatusSummaryList(statusItems, { className: 'status-summary' })
        : '<p class="details">No broken links detected across the audited pages.</p>';

    const detailNotes = [
      `<p class="details">Total links found: ${escapeHtml(formatCount(totalLinksFound))}</p>`,
      `<p class="details">Unique links checked: ${escapeHtml(formatCount(uniqueLinksChecked))}</p>`,
      `<p class="details">Broken links detected: ${escapeHtml(formatCount(brokenLinksDetected))}</p>`,
      maxChecksPerPage != null
        ? `<p class="details">Max checks per page: ${escapeHtml(formatCount(maxChecksPerPage))}</p>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>Internal link run summary</h3>
        <p>Audited <strong>${escapeHtml(
          formatCount(totalPages)
        )}</strong> page(s) per browser across ${escapeHtml(
          formatCount(viewportList.length || 1)
        )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
        ${statusSummary}
        ${detailNotes}
      </section>
    `;

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

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues: [...warningIssues, ...advisoryIssues],
      gatingTitle: 'Blocking link issues',
      gatingEmptyMessage: 'No blocking link issues detected.',
      advisoryTitle: 'Link advisories',
      advisoryEmptyMessage: 'No advisories detected.',
      viewportLabel,
    });

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

    const perPageHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page findings',
      summaryClass: 'summary-page--internal-links',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) => renderInternalLinksPageCard(entrySummary, { projectLabel }),
      formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
    });

    return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

const renderInteractiveGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    if (!runPayload || !Array.isArray(runPayload.details?.pages)) return '';

    const overview = runPayload.overview || {};
    const pagesData = runPayload.details.pages;
    const metadata = runPayload.metadata || {};
    const projectLabel = metadata.projectName || bucket.projectName || 'Chrome';
    const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
    const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

    const totalPages = overview.totalPages ?? pagesData.length;
    const pagesWithConsoleErrors = overview.pagesWithConsoleErrors ?? 0;
    const pagesWithResourceErrors = overview.pagesWithResourceErrors ?? 0;
    const totalConsoleErrors =
      overview.totalConsoleErrors ??
      pagesData.reduce((sum, page) => sum + (page.consoleErrors || 0), 0);
    const totalResourceErrors =
      overview.totalResourceErrors ??
      pagesData.reduce((sum, page) => sum + (page.resourceErrors || 0), 0);
    const resourceBudget = overview.resourceErrorBudget;
    const budgetExceeded = overview.budgetExceeded;

    const statusItems = [];
    if (pagesWithConsoleErrors > 0) {
      statusItems.push({
        label: 'Console errors',
        tone: 'status-error',
        count: pagesWithConsoleErrors,
        suffix: 'page(s)',
      });
    }
    if (pagesWithResourceErrors > 0) {
      statusItems.push({
        label: 'Resource failures',
        tone: 'status-error',
        count: pagesWithResourceErrors,
        suffix: 'page(s)',
      });
    }

    const statusSummary =
      statusItems.length > 0
        ? renderStatusSummaryList(statusItems, { className: 'status-summary' })
        : '<p class="details">No console or resource errors detected across the audited pages.</p>';

    const detailNotes = [
      `<p class="details">Total console errors: ${escapeHtml(formatCount(totalConsoleErrors))}</p>`,
      `<p class="details">Total resource errors: ${escapeHtml(
        formatCount(totalResourceErrors)
      )}</p>`,
      resourceBudget != null
        ? `<p class="details">Error budget: ${escapeHtml(
            formatCount(resourceBudget)
          )} (${budgetExceeded ? 'exceeded' : 'within budget'})</p>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>Console &amp; API run summary</h3>
        <p>Audited <strong>${escapeHtml(
          formatCount(totalPages)
        )}</strong> page(s) per browser across ${escapeHtml(
          formatCount(viewportList.length || 1)
        )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
        ${statusSummary}
        ${detailNotes}
      </section>
    `;

    const gatingIssues = collectIssueMessages(pagesData, 'gating', 'critical', {
      normalize: normalizeInteractiveMessage,
    }).filter((issue) => issue.pageCount > 0);

    const warningIssues = collectIssueMessages(pagesData, 'warnings', 'moderate', {
      normalize: normalizeInteractiveMessage,
    }).filter((issue) => issue.pageCount > 0);

    const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'minor', {
      normalize: normalizeInteractiveMessage,
    }).filter((issue) => issue.pageCount > 0);

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues: [...warningIssues, ...advisoryIssues],
      gatingTitle: 'Blocking console issues',
      gatingEmptyMessage: 'No console or resource errors detected.',
      advisoryTitle: 'Console advisories',
      advisoryEmptyMessage: 'No advisories detected.',
      viewportLabel,
    });

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

    const perPageHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page findings',
      summaryClass: 'summary-page--interactive',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) => renderInteractivePageCard(entrySummary, { projectLabel }),
      formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
    });

    return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

const renderAvailabilityGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket) || {};
    const metadata = runPayload.metadata || {};
    const projectLabel = metadata.projectName || bucket.projectName || 'default';
    const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
    const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

    const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
    const pageEntryPayloads = (bucket.pageEntries || [])
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);

    const pagesData = (detailPages.length ? detailPages : pageEntryPayloads).map((payload) => {
      if (payload.summary) return payload.summary;
      return payload;
    });

    if (pagesData.length === 0) return '';

    const overview = runPayload.overview || {};
    const totalPages = overview.totalPages ?? pagesData.length;
    const pagesWithGating =
      overview.pagesWithGatingIssues ??
      pagesData.filter((page) => Array.isArray(page.gating) && page.gating.length > 0).length;
    const pagesWithWarnings =
      overview.pagesWithWarnings ??
      pagesData.filter((page) => Array.isArray(page.warnings) && page.warnings.length > 0).length;
    const missingLandmarks =
      overview.missingStructureElements != null
        ? overview.missingStructureElements
        : pagesData.reduce((total, page) => {
            const elements = page.elements || {};
            const missing = Object.values(elements).filter((value) => value === false).length;
            return total + missing;
          }, 0);

    const summaryMetrics = renderSummaryMetrics([
      { label: 'Pages checked', value: totalPages },
      { label: 'Pages with blocking issues', value: pagesWithGating },
      { label: 'Pages with warnings', value: pagesWithWarnings },
      { label: 'Missing structure elements', value: missingLandmarks },
    ]);

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>Availability &amp; uptime summary</h3>
        <p>Audited <strong>${escapeHtml(
          formatCount(totalPages)
        )}</strong> page(s) for required landmarks and metadata across ${escapeHtml(
          formatCount(viewportList.length || 1)
        )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
        ${summaryMetrics}
      </section>
    `;

    const gatingIssues = collectIssueMessages(pagesData, 'gating', 'critical').filter(
      (issue) => issue.pageCount > 0
    );
    const advisoryIssues = collectIssueMessages(pagesData, ['warnings', 'advisories'], 'moderate');

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues,
      gatingTitle: 'Blocking availability issues',
      gatingEmptyMessage: 'No blocking availability issues detected.',
      advisoryTitle: 'Availability advisories',
      advisoryEmptyMessage: 'No advisories detected.',
      viewportLabel,
    });

    const perPageEntries =
      pageEntryPayloads.length > 0
        ? pageEntryPayloads.map((payload) => {
            const summary = payload.summary || {};
            const gating = Array.isArray(summary.gating) ? summary.gating : [];
            const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
            const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
            const summaryClass = gating.length
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
            const summaryClass = gating.length
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

    const perPageHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page availability findings',
      summaryClass: 'summary-page--availability',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) => renderAvailabilityPageCard(entrySummary, { projectLabel }),
      formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
    });

    return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

const renderHttpGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket) || {};
    const metadata = runPayload.metadata || {};
    const projectLabel = metadata.projectName || bucket.projectName || 'default';
    const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
    const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;

    const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
    const pageEntryPayloads = (bucket.pageEntries || [])
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);

    const pagesData = (detailPages.length ? detailPages : pageEntryPayloads).map((payload) => {
      if (payload.summary) return payload.summary;
      return payload;
    });

    if (pagesData.length === 0) return '';

    const overview = runPayload.overview || {};
    const totalPages = overview.totalPages ?? pagesData.length;
    const redirects =
      overview.redirects ?? pagesData.filter((page) => page.redirectLocation).length;
    const errors =
      overview.errors ??
      pagesData.filter((page) => Array.isArray(page.gating) && page.gating.length > 0).length;
    const pagesWithFailedChecks =
      overview.pagesWithFailedChecks ??
      pagesData.filter((page) => Array.isArray(page.failedChecks) && page.failedChecks.length > 0)
        .length;

    const summaryMetrics = renderSummaryMetrics([
      { label: 'Pages validated', value: totalPages },
      { label: 'Redirects', value: redirects },
      { label: 'Blocking HTTP issues', value: errors },
      { label: 'Pages with failed checks', value: pagesWithFailedChecks },
    ]);

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>HTTP response validation summary</h3>
        <p>Validated <strong>${escapeHtml(
          formatCount(totalPages)
        )}</strong> page(s) for status expectations and redirects across ${escapeHtml(
          formatCount(viewportList.length || 1)
        )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
        ${summaryMetrics}
      </section>
    `;

    const normalizeFailedCheck = ({ label, details }) => {
      const message = label ? String(label).trim() : null;
      if (!message) return null;
      return {
        message,
        detail: details ? stripAnsiSequences(details).trim() : null,
      };
    };

    const pagesForIssues = pagesData.map((page) => {
      const failedChecks = Array.isArray(page.failedChecks) ? page.failedChecks : [];
      if (failedChecks.length === 0) return page;
      const normalized = failedChecks
        .map((check) => normalizeFailedCheck(check))
        .filter(Boolean)
        .map((entry) => ({
          message: entry.message,
          detail: entry.detail,
        }));
      return {
        ...page,
        httpFailedChecks: normalized,
      };
    });

    const gatingIssues = collectIssueMessages(
      pagesForIssues.map((page) => ({
        ...page,
        gatingCombined: [
          ...(Array.isArray(page.gating) ? page.gating : []),
          ...(Array.isArray(page.httpFailedChecks)
            ? page.httpFailedChecks.map((item) => ({
                message: item.message,
                detail: item.detail,
              }))
            : []),
        ],
      })),
      'gatingCombined',
      'critical'
    ).filter((issue) => issue.pageCount > 0);

    const advisoryIssues = collectIssueMessages(pagesData, ['warnings', 'advisories'], 'moderate');

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues,
      gatingTitle: 'Blocking HTTP issues',
      gatingEmptyMessage: 'No blocking HTTP issues detected.',
      advisoryTitle: 'HTTP response advisories',
      advisoryEmptyMessage: 'No advisories detected.',
      viewportLabel,
    });

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

    const perPageHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page HTTP findings',
      summaryClass: 'summary-page--http',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) =>
        renderHttpPageCard(entrySummary, { projectLabel, viewportLabel }),
      formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
    });

    return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

const renderPerformanceGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket) || {};
    const metadata = runPayload.metadata || {};
    const projectLabel = metadata.projectName || bucket.projectName || 'default';
    const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
    const pageEntryPayloads = (bucket.pageEntries || [])
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);

    const pagesData = (pageEntryPayloads.length ? pageEntryPayloads : detailPages).map(
      (payload) => {
        if (payload.summary) return payload.summary;
        return payload;
      }
    );

    if (pagesData.length === 0) return '';

    const overview = runPayload.overview || {};
    const totalPages = overview.pagesSampled ?? pagesData.length;
    const averageLoad = overview.averageLoadTimeMs ?? null;
    const breaches =
      overview.budgetBreaches ??
      pagesData.reduce(
        (count, page) =>
          count + (Array.isArray(page.budgetBreaches) ? page.budgetBreaches.length : 0),
        0
      );
    const pagesWithBreaches =
      overview.pagesWithGatingIssues ??
      pagesData.filter((page) => Array.isArray(page.gating) && page.gating.length > 0).length;

    const summaryMetrics = renderSummaryMetrics([
      { label: 'Pages sampled', value: totalPages },
      { label: 'Average load (ms)', value: averageLoad },
      { label: 'Budget breaches', value: breaches },
      { label: 'Pages over budget', value: pagesWithBreaches },
    ]);

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>Performance monitoring summary</h3>
        <p>Collected navigation timings across <strong>${escapeHtml(
          formatCount(totalPages)
        )}</strong> page(s) for ${escapeHtml(projectLabel)}.</p>
        ${summaryMetrics}
      </section>
    `;

    const normalizeBreaches = (page) => {
      const list = Array.isArray(page.budgetBreaches) ? page.budgetBreaches : [];
      return list.map((breach) => ({
        message: `${breach.metric} exceeded budget (${Math.round(breach.value)}ms > ${Math.round(
          breach.budget
        )}ms)`,
      }));
    };

    const pagesForIssues = pagesData.map((page) => ({
      ...page,
      performanceGating: [
        ...(Array.isArray(page.gating) ? page.gating : []),
        ...normalizeBreaches(page),
      ],
    }));

    const gatingIssues = collectIssueMessages(
      pagesForIssues,
      'performanceGating',
      'critical'
    ).filter((issue) => issue.pageCount > 0);
    const advisoryIssues = collectIssueMessages(pagesData, ['warnings', 'advisories'], 'moderate');

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues,
      gatingTitle: 'Blocking performance issues',
      gatingEmptyMessage: 'No performance budget breaches detected.',
      advisoryTitle: 'Performance advisories',
      advisoryEmptyMessage: 'No advisories detected.',
    });

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

    const perPageHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page performance findings',
      summaryClass: 'summary-page--performance',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) => renderPerformancePageCard(entrySummary, { projectLabel }),
      formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
    });

    return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

const renderVisualGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const viewportLabel =
        metadata.viewport ||
        (Array.isArray(metadata.viewports) ? metadata.viewports.join(', ') : null) ||
        metadata.projectName ||
        bucket.projectName ||
        'Visual regression';

      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);

      const pagesData =
        detailPages.length > 0
          ? detailPages
          : pageEntryPayloads.map((payload) => payload.summary || payload);

      if (pagesData.length === 0 && pageEntryPayloads.length === 0) return '';

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
      const totalPages = overview.totalPages ?? perPageEntries.length;
      const diffCount =
        overview.diffs ??
        perPageEntries.filter((entry) => entry._result === 'diff' || entry._result === 'error')
          .length;
      const passesCount =
        overview.passes ?? (Number.isFinite(totalPages) ? totalPages - diffCount : null);
      const thresholdsUsed = Array.isArray(overview.thresholdsUsed) ? overview.thresholdsUsed : [];
      const maxPixelDiff = overview.maxPixelDiff ?? null;
      const maxPixelRatio =
        overview.maxPixelRatio ?? overview.maxDeltaPercent ?? overview.maxDeltaPercentRatio ?? null;

      const runSummaryHtml = `
        <section class="summary-report summary-a11y summary-a11y--run-summary">
          <h3>Visual regression summary (${escapeHtml(viewportLabel)})</h3>
          <p>Captured <strong>${escapeHtml(
            formatCount(totalPages)
          )}</strong> screenshot(s) for ${escapeHtml(viewportLabel)}.</p>
          ${renderSummaryMetrics([
            { label: 'Passing pages', value: passesCount },
            { label: 'Diff pages', value: diffCount },
            {
              label: 'Max pixel diff',
              value: maxPixelDiff != null ? maxPixelDiff.toLocaleString() : '—',
            },
            {
              label: 'Max delta percent',
              value: maxPixelRatio != null ? formatPercentage(maxPixelRatio * 100) : '—',
            },
            {
              label: 'Thresholds used',
              value:
                thresholdsUsed.length > 0
                  ? thresholdsUsed.map((value) => formatPercentage(value * 100)).join(', ')
                  : '—',
            },
          ])}
        </section>
      `;

      const pagesForIssues = perPageEntries.map((entry) => {
        const gatingList = []
          .concat(Array.isArray(entry.gating) ? entry.gating : [])
          .filter(Boolean);
        if (entry.error) gatingList.push(entry.error);
        if (entry._result === 'diff') gatingList.push('Visual diff detected');
        return {
          ...entry,
          visualGating: gatingList,
          visualAdvisories: []
            .concat(Array.isArray(entry.warnings) ? entry.warnings : [])
            .concat(Array.isArray(entry.advisories) ? entry.advisories : []),
        };
      });

      const gatingIssues = collectIssueMessages(pagesForIssues, 'visualGating', 'critical').filter(
        (issue) => issue.pageCount > 0
      );
      const advisoryIssues = collectIssueMessages(pagesForIssues, 'visualAdvisories', 'moderate');

      const issueSections = renderIssueSectionPair({
        gatingIssues,
        advisoryIssues,
        gatingTitle: 'Blocking visual issues',
        gatingEmptyMessage: 'No blocking visual issues detected.',
        advisoryTitle: 'Visual advisories',
        advisoryEmptyMessage: 'No advisories detected.',
        viewportLabel,
      });

      const perPageHtml = renderPerPageAccordion(perPageEntries, {
        heading: 'Per-page visual findings',
        summaryClass: 'summary-page--visual',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) =>
          renderVisualPageCard(entrySummary, {
            viewportLabel,
            thresholdsUsed,
          }),
        formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
      });

      return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  if (sections.length === 0) return '';

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

const renderVisualPageCard = (summary, { viewportLabel, thresholdsUsed = [] } = {}) => {
  if (!summary) return '';

  const result = (summary.result || '').toLowerCase();
  const gating = [].concat(Array.isArray(summary.gating) ? summary.gating : []).filter(Boolean);
  if (summary.error) gating.push(summary.error);
  if (result === 'diff') gating.push('Visual diff detected');

  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const statusMeta =
    gating.length > 0 || result === 'diff' || result === 'error'
      ? { className: 'status-error', label: result === 'error' ? 'Error' : 'Diff detected' }
      : warnings.length > 0
        ? { className: 'status-warning', label: 'Warnings present' }
        : advisories.length > 0
          ? { className: 'status-info', label: 'Advisories present' }
          : { className: 'status-ok', label: 'Pass' };

  const resolvePercent = (value) => {
    if (!Number.isFinite(value)) return null;
    const normalized = Math.abs(value) <= 1 ? value * 100 : value;
    return formatPercentage(normalized);
  };

  const metrics = renderSummaryMetrics(
    [
      { label: 'Viewport', value: summary.viewport || viewportLabel || 'Not recorded' },
      { label: 'Result', value: result ? result.toUpperCase() : 'UNKNOWN' },
      {
        label: 'Pixel diff',
        value: summary.pixelDiff != null ? summary.pixelDiff.toLocaleString() : '—',
      },
      {
        label: 'Pixel ratio',
        value:
          summary.pixelRatio != null
            ? formatPercentage(
                Math.abs(summary.pixelRatio) <= 1 ? summary.pixelRatio * 100 : summary.pixelRatio
              )
            : '—',
      },
      { label: 'Delta percent', value: resolvePercent(summary.deltaPercent) || '—' },
      {
        label: 'Threshold percent',
        value: resolvePercent(summary.thresholdPercent) || '—',
      },
      {
        label: 'Run thresholds',
        value:
          thresholdsUsed.length > 0
            ? thresholdsUsed
                .map((value) => formatPercentage(Math.abs(value) <= 1 ? value * 100 : value))
                .join(', ')
            : '—',
      },
    ].filter(Boolean)
  );

  const aggregateMessages = (items, impact) => {
    const map = new Map();
    items.forEach((raw) => {
      if (!raw) return;
      const message = String(raw).replace(/\s+/g, ' ').trim();
      if (!message) return;
      if (!map.has(message)) map.set(message, { impact, message, count: 0 });
      map.get(message).count += 1;
    });
    return Array.from(map.values());
  };

  const gatingEntries = aggregateMessages(gating, 'critical');
  const warningEntries = aggregateMessages(warnings, 'moderate');
  const advisoryEntries = aggregateMessages(advisories, 'minor');

  const renderEntriesTable = (entries, heading, options = {}) =>
    entries.length
      ? renderWcagPageIssueTable(
          entries.map((entry) => ({
            impact: entry.impact,
            id: entry.message,
            nodesCount: entry.count,
          })),
          heading,
          options
        )
      : '';

  const gatingSection =
    renderEntriesTable(
      gatingEntries,
      formatUniqueRulesHeading('Blocking visual issues', gatingEntries.length)
    ) || '<p class="details">No blocking visual issues detected.</p>';

  const warningSection =
    renderEntriesTable(warningEntries, `Visual warnings (${formatCount(warningEntries.length)})`) ||
    (warnings.length > 0 ? '' : '<p class="details">No visual warnings recorded.</p>');

  const advisorySection =
    renderEntriesTable(
      advisoryEntries,
      formatUniqueRulesHeading('Visual advisories', advisoryEntries.length),
      { headingClass: 'summary-heading-best-practice' }
    ) || '';

  const artifactLinks = summary.artifacts || {};
  const artifactItems = ['baseline', 'actual', 'diff']
    .map((key) => {
      if (!artifactLinks[key]) return null;
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      return `<li><a href="attachment://${escapeHtml(artifactLinks[key])}">${label}</a></li>`;
    })
    .filter(Boolean);
  const artifactsHtml = artifactItems.length
    ? `<details><summary>Artifacts (${artifactItems.length})</summary><ul class="details">${artifactItems.join('')}</ul></details>`
    : '';

  const notesHtml = notes.length
    ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const screenshotHtml = summary.screenshot
    ? `<p class="details">Screenshot: <code>${escapeHtml(summary.screenshot)}</code></p>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${metrics}
      ${screenshotHtml}
      ${artifactsHtml}
      ${notesHtml}
      ${gatingSection}
      ${warningSection}
      ${advisorySection}
    </section>
  `;
};

const renderSchemaGroupFallbackHtml = (group) => {
  const headline = group.title || humaniseKey(group.baseName);
  const runEntries = (group.runEntries || []).slice().sort((a, b) => {
    const scopeOrder = { run: 0, project: 1 };
    const left = scopeOrder[a.payload?.metadata?.scope] ?? 2;
    const right = scopeOrder[b.payload?.metadata?.scope] ?? 2;
    return left - right;
  });
  const runHtml = runEntries.map(renderSchemaRunEntry).join('');
  const pageHtml = group.suppressPageEntries
    ? ''
    : renderSchemaPageEntries(group.pageEntries || []);
  const body = [runHtml, pageHtml].filter(Boolean).join('');
  if (!body) return '';
  return `
    <article class="schema-group">
      <header><h2>${escapeHtml(headline)}</h2></header>
      ${body}
    </article>
  `;
};

const formatSchemaValueMarkdown = (value) => {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    const simple = value.every(
      (item) => item == null || ['string', 'number', 'boolean'].includes(typeof item)
    );
    if (simple) {
      return value.map((item) => (item == null ? '—' : formatSchemaValueMarkdown(item))).join(', ');
    }
    return value.map((item) => formatSchemaValueMarkdown(item)).join('; ');
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .map(([key, val]) => `${humaniseKey(key)}: ${formatSchemaValueMarkdown(val)}`)
      .join('; ');
  }
  return String(value);
};

const renderSchemaMetricsMarkdown = (data) => {
  if (!isPlainObject(data) || Object.keys(data).length === 0) return '';
  const lines = Object.entries(data).map(
    ([key, value]) => `- **${humaniseKey(key)}**: ${formatSchemaValueMarkdown(value)}`
  );
  return lines.join('\n');
};

const renderRuleSnapshotsMarkdown = (snapshots) => {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return '';
  const header = '| Impact | Rule | Pages | Nodes | Viewports | WCAG |';
  const separator = '| --- | --- | --- | --- | --- | --- |';
  const rows = snapshots.map((snapshot) => {
    const impact = snapshot.impact || snapshot.category || 'info';
    const rule = snapshot.rule || 'rule';
    const pages =
      Array.isArray(snapshot.pages) && snapshot.pages.length > 0 ? snapshot.pages.join(', ') : '—';
    const nodes = snapshot.nodes != null ? String(snapshot.nodes) : '—';
    const viewports =
      Array.isArray(snapshot.viewports) && snapshot.viewports.length > 0
        ? snapshot.viewports.join(', ')
        : '—';
    const wcagTags =
      Array.isArray(snapshot.wcagTags) && snapshot.wcagTags.length > 0
        ? snapshot.wcagTags.join(', ')
        : '—';
    return `| ${impact} | ${rule} | ${pages} | ${nodes} | ${viewports} | ${wcagTags} |`;
  });
  return [header, separator, ...rows].join('\n');
};

const renderInternalLinksGroupMarkdown = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const pages = bucket.pageEntries
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);
    const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
    const heading = `${group.title || 'Internal link audit summary'} – ${projectLabel}`;
    const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

    const header = '| Page | Links found | Checked | Broken |';
    const separator = '| --- | --- | --- | --- |';
    const rows = pages.map((payload) => {
      const summary = payload.summary || {};
      return `| \`${payload.page || 'unknown'}\` | ${summary.totalLinks ?? '—'} | ${summary.uniqueChecked ?? '—'} | ${summary.brokenCount ?? 0} |`;
    });

    const brokenRows = [];
    pages.forEach((payload) => {
      const summary = payload.summary || {};
      (summary.brokenSample || []).forEach((issue) => {
        brokenRows.push(
          `| \`${payload.page || 'unknown'}\` | ${issue.url || ''} | ${issue.status != null ? issue.status : issue.error || 'error'} | ${issue.methodTried || 'HEAD'} |`
        );
      });
    });

    const brokenSection = brokenRows.length
      ? [
          '## Broken links',
          '',
          '| Source page | URL | Status / Error | Method |',
          '| --- | --- | --- | --- |',
          ...brokenRows,
        ].join('\n')
      : '## Broken links\n\nNone 🎉';

    const parts = [`## ${heading}`];
    if (overview) parts.push(overview);
    parts.push('', header, separator, ...rows);
    parts.push('', brokenSection);
    return parts.join('\n');
  });

  return sections.join('\n\n');
};

const renderInteractiveGroupMarkdown = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const pages = bucket.pageEntries
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);
    const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
    const heading = `${group.title || 'Interactive smoke summary'} – ${projectLabel}`;
    const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';
    const budget = runPayload?.overview?.resourceErrorBudget;

    const header = '| Page | Status | Console | Resources | Notes |';
    const separator = '| --- | --- | --- | --- | --- |';
    const rows = pages.map((payload) => {
      const summary = payload.summary || {};
      const consoleOutput = (summary.consoleSample || [])
        .map((entry) => `⚠️ ${entry.message || entry}`)
        .join('<br />');
      const consoleCell = summary.consoleErrors
        ? consoleOutput || 'See captured sample'
        : '✅ None';
      const resourceOutput = (summary.resourceSample || [])
        .map((entry) => {
          const base =
            entry.type === 'requestfailed'
              ? `requestfailed ${entry.url} (${entry.failure || 'unknown'})`
              : `${entry.type} ${entry.status || ''} ${entry.method || ''} ${entry.url}`;
          return `⚠️ ${base.trim()}`;
        })
        .join('<br />');
      const resourceCell = summary.resourceErrors
        ? resourceOutput || 'See captured sample'
        : '✅ None';
      const noteItems = [];
      (summary.warnings || []).forEach((message) => noteItems.push(`⚠️ ${message}`));
      (summary.info || []).forEach((message) => noteItems.push(`ℹ️ ${message}`));
      const notesCell = noteItems.length ? noteItems.join('<br />') : '—';
      const statusLabel = summary.status == null ? 'n/a' : summary.status;
      return `| \`${payload.page || 'unknown'}\` | ${statusLabel} | ${consoleCell || '—'} | ${resourceCell || '—'} | ${notesCell} |`;
    });

    const parts = [`## ${heading}`];
    if (overview) parts.push(overview);
    if (budget != null) parts.push('', `Resource error budget: **${budget}**`);
    parts.push('', header, separator, ...rows);
    return parts.join('\n');
  });

  return sections.join('\n\n');
};

const renderAvailabilityGroupMarkdown = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const detailPages = Array.isArray(runPayload?.details?.pages)
      ? runPayload.details.pages.map((page) => ({
          payload: {
            page: page.page,
            summary: page,
          },
        }))
      : null;
    const pages = (detailPages || bucket.pageEntries)
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);
    const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
    const heading = `${group.title || 'Availability & uptime summary'} – ${projectLabel}`;
    const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

    const header = '| Page | Status | Warnings | Info |';
    const separator = '| --- | --- | --- | --- |';
    const rows = pages.map((payload) => {
      const summary = payload.summary || {};
      const warnings =
        (summary.warnings || []).map((message) => `⚠️ ${message}`).join('<br />') || 'None';
      const info = (summary.info || []).map((message) => `ℹ️ ${message}`).join('<br />') || 'None';
      const statusLabel = summary.status == null ? 'n/a' : summary.status;
      const hasStructureGap = Object.values(summary.elements || {}).some(
        (value) => value === false
      );
      const severity = hasStructureGap || (summary.warnings || []).length ? '⚠️' : '✅';
      return `| \`${payload.page || 'unknown'}\` | ${severity} ${statusLabel} | ${warnings} | ${info} |`;
    });

    const parts = [`## ${heading}`];
    if (overview) parts.push(overview);
    parts.push('', header, separator, ...rows);
    return parts.join('\n');
  });

  return sections.join('\n\n');
};

const renderHttpGroupMarkdown = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const detailPages = Array.isArray(runPayload?.details?.pages)
      ? runPayload.details.pages.map((page) => ({
          payload: {
            page: page.page,
            summary: page,
          },
        }))
      : null;
    const pages = (detailPages || bucket.pageEntries)
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY || payload.summary);
    const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
    const heading = `${group.title || 'HTTP response validation summary'} – ${projectLabel}`;
    const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

    const header = '| Page | Status | Redirect | Failed checks |';
    const separator = '| --- | --- | --- | --- |';
    const rows = pages.map((payload) => {
      const summary = payload.summary || {};
      const failedChecks =
        (summary.failedChecks || [])
          .map(
            (check) =>
              `⚠️ ${check.label || 'Check failed'}${check.details ? ` — ${check.details}` : ''}`
          )
          .join('<br />') || 'None';
      const statusLabel = summary.status == null ? 'n/a' : summary.status;
      const redirect = summary.redirectLocation || '—';
      const severity = (summary.failedChecks || []).length ? '⚠️' : '✅';
      return `| \`${payload.page || 'unknown'}\` | ${severity} ${statusLabel} | ${redirect} | ${failedChecks} |`;
    });

    const parts = [`## ${heading}`];
    if (overview) parts.push(overview);
    parts.push('', header, separator, ...rows);
    return parts.join('\n');
  });

  return sections.join('\n\n');
};

const renderPerformanceGroupMarkdown = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const pages = bucket.pageEntries
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);
    const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
    const heading = `${group.title || 'Performance monitoring summary'} – ${projectLabel}`;
    const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

    const header = '| Page | Load (ms) | DOM Loaded | Load complete | FCP | FP | Breaches |';
    const separator = '| --- | --- | --- | --- | --- | --- | --- |';
    const rows = pages.map((payload) => {
      const summary = payload.summary || {};
      const breaches =
        (summary.budgetBreaches || [])
          .map(
            (breach) =>
              `${breach.metric}: ${Math.round(breach.value)}ms (budget ${Math.round(breach.budget)}ms)`
          )
          .join('<br />') || 'None';
      return `| \`${payload.page || 'unknown'}\` | ${summary.loadTimeMs != null ? Math.round(summary.loadTimeMs) : '—'} | ${summary.domContentLoadedMs != null ? Math.round(summary.domContentLoadedMs) : '—'} | ${summary.loadCompleteMs != null ? Math.round(summary.loadCompleteMs) : '—'} | ${summary.firstContentfulPaintMs != null ? Math.round(summary.firstContentfulPaintMs) : '—'} | ${summary.firstPaintMs != null ? Math.round(summary.firstPaintMs) : '—'} | ${breaches} |`;
    });

    const parts = [`## ${heading}`];
    if (overview) parts.push(overview);
    parts.push('', header, separator, ...rows);
    return parts.join('\n');
  });

  return sections.join('\n\n');
};

const renderVisualGroupMarkdown = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    const pages = bucket.pageEntries
      .map((entry) => entry.payload || {})
      .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);
    const projectLabel = runPayload?.metadata?.projectName || bucket.projectName || 'default';
    const heading = `${group.title || 'Visual regression summary'} – ${projectLabel}`;
    const overview = runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '';

    const header = '| Page | Screenshot | Threshold | Result | Details |';
    const separator = '| --- | --- | --- | --- | --- |';
    const rows = pages.map((payload) => {
      const summary = payload.summary || {};
      const result = (summary.result || '').toLowerCase();
      const diffDetails = [];
      if (summary.pixelDiff != null)
        diffDetails.push(`Pixel diff: ${summary.pixelDiff.toLocaleString()}`);
      if (summary.pixelRatio != null)
        diffDetails.push(`Diff ratio: ${(summary.pixelRatio * 100).toFixed(2)}%`);
      if (summary.expectedSize && summary.actualSize) {
        diffDetails.push(
          `Expected ${summary.expectedSize.width}×${summary.expectedSize.height}px, got ${summary.actualSize.width}×${summary.actualSize.height}px`
        );
      }
      if (summary.error) diffDetails.push(summary.error);
      const detailsCell = diffDetails.length ? diffDetails.join('<br />') : 'Matched baseline';
      const resultCell = result === 'diff' ? '⚠️ Diff detected' : '✅ Matched';
      return `| \`${payload.page || 'unknown'}\` | ${summary.screenshot || '—'} | ${summary.threshold != null ? summary.threshold : '—'} | ${resultCell} | ${detailsCell} |`;
    });

    const parts = [`## ${heading}`];
    if (overview) parts.push(overview);
    parts.push('', header, separator, ...rows);
    return parts.join('\n');
  });

  return sections.join('\n\n');
};

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
      const issuesCell = issues.length ? issues.map((i) => `⚠️ ${i}`).join('<br />') : 'None';
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

const renderSchemaRunEntryMarkdown = (entry) => {
  const payload = entry.payload || {};
  const metadata = payload.metadata || {};
  const labelParts = [];
  if (metadata.scope) labelParts.push(metadata.scope);
  if (metadata.projectName) labelParts.push(metadata.projectName);
  if (Array.isArray(metadata.viewports) && metadata.viewports.length > 0) {
    labelParts.push(metadata.viewports.join(', '));
  }
  const headingLabel = labelParts.length > 0 ? labelParts.join(' • ') : 'summary';
  const heading = `### Run Summary – ${headingLabel}`;
  const overview = payload.overview ? renderSchemaMetricsMarkdown(payload.overview) : '';
  const rules = renderRuleSnapshotsMarkdown(payload.ruleSnapshots);
  const sections = [overview, rules].filter(Boolean).join('\n\n');
  return `${heading}\n\n${sections || '_No overview metrics provided._'}`;
};

const renderSchemaPageEntriesMarkdownFallback = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  const lines = entries.map((entry) => {
    const payload = entry.payload || {};
    const page = payload.page || 'Unknown page';
    const viewport = payload.viewport || entry.projectName || 'default';
    const summary =
      payload.summary && Object.keys(payload.summary).length > 0
        ? formatSchemaValueMarkdown(payload.summary)
        : 'No summary data';
    return `- **${page} – ${viewport}**: ${summary}`;
  });
  return lines.join('\n');
};

const renderSchemaGroupFallbackMarkdown = (group) => {
  const headline = group.title || humaniseKey(group.baseName);
  const runMarkdown = (group.runEntries || []).map(renderSchemaRunEntryMarkdown).join('\n\n');
  const pageMarkdown = renderSchemaPageEntriesMarkdownFallback(group.pageEntries || []);
  const sections = [`## ${headline}`];
  if (runMarkdown) sections.push(runMarkdown);
  if (pageMarkdown) sections.push('### Page Summaries', pageMarkdown);
  return sections.join('\n\n');
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
      const overview =
        runPayload?.markdownBody ||
        (runPayload?.overview ? renderSchemaMetricsMarkdown(runPayload.overview) : '');

      const pageSections = pages.map((payload) => {
        const summary = payload.summary || {};
        if (summary.cardMarkdown) return summary.cardMarkdown;

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

const SCHEMA_MARKDOWN_RENDERERS = {
  'internal-links': renderInternalLinksGroupMarkdown,
  interactive: renderInteractiveGroupMarkdown,
  availability: renderAvailabilityGroupMarkdown,
  http: renderHttpGroupMarkdown,
  performance: renderPerformanceGroupMarkdown,
  visual: renderVisualGroupMarkdown,
  wcag: renderAccessibilityGroupMarkdown,
  'responsive-structure': renderResponsiveStructureGroupMarkdown,
  'wp-features': renderResponsiveWpGroupMarkdown,
};

const renderSchemaGroupMarkdown = (group) => {
  const summaryType = summaryTypeFromGroup(group);
  if (summaryType && SCHEMA_MARKDOWN_RENDERERS[summaryType]) {
    return SCHEMA_MARKDOWN_RENDERERS[summaryType](group);
  }
  return renderSchemaGroupFallbackMarkdown(group);
};

const renderSchemaSummariesMarkdown = (records = []) => {
  if (!Array.isArray(records) || records.length === 0) {
    return { markdown: '', promotedBaseNames: new Set() };
  }

  const groups = buildSchemaGroups(records).filter(
    (group) => group.runEntries.length > 0 || group.pageEntries.length > 0
  );

  if (groups.length === 0) {
    return { markdown: '', promotedBaseNames: new Set() };
  }

  const promotedBaseNames = new Set();
  const sections = groups
    .map((group) => {
      if ((group.runEntries || []).length > 0) {
        promotedBaseNames.add(group.baseName);
      }
      return renderSchemaGroupMarkdown(group);
    })
    .filter(Boolean);

  const markdown = sections.join('\n\n');
  return { markdown, promotedBaseNames };
};

const renderRunSummariesMarkdown = (summaries = []) => {
  if (!Array.isArray(summaries) || summaries.length === 0) return '';
  const sections = summaries
    .map((summary) => {
      const title = summary.title || summary.baseName || 'Summary';
      const body = summary.markdown || '_No markdown body provided._';
      return `## ${title}\n\n${body.trim()}`;
    })
    .filter(Boolean);
  return sections.join('\n\n');
};

const STATUS_LABELS = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  timedOut: 'Timed Out',
  interrupted: 'Interrupted',
  flaky: 'Flaky',
  unknown: 'Unknown',
};

const STATUS_ORDER = ['failed', 'timedOut', 'interrupted', 'passed', 'flaky', 'skipped', 'unknown'];

const renderStatusFilters = (statusCounts) => {
  const buttons = STATUS_ORDER.filter((status) => statusCounts[status] > 0).map((status) => {
    const label = STATUS_LABELS[status] || status;
    const count = statusCounts[status] ?? 0;
    return `
      <label class="filter-chip status-${status}">
        <input type="checkbox" name="status" value="${status}" checked />
        <span>${escapeHtml(label)} <span class="filter-count">${count}</span></span>
      </label>
    `;
  });

  return `
    <div class="filters">
      <div class="status-filters" role="group" aria-label="Filter by status">
        ${buttons.join('\n')}
      </div>
      <div class="search-filter">
        <label for="report-search" class="visually-hidden">Filter tests</label>
        <input id="report-search" type="search" placeholder="Filter by test name, project, tags, or text" />
      </div>
    </div>
  `;
};

const renderRunSummaries = (summaries) => {
  if (!Array.isArray(summaries) || summaries.length === 0) return '';

  const items = summaries.map((summary) => {
    const hasHtml = Boolean(summary.html);
    const body = hasHtml
      ? summary.html
      : summary.markdown
        ? `<pre class="run-summary__markdown">${escapeHtml(summary.markdown)}</pre>`
        : '<p>No summary data available.</p>';

    const friendlyTitle = escapeHtml(summary.title || summary.baseName || 'Summary');
    let meta = '';
    if (summary.source?.testTitle) {
      const anchorId = summary.source.anchorId ? `#${escapeHtml(summary.source.anchorId)}` : null;
      const label = escapeHtml(summary.source.testTitle);
      meta = anchorId
        ? `<div class="run-summary-card__meta">Source: <a href="${anchorId}">${label}</a></div>`
        : `<div class="run-summary-card__meta">Source: ${label}</div>`;
    }

    const heading = hasHtml
      ? `<div class="run-summary-card__title">${friendlyTitle}</div>`
      : `<header><h2>${friendlyTitle}</h2></header>`;

    return `
      <article class="run-summary-card">
        ${heading}
        ${meta}
        <div class="run-summary-card__body">${body}</div>
      </article>
    `;
  });

  return `
    <section class="run-summaries" aria-label="Run-level summaries">
      ${items.join('\n')}
    </section>
  `;
};

const buildSuitePanels = (schemaGroups, summaryMap) => {
  const groupsByType = new Map();
  schemaGroups.forEach((group) => {
    const type = summaryTypeFromGroup(group);
    if (!type) return;
    if (!groupsByType.has(type)) groupsByType.set(type, []);
    groupsByType.get(type).push(group);
  });

  const baseNamesUsed = new Set();
  const panels = [];

  for (const definition of SUITE_PANEL_DEFINITIONS) {
    const groups = groupsByType.get(definition.summaryType);
    if (!groups || groups.length === 0) continue;

    const specNames = new Set();
    const filteredGroups =
      definition.summaryType === 'wcag'
        ? groups.filter((group) => {
            const runEntries = group.runEntries || [];
            if (runEntries.length === 0) return false;
            return runEntries.some((entry) => (entry.payload?.metadata?.scope || '') !== 'run');
          })
        : ['structure', 'internal-links', 'interactive'].includes(definition.summaryType)
          ? groups.filter((group) => (group.runEntries || []).length > 0)
          : groups;

    if (filteredGroups.length === 0) continue;

    const groupHtml = filteredGroups
      .map((group) => {
        if (group?.baseName) baseNamesUsed.add(group.baseName);
        (group.runEntries || []).forEach((entry) => {
          const specId = entry.payload?.metadata?.spec;
          if (specId) {
            specNames.add(`${specId}.spec.js`);
          }
        });
        return renderSchemaGroup(group);
      })
      .join('\n');

    if (!groupHtml.trim()) continue;

    const summaryPayload = summaryMap.get(definition.summaryType);
    if (summaryPayload?.metadata?.spec) {
      specNames.add(`${summaryPayload.metadata.spec}.spec.js`);
    }
    const metrics = summaryPayload ? deriveSuiteMetrics([summaryPayload]) : null;
    const status = panelStatusFromMetrics(metrics);
    const statusMeta = PANEL_STATUS_META[status] || PANEL_STATUS_META.info;
    const specList = Array.from(specNames).sort();
    const specLabelSuffix = specList.length ? ` - ${specList.join(', ')}` : '';
    const specLabel = `${definition.specLabel}${specLabelSuffix}`;

    panels.push({
      id: definition.id,
      navGroup: definition.navGroup,
      label: definition.navLabel,
      specLabel,
      title: definition.title,
      description: definition.description,
      status,
      statusMeta,
      content: `
        <header class="panel-header">
          <div class="panel-info">
            <span class="spec-label">${escapeHtml(specLabel)}</span>
            <h2>${escapeHtml(definition.title)}</h2>
            ${
              definition.description
                ? `<p class="panel-description">${escapeHtml(definition.description)}</p>`
                : ''
            }
          </div>
          <span class="spec-status ${statusMeta.specClass}">${escapeHtml(statusMeta.label)}</span>
        </header>
        <div class="panel-body">
          ${groupHtml}
        </div>
      `,
    });
  }

  return { panels, baseNamesUsed };
};

const buildPanelToggleStyles = (panels) =>
  panels
    .map((panel) => {
      const highlight = (() => {
        switch (panel.status) {
          case 'fail':
            return `  background: var(--nav-card-fail-hover-bg);\n  color: var(--nav-status-fail-text);`;
          case 'pass':
            return `  background: var(--nav-card-pass-hover-bg);\n  color: var(--nav-status-pass-text);`;
          case 'warn':
            return `  background: var(--nav-card-info-hover-bg);\n  color: var(--nav-status-info-text);`;
          case 'info':
          default:
            return '';
        }
      })();

      const highlightBlock = highlight ? `${highlight}\n` : '';

      return `
#view-${panel.id}:checked ~ .report-shell .report-content [data-view="view-${panel.id}"] {
  display: grid;
}
#view-${panel.id}:checked ~ .report-shell .sidebar label[for="view-${panel.id}"] {
  box-shadow:
    0 0 0 2px rgba(37, 99, 235, 0.18),
    0 12px 28px rgba(30, 64, 175, 0.18);
  outline: 1px solid rgba(37, 99, 235, 0.25);
  outline-offset: -1px;
  transform: none;
${highlightBlock}}
`;
    })
    .join('\n');

const renderSidebar = (panels, run, summaryMap) => {
  const siteName = (() => {
    if (run?.site?.name) return run.site.name;
    if (run?.site?.baseUrl) return run.site.baseUrl;
    if (run?.title) return run.title;
    return 'Playwright Test Run';
  })();

  const pagesTested = resolvePagesTested(summaryMap);

  const metadataItems = [
    run?.runId ? { label: 'Run ID', value: run.runId } : null,
    run?.durationFriendly ? { label: 'Duration', value: run.durationFriendly } : null,
    pagesTested != null ? { label: 'Pages tested', value: formatCount(pagesTested) } : null,
  ].filter(Boolean);

  const metadataHtml = metadataItems
    .map(
      (item) => `
        <div>
          <dt>${escapeHtml(item.label)}</dt>
          <dd>${escapeHtml(item.value)}</dd>
        </div>
      `
    )
    .join('\n');

  const groups = new Map();
  const order = [];
  panels.forEach((panel) => {
    const key = panel.navGroup || '__summary__';
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(panel);
  });

  const navSections = order
    .map((key) => {
      const entries = groups.get(key);
      const heading = key === '__summary__' ? '' : `<p class="group-title">${escapeHtml(key)}</p>`;
      const items = entries
        .map((panel) => {
          const statusMeta =
            panel.statusMeta || PANEL_STATUS_META[panel.status] || PANEL_STATUS_META.info;
          const navItemClasses = ['nav-item'];
          const navStatusClasses = ['nav-status'];
          if (statusMeta.navClass) {
            navItemClasses.push(statusMeta.navClass);
            navStatusClasses.push(statusMeta.navClass);
          }
          return `
            <label class="${escapeHtml(navItemClasses.join(' '))}" for="view-${panel.id}">
              <span class="nav-item__header">
                <span class="nav-name">${escapeHtml(panel.label)}</span>
                <span class="${escapeHtml(navStatusClasses.join(' '))}">${escapeHtml(
                  statusMeta.label
                )}</span>
              </span>
            </label>
          `;
        })
        .join('\n');
      return `<div class="sidebar-group">${heading}${items}</div>`;
    })
    .join('\n');

  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>${escapeHtml(siteName)}</h1>
        ${metadataHtml ? `<dl class="metadata">${metadataHtml}</dl>` : ''}
      </div>
      <nav class="sidebar-nav">
        ${navSections}
      </nav>
    </aside>
  `;
};

const renderFormsPageCard = (summary, { projectLabel } = {}) => {
  if (!summary) return '';

  const formName = summary.formName || 'Form';
  const pageLabel = summary.page || projectLabel || 'Unknown page';
  const selector = summary.selectorUsed || summary.selector || 'Not recorded';
  const fields = Array.isArray(summary.fields) ? summary.fields : [];

  const gating = []
    .concat(
      Array.isArray(summary.gatingIssues) ? summary.gatingIssues : [],
      Array.isArray(summary.gating) ? summary.gating : []
    )
    .filter(Boolean);
  const warnings = Array.isArray(summary.warnings) ? summary.warnings.filter(Boolean) : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories.filter(Boolean) : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const requiredFields = fields.filter((field) => field && field.required).length;

  const hasGating = gating.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAdvisories = advisories.length > 0;

  let statusMeta = { className: 'status-ok', label: 'Pass' };
  if (hasGating) {
    statusMeta = {
      className: 'status-error',
      label: `${formatCount(gating.length)} blocking issue(s)`,
    };
  } else if (hasWarnings) {
    statusMeta = { className: 'status-warning', label: 'Warnings present' };
  } else if (hasAdvisories) {
    statusMeta = { className: 'status-info', label: 'Advisories present' };
  }

  const metrics = renderSummaryMetrics([
    { label: 'Page', value: pageLabel },
    { label: 'Selector', value: selector },
    { label: 'Fields audited', value: formatCount(fields.length) },
    { label: 'Required fields', value: formatCount(requiredFields) },
  ]);

  const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
  const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
  const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

  const gatingSection =
    gatingEntries.length > 0
      ? renderWcagPageIssueTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking issues', gatingEntries.length)
        )
      : '<p class="details">No blocking issues detected for this form.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderWcagPageIssueTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderWcagPageIssueTable(
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

  const fieldsHtml = fields.length
    ? `<details><summary>Fields (${fields.length})</summary><div class="summary-fields">${fields
        .map((field, index) => {
          if (!field || typeof field !== 'object') return '';
          const fieldName = field.name || `Field ${index + 1}`;
          const accessible = field.accessibleName || 'No accessible name';
          const requiredLabel = field.required ? 'Yes' : 'No';
          const fieldIssues = Array.isArray(field.issues) ? field.issues.filter(Boolean) : [];
          const issuesHtml = fieldIssues.length
            ? `<ul class="details">${fieldIssues
                .map((issue) => `<li>${escapeHtml(String(issue))}</li>`)
                .join('')}</ul>`
            : '<p class="details">No issues detected.</p>';
          return `
            <details>
              <summary><code>${escapeHtml(fieldName)}</code> — ${escapeHtml(accessible)}</summary>
              <p class="details">Required: ${requiredLabel}</p>
              ${issuesHtml}
            </details>
          `;
        })
        .filter(Boolean)
        .join('')}</div></details>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(formName)}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${metrics}
      ${notesHtml}
      ${gatingSection}
      ${warningSection}
      ${advisorySection}
      ${fieldsHtml}
    </section>
  `;
};

const renderInternalLinksPageCard = (summary, { projectLabel } = {}) => {
  if (!summary) return '';

  const gating = Array.isArray(summary.gating) ? summary.gating : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const brokenSample = Array.isArray(summary.brokenSample) ? summary.brokenSample : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const hasGating = gating.length > 0 || brokenSample.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAdvisories = advisories.length > 0;
  const statusMeta = hasGating
    ? {
        className: 'status-error',
        label: `${formatCount(summary.brokenCount ?? gating.length)} broken link(s)`,
      }
    : hasWarnings
      ? { className: 'status-warning', label: 'Needs attention' }
      : hasAdvisories
        ? { className: 'status-info', label: 'Advisories present' }
        : { className: 'status-ok', label: 'Pass' };

  const aggregateMessages = (items, impact) => {
    const map = new Map();
    items.forEach((raw) => {
      if (!raw) return;
      const message = String(raw).replace(/\s+/g, ' ').trim();
      if (!message) return;
      if (!map.has(message)) map.set(message, { message, impact, count: 0 });
      map.get(message).count += 1;
    });
    return Array.from(map.values());
  };

  const gatingEntries = aggregateMessages(gating, 'critical');
  const warningEntries = aggregateMessages(warnings, 'moderate');
  const advisoryEntries = aggregateMessages(advisories, 'minor');

  const renderEntriesTable = (entries, heading, options = {}) =>
    entries.length
      ? renderWcagPageIssueTable(
          entries.map((entry) => ({
            impact: entry.impact,
            id: entry.message,
            nodesCount: entry.count,
          })),
          heading,
          options
        )
      : '';

  const metaLines = [
    `<p class="details"><strong>Viewport:</strong> ${escapeHtml(projectLabel || 'Not recorded')}</p>`,
    `<p class="details"><strong>Links found:</strong> ${escapeHtml(
      formatCount(summary.totalLinks ?? 'n/a')
    )}</p>`,
    `<p class="details"><strong>Unique checked:</strong> ${escapeHtml(
      formatCount(summary.uniqueChecked ?? 'n/a')
    )}</p>`,
    `<p class="details"><strong>Broken links:</strong> ${escapeHtml(
      formatCount(summary.brokenCount ?? 0)
    )}</p>`,
  ].join('\n');

  const notesHtml = notes.length
    ? `<details class="summary-note"><summary>Notes (${notes.length})</summary><ul class="details">${notes
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const brokenSamplesHtml = brokenSample.length
    ? `<details><summary>Broken link samples (${brokenSample.length})</summary><ul class="details">${brokenSample
        .map((item) => {
          const statusLabel =
            item.status != null ? `Status ${item.status}` : escapeHtml(item.error || 'Error');
          const method = item.methodTried ? `via ${item.methodTried}` : '';
          return `<li><code>${escapeHtml(item.url || 'unknown URL')}</code> (${escapeHtml(
            [statusLabel, method].filter(Boolean).join(' ').trim()
          )})</li>`;
        })
        .join('')}</ul></details>`
    : '';

  const gatingSection =
    renderEntriesTable(gatingEntries, `Broken links (${formatCount(gatingEntries.length)})`) ||
    (hasGating ? '' : '<p class="details">No broken links detected.</p>');

  const warningSection =
    renderEntriesTable(warningEntries, `Link warnings (${formatCount(warningEntries.length)})`) ||
    (hasWarnings ? '' : '<p class="details">No link warnings detected.</p>');

  const advisorySection = renderEntriesTable(
    advisoryEntries,
    `Link advisories (${formatCount(advisoryEntries.length)})`,
    { headingClass: 'summary-heading-best-practice' }
  );

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      <div class="page-card__meta">
        ${metaLines}
      </div>
      ${notesHtml}
      ${gatingSection}
      ${warningSection}
      ${advisorySection || ''}
      ${brokenSamplesHtml}
    </section>
  `;
};

const renderInteractivePageCard = (summary, { projectLabel } = {}) => {
  if (!summary) return '';

  const gating = Array.isArray(summary.gating) ? summary.gating : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const consoleSample = Array.isArray(summary.consoleSample) ? summary.consoleSample : [];
  const resourceSample = Array.isArray(summary.resourceSample) ? summary.resourceSample : [];
  const info = Array.isArray(summary.info) ? summary.info : [];

  const consoleErrors = summary.consoleErrors ?? 0;
  const resourceErrors = summary.resourceErrors ?? 0;

  const hasGating =
    consoleErrors > 0 ||
    resourceErrors > 0 ||
    gating.length > 0 ||
    consoleSample.length > 0 ||
    resourceSample.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAdvisories = advisories.length > 0;

  const statusMeta = hasGating
    ? {
        className: 'status-error',
        label: `${formatCount(consoleErrors + resourceErrors)} error(s)`,
      }
    : hasWarnings
      ? { className: 'status-warning', label: 'Needs attention' }
      : hasAdvisories
        ? { className: 'status-info', label: 'Advisories present' }
        : { className: 'status-ok', label: 'Pass' };

  const aggregateMessages = (items, impact, normalizer) => {
    const map = new Map();
    items.forEach((raw) => {
      if (!raw) return;
      const normalized = normalizer
        ? normalizer(raw)
        : { key: String(raw), label: String(raw), helpUrl: null, helpHtml: null, helpLabel: null };
      if (!normalized) return;
      const key = normalized.key || normalized.label;
      if (!key) return;
      const label = normalized.label || normalized.key || '';
      if (!map.has(key)) {
        map.set(key, {
          impact,
          message: label,
          count: 0,
          helpUrl: normalized.helpUrl || null,
          helpHtml: normalized.helpHtml || null,
          helpLabel: normalized.helpLabel || null,
        });
      }
      const entry = map.get(key);
      entry.count += 1;
      if (!entry.helpUrl && normalized.helpUrl) entry.helpUrl = normalized.helpUrl;
      if (!entry.helpHtml && normalized.helpHtml) entry.helpHtml = normalized.helpHtml;
      if (!entry.helpLabel && normalized.helpLabel) entry.helpLabel = normalized.helpLabel;
    });
    return Array.from(map.values());
  };

  const gatingEntries = aggregateMessages(gating, 'critical', normalizeInteractiveMessage);
  const warningEntries = aggregateMessages(warnings, 'moderate', normalizeInteractiveMessage);
  const advisoryEntries = aggregateMessages(advisories, 'minor', normalizeInteractiveMessage);
  const consoleEntries = aggregateMessages(consoleSample, 'moderate', normalizeInteractiveMessage);
  const resourceEntries = aggregateMessages(resourceSample, 'critical', (sample) => {
    const parts = [];
    if (sample?.status != null) parts.push(`Status ${sample.status}`);
    else if (sample?.error) parts.push(sample.error);
    else if (sample?.failure) parts.push(sample.failure);
    const method = sample?.methodTried || sample?.method;
    if (method) parts.push(`via ${method}`);
    const urlLabel = sample?.url ? simplifyUrlForDisplay(sample.url) : 'Unknown URL';
    const label = `${parts.length ? parts.join(' ') : 'Request failure'} – ${urlLabel}`;
    return { key: label, label };
  });

  const buildSummaryMeta = () =>
    [
      `<p class="details"><strong>Viewport:</strong> ${escapeHtml(projectLabel || 'Not recorded')}</p>`,
      `<p class="details"><strong>Console errors:</strong> ${escapeHtml(
        formatCount(consoleErrors)
      )}</p>`,
      `<p class="details"><strong>Resource errors:</strong> ${escapeHtml(
        formatCount(resourceErrors)
      )}</p>`,
    ].join('\n');

  const renderEntriesTable = (entries, heading, options = {}) =>
    entries.length
      ? renderWcagPageIssueTable(
          entries.map((entry) => ({
            impact: entry.impact,
            id: entry.message,
            nodesCount: entry.count,
          })),
          heading,
          options
        )
      : '';

  const renderList = (label, entries) =>
    entries.length
      ? `<details><summary>${escapeHtml(label)} (${formatCount(entries.length)})</summary><ul class="details">${entries
          .map(
            (entry) =>
              `<li>${escapeHtml(entry.message)}${
                entry.count > 1 ? ` (${formatCount(entry.count)})` : ''
              }</li>`
          )
          .join('')}</ul></details>`
      : '';

  const notesHtml = info.length
    ? `<details class="summary-note"><summary>Notes (${info.length})</summary><ul class="details">${info
        .map((note) => `<li>${escapeHtml(String(note))}</li>`)
        .join('')}</ul></details>`
    : '';

  const gatingSection =
    renderEntriesTable(
      gatingEntries,
      formatUniqueRulesHeading('Console & resource errors', gatingEntries.length)
    ) || (hasGating ? '' : '<p class="details">No console or resource errors detected.</p>');

  const warningsSection =
    renderEntriesTable(
      warningEntries,
      `Console warnings (${formatCount(warningEntries.length)})`
    ) || (hasWarnings ? '' : '<p class="details">No console warnings detected.</p>');

  const advisoriesSection = renderEntriesTable(
    advisoryEntries,
    formatUniqueRulesHeading('Console advisories', advisoryEntries.length),
    { headingClass: 'summary-heading-best-practice' }
  );

  const consoleSamplesHtml = renderList('Console sample', consoleEntries);
  const resourceSamplesHtml = renderList('Resource sample', resourceEntries);

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      <div class="page-card__meta">
        ${buildSummaryMeta()}
      </div>
      ${notesHtml}
      ${gatingSection}
      ${warningsSection}
      ${advisoriesSection || ''}
      ${consoleSamplesHtml}
      ${resourceSamplesHtml}
    </section>
  `;
};

const renderAvailabilityPageCard = (summary, { projectLabel } = {}) => {
  if (!summary) return '';

  const gating = Array.isArray(summary.gating) ? summary.gating : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];
  const info = Array.isArray(summary.info) ? summary.info.filter(Boolean) : [];
  const elements = isPlainObject(summary.elements) ? summary.elements : null;
  const rawStatus = summary.status != null ? Number(summary.status) : Number.NaN;

  const statusCode = Number.isFinite(rawStatus) ? rawStatus : summary.status ?? 'n/a';

  const hasGating = gating.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAdvisories = advisories.length > 0;

  const statusMeta = hasGating
    ? { className: 'status-error', label: `${formatCount(gating.length)} blocking issue(s)` }
    : hasWarnings
      ? { className: 'status-warning', label: 'Needs attention' }
      : hasAdvisories
        ? { className: 'status-info', label: 'Advisories present' }
        : { className: 'status-ok', label: 'Pass' };

  const aggregateMessages = (items, impact) => {
    const map = new Map();
    items.forEach((raw) => {
      if (!raw) return;
      const message = String(raw).replace(/\s+/g, ' ').trim();
      if (!message) return;
      if (!map.has(message)) map.set(message, { impact, message, count: 0 });
      map.get(message).count += 1;
    });
    return Array.from(map.values());
  };

  const gatingEntries = aggregateMessages(gating, 'critical');
  const warningEntries = aggregateMessages(warnings, 'moderate');
  const advisoryEntries = aggregateMessages(advisories, 'minor');

  const statusTone = Number.isFinite(rawStatus)
    ? rawStatus >= 500
      ? 'danger'
      : rawStatus >= 400
        ? 'warning'
        : rawStatus >= 300
          ? 'info'
          : 'success'
    : 'muted';

  const statusDescription = Number.isFinite(rawStatus)
    ? rawStatus >= 500
      ? 'Server error – page unavailable'
      : rawStatus >= 400
        ? 'Client error – investigate response'
        : rawStatus >= 300
          ? 'Redirected response'
          : 'Successful response'
    : 'Status not recorded';

  const landmarkKeys = ['header', 'navigation', 'content', 'footer'];
  const totalLandmarks = landmarkKeys.length;
  const presentLandmarks = landmarkKeys.filter((key) => elements && elements[key] === true).length;
  const missingLandmarks = landmarkKeys
    .filter((key) => elements && elements[key] === false)
    .map((key) => `${humaniseKey(key)} landmark missing`);
  const unknownLandmarks = elements
    ? Math.max(totalLandmarks - presentLandmarks - missingLandmarks.length, 0)
    : totalLandmarks;

  const structureTone = !elements
    ? 'muted'
    : missingLandmarks.length
      ? 'danger'
      : 'success';
  const structureValue = !elements
    ? 'Not captured'
    : `${presentLandmarks}/${totalLandmarks} present`;
  const structureDescription = !elements
    ? 'Structure scan not recorded'
    : missingLandmarks.length
      ? `${missingLandmarks.map((label) => label.replace(' landmark missing', '')).join(', ')} missing`
      : unknownLandmarks > 0
        ? 'Some landmarks not verified'
        : 'All critical landmarks detected';

  const statusTiles = renderInsightTiles(
    [
      {
        label: 'HTTP status',
        value: statusCode,
        tone: statusTone,
        description: statusDescription,
      },
      {
        label: 'Critical landmarks',
        value: structureValue,
        tone: structureTone,
        description: structureDescription,
      },
      {
        label: 'Viewport',
        value: projectLabel || 'Not recorded',
        tone: 'info',
      },
    ].filter(Boolean)
  );

  const issueTiles = renderInsightTiles(
    [
      {
        label: 'Blocking issues',
        value: formatCount(gatingEntries.length),
        tone: gatingEntries.length ? 'danger' : 'success',
        description: gatingEntries.length
          ? 'Resolve before launch'
          : 'No blocking availability issues detected',
      },
      {
        label: 'Warnings',
        value: formatCount(warningEntries.length),
        tone: warningEntries.length ? 'warning' : 'muted',
        description: warningEntries.length ? 'Follow up recommended' : 'No warnings recorded',
      },
      {
        label: 'Advisories',
        value: formatCount(advisoryEntries.length),
        tone: advisoryEntries.length ? 'info' : 'muted',
        description: advisoryEntries.length ? 'Non-blocking feedback' : 'None captured',
      },
      {
        label: 'Notes logged',
        value: formatCount(notes.length),
        tone: notes.length ? 'info' : 'muted',
        description: notes.length ? 'See tester notes below' : 'No notes recorded',
      },
      {
        label: 'Informational checks',
        value: formatCount(info.length),
        tone: info.length ? 'info' : 'muted',
        description: info.length ? 'Additional context captured' : 'No additional info recorded',
      },
    ].filter(Boolean)
  );

  const structureGroup = renderIssueGroup({
    title: 'Critical landmark check',
    items: missingLandmarks,
    tone: structureTone,
    emptyMessage: !elements
      ? 'Structure scan not recorded for this page.'
      : 'All tracked landmarks confirmed.',
  });

  const gatingGroup = renderIssueGroup({
    title: formatUniqueRulesHeading('Blocking issues', gatingEntries.length),
    items: summariseIssueEntries(gatingEntries),
    tone: gatingEntries.length ? 'danger' : 'success',
    emptyMessage: 'No blocking availability issues detected.',
  });

  const warningGroup = renderIssueGroup({
    title: `Warnings (${formatCount(warningEntries.length)})`,
    items: summariseIssueEntries(warningEntries),
    tone: warningEntries.length ? 'warning' : 'muted',
    emptyMessage: hasWarnings ? null : 'No warnings recorded.',
  });

  const advisoryGroup = renderIssueGroup({
    title: formatUniqueRulesHeading('Advisories', advisoryEntries.length),
    items: summariseIssueEntries(advisoryEntries),
    tone: advisoryEntries.length ? 'info' : 'muted',
    emptyMessage: null,
  });

  const notesGroup = renderIssueGroup({
    title: `Notes${notes.length ? ` (${formatCount(notes.length)})` : ''}`,
    items: notes.map((note) => String(note)),
    tone: notes.length ? 'info' : 'muted',
    emptyMessage: notes.length ? null : 'No notes recorded for this page.',
  });

  const infoGroup = renderIssueGroup({
    title: `Informational checks${info.length ? ` (${formatCount(info.length)})` : ''}`,
    items: info.map((item) => String(item)),
    tone: info.length ? 'info' : 'muted',
    emptyMessage: info.length ? null : 'No additional informational checks logged.',
  });

  const sectionsHtml = [
    structureGroup,
    gatingGroup,
    warningGroup,
    advisoryGroup,
    notesGroup,
    infoGroup,
  ]
    .filter(Boolean)
    .join('\n');

  const narrativeParts = [];

  if (Number.isFinite(rawStatus)) {
    if (rawStatus >= 500) {
      narrativeParts.push(`Responded with ${rawStatus} – server error.`);
    } else if (rawStatus >= 400) {
      narrativeParts.push(`Responded with ${rawStatus} – investigate the request.`);
    } else if (rawStatus >= 300) {
      narrativeParts.push(`Redirected with status ${rawStatus}.`);
    } else {
      narrativeParts.push(`Responded with ${rawStatus} OK.`);
    }
  } else {
    narrativeParts.push('No HTTP status recorded for this request.');
  }

  if (!elements) {
    narrativeParts.push('Structure scan was not captured.');
  } else if (missingLandmarks.length) {
    const landmarkList = missingLandmarks
      .map((label) => label.replace(' landmark missing', ''))
      .join(', ');
    narrativeParts.push(`Missing ${landmarkList} landmark${missingLandmarks.length > 1 ? 's' : ''}.`);
  } else {
    narrativeParts.push('All critical landmarks were detected.');
  }

  if (gatingEntries.length) {
    narrativeParts.push(`${describeCount(gatingEntries.length, 'blocking issue')} found.`);
  } else {
    narrativeParts.push('No blocking availability issues detected.');
  }

  if (warningEntries.length) {
    narrativeParts.push(`${describeCount(warningEntries.length, 'warning')} recorded.`);
  }

  if (notes.length) {
    narrativeParts.push(`${describeCount(notes.length, 'note')} logged for follow-up.`);
  }

  const summaryNarrative = narrativeParts.length
    ? `<p class="page-card__lede">${escapeHtml(narrativeParts.join(' '))}</p>`
    : '';

  const insightSections = [
    statusTiles ? { title: 'Run overview', content: statusTiles } : null,
    issueTiles ? { title: 'Alerts & notes', content: issueTiles } : null,
  ]
    .filter(Boolean)
    .map(
      (section) =>
        `<div class="page-card__insights"><h4 class="page-card__insights-title">${escapeHtml(
          section.title
        )}</h4>${section.content}</div>`
    )
    .join('\n');

  const insightsHtml = insightSections
    ? `<div class="page-card__insights-grid">${insightSections}</div>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card availability-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${summaryNarrative}
      ${insightsHtml}
      <div class="page-card__sections">
        ${sectionsHtml}
      </div>
    </section>
  `;
};

const renderHttpPageCard = (summary, { projectLabel, viewportLabel } = {}) => {
  if (!summary) return '';

  const gating = Array.isArray(summary.gating) ? summary.gating : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const failedChecks = Array.isArray(summary.failedChecks) ? summary.failedChecks : [];

  const hasGating = gating.length > 0 || failedChecks.length > 0;
  const hasWarnings = warnings.length > 0;
  const hasAdvisories = advisories.length > 0;

  const statusMeta = hasGating
    ? { className: 'status-error', label: 'Blocking issues' }
    : hasWarnings
      ? { className: 'status-warning', label: 'Warnings present' }
      : hasAdvisories
        ? { className: 'status-info', label: 'Advisories present' }
        : { className: 'status-ok', label: 'Pass' };

  const aggregateMessages = (items, impact, normalizer) => {
    const map = new Map();
    items.forEach((raw) => {
      if (!raw) return;
      const normalized = normalizer ? normalizer(raw) : { label: String(raw) };
      if (!normalized) return;
      const message = String(normalized.label || '').trim();
      if (!message) return;
      if (!map.has(message)) map.set(message, { message, impact, count: 0 });
      map.get(message).count += 1;
    });
    return Array.from(map.values());
  };

  const gatingEntries = aggregateMessages(gating, 'critical').concat(
    aggregateMessages(failedChecks, 'critical', (check) => ({
      label: check?.label || '',
      detail: check?.details,
    }))
  );
  const warningEntries = aggregateMessages(warnings, 'moderate');
  const advisoryEntries = aggregateMessages(advisories, 'minor');

  const renderEntriesTable = (entries, heading, options = {}) =>
    entries.length
      ? renderWcagPageIssueTable(
          entries.map((entry) => ({
            impact: entry.impact,
            id: entry.message,
            nodesCount: entry.count,
          })),
          heading,
          options
        )
      : '';

  const failedCheckDetails = failedChecks.length
    ? `<details><summary>Failed checks (${failedChecks.length})</summary><ul class="details">${failedChecks
        .map((check) => {
          const label = check?.label ? String(check.label).trim() : 'HTTP check failed';
          const detail = check?.details ? stripAnsiSequences(check.details).trim() : '';
          return `<li><strong>${escapeHtml(label)}</strong>${
            detail ? `<pre>${escapeHtml(detail)}</pre>` : ''
          }</li>`;
        })
        .join('')}</ul></details>`
    : '';

  const metaLines = [
    `<p class="details"><strong>Status:</strong> ${escapeHtml(
      summary.status != null ? String(summary.status) : 'n/a'
    )}</p>`,
    `<p class="details"><strong>Status text:</strong> ${escapeHtml(summary.statusText || '—')}</p>`,
    `<p class="details"><strong>Redirects:</strong> ${
      summary.redirectLocation ? `<code>${escapeHtml(summary.redirectLocation)}</code>` : '—'
    }</p>`,
    `<p class="details"><strong>Viewport:</strong> ${escapeHtml(
      viewportLabel || projectLabel || 'Not recorded'
    )}</p>`,
  ].join('\n');

  const gatingHeading = formatUniqueRulesHeading('Blocking HTTP issues', gatingEntries.length);
  const gatingSection =
    renderEntriesTable(gatingEntries, gatingHeading) ||
    '<p class="details">No blocking HTTP issues detected.</p>';

  const warningSection =
    renderEntriesTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`) ||
    (hasWarnings ? '' : '<p class="details">No warnings recorded.</p>');

  const advisoryHeading = formatUniqueRulesHeading('Advisories', advisoryEntries.length);
  const advisorySection =
    renderEntriesTable(advisoryEntries, advisoryHeading, {
      headingClass: 'summary-heading-best-practice',
    }) || '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      <div class="page-card__meta">
        ${metaLines}
      </div>
      ${gatingSection}
      ${warningSection}
      ${advisorySection}
      ${failedCheckDetails}
    </section>
  `;
};

const renderPerformancePageCard = (summary, { projectLabel } = {}) => {
  if (!summary) return '';

  const breaches = Array.isArray(summary.budgetBreaches) ? summary.budgetBreaches : [];
  const gating = Array.isArray(summary.gating) ? summary.gating : [];
  const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
  const advisories = Array.isArray(summary.advisories) ? summary.advisories : [];
  const notes = Array.isArray(summary.notes) ? summary.notes.filter(Boolean) : [];

  const aggregateMessages = (items, impact, formatter) => {
    const list = [];
    items.forEach((raw) => {
      if (!raw) return;
      const message = formatter ? formatter(raw) : String(raw);
      const text = String(message || '').trim();
      if (!text) return;
      list.push({ impact, message: text, count: 1 });
    });
    return list;
  };

  const breachEntries = aggregateMessages(
    breaches,
    'critical',
    (breach) =>
      `${humaniseKey(breach.metric)} exceeded budget (${Math.round(breach.value)}ms > ${Math.round(
        breach.budget
      )}ms)`
  );
  const gatingEntries = breachEntries.concat(aggregateMessages(gating, 'critical'));
  const warningEntries = aggregateMessages(warnings, 'moderate');
  const advisoryEntries = aggregateMessages(advisories, 'minor');

  const blockingCount = gatingEntries.length;
  const hasWarnings = warningEntries.length > 0;
  const hasAdvisories = advisoryEntries.length > 0;

  const statusMeta = blockingCount
    ? {
        className: 'status-error',
        label: `${formatCount(blockingCount)} blocking issue(s)`,
      }
    : hasWarnings
      ? { className: 'status-warning', label: 'Warnings present' }
      : hasAdvisories
        ? { className: 'status-info', label: 'Advisories present' }
        : { className: 'status-ok', label: 'Pass' };

  const budgetLookup = new Map();
  breaches.forEach((breach) => {
    const key = String(breach.metric || '').toLowerCase();
    if (key) budgetLookup.set(key, breach);
  });

  const metricDefinitions = [
    { key: 'loadtime', label: 'Load time', value: summary.loadTimeMs },
    { key: 'domcontentloaded', label: 'DOMContentLoaded', value: summary.domContentLoadedMs },
    { key: 'loadcomplete', label: 'Load complete', value: summary.loadCompleteMs },
    { key: 'firstcontentfulpaint', label: 'First Contentful Paint', value: summary.firstContentfulPaintMs },
    { key: 'firstpaint', label: 'First Paint', value: summary.firstPaintMs },
  ];

  const recordedMetrics = metricDefinitions
    .map(({ key, label, value }) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      const metricKey = String(key || '').toLowerCase();
      return {
        key: metricKey,
        label,
        value: numeric,
        breach: budgetLookup.get(metricKey) || null,
      };
    })
    .filter(Boolean);

  const metricsTiles = renderInsightTiles(
    recordedMetrics.map((metric) => ({
      label: metric.label,
      value: formatMillisecondsDisplay(metric.value),
      tone: metric.breach ? 'danger' : 'success',
      description:
        metric.breach && Number.isFinite(metric.breach.budget)
          ? `Budget ${Math.round(metric.breach.budget)} ms`
          : 'Recorded timing',
    }))
  );

  const slowestMetric = recordedMetrics.reduce((acc, metric) => {
    if (!acc) return metric;
    return metric.value > acc.value ? metric : acc;
  }, null);

  const additionalBlocking = Math.max(blockingCount - breachEntries.length, 0);
  const blockingDescription = blockingCount
    ? [
        breachEntries.length ? describeCount(breachEntries.length, 'budget breach') : null,
        additionalBlocking ? describeCount(additionalBlocking, 'additional issue') : null,
      ]
        .filter(Boolean)
        .join(' • ') || 'Resolve before launch'
    : 'No blocking issues detected';

  const statusTiles = renderInsightTiles(
    [
      {
        label: 'Viewport',
        value: projectLabel || 'Not recorded',
        tone: 'info',
      },
      {
        label: 'Timings captured',
        value: formatCount(recordedMetrics.length),
        tone: recordedMetrics.length ? 'info' : 'muted',
        description: recordedMetrics.length
          ? 'Key performance timings recorded'
          : 'No timing data captured',
      },
      slowestMetric
        ? {
            label: 'Longest timing',
            value: formatMillisecondsDisplay(slowestMetric.value),
            tone: slowestMetric.breach ? 'danger' : 'info',
            description: slowestMetric.label,
          }
        : null,
    ].filter(Boolean)
  );

  const issueTiles = renderInsightTiles(
    [
      {
        label: 'Budgets breached',
        value: formatCount(breaches.length),
        tone: breaches.length ? 'danger' : 'success',
        description: breaches.length ? 'Over configured budget' : 'All monitored budgets met',
      },
      {
        label: 'Blocking issues',
        value: formatCount(blockingCount),
        tone: blockingCount ? 'danger' : 'success',
        description: blockingDescription,
      },
      {
        label: 'Warnings',
        value: formatCount(warningEntries.length),
        tone: warningEntries.length ? 'warning' : 'muted',
        description: warningEntries.length ? 'Follow up recommended' : 'No warnings recorded',
      },
      {
        label: 'Advisories',
        value: formatCount(advisoryEntries.length),
        tone: advisoryEntries.length ? 'info' : 'muted',
        description: advisoryEntries.length ? 'Non-blocking guidance' : 'None captured',
      },
      {
        label: 'Notes logged',
        value: formatCount(notes.length),
        tone: notes.length ? 'info' : 'muted',
        description: notes.length ? 'See tester notes below' : 'No notes recorded',
      },
    ].filter(Boolean)
  );

  const breachesGroup = renderIssueGroup({
    title: formatUniqueRulesHeading('Budget breaches', gatingEntries.length),
    items: summariseIssueEntries(gatingEntries),
    tone: blockingCount ? 'danger' : 'success',
    emptyMessage: 'No performance budget breaches detected.',
  });

  const warningGroup = renderIssueGroup({
    title: `Warnings (${formatCount(warningEntries.length)})`,
    items: summariseIssueEntries(warningEntries),
    tone: warningEntries.length ? 'warning' : 'muted',
    emptyMessage: hasWarnings ? null : 'No warnings recorded.',
  });

  const advisoryGroup = renderIssueGroup({
    title: formatUniqueRulesHeading('Advisories', advisoryEntries.length),
    items: summariseIssueEntries(advisoryEntries),
    tone: advisoryEntries.length ? 'info' : 'muted',
    emptyMessage: null,
  });

  const notesGroup = renderIssueGroup({
    title: `Notes${notes.length ? ` (${formatCount(notes.length)})` : ''}`,
    items: notes.map((note) => String(note)),
    tone: notes.length ? 'info' : 'muted',
    emptyMessage: notes.length ? null : 'No notes recorded for this page.',
  });

  const sectionsHtml = [breachesGroup, warningGroup, advisoryGroup, notesGroup]
    .filter(Boolean)
    .join('\n');

  const narrativeParts = [];

  if (breaches.length) {
    narrativeParts.push(`${describeCount(breaches.length, 'budget')} exceeded.`);
  } else {
    narrativeParts.push('No performance budgets were breached.');
  }

  if (recordedMetrics.length) {
    if (slowestMetric) {
      narrativeParts.push(
        `${slowestMetric.label} was the slowest timing at ${formatMillisecondsDisplay(slowestMetric.value)}.`
      );
    }
  } else {
    narrativeParts.push('Performance timings were not captured for this page.');
  }

  if (warningEntries.length) {
    narrativeParts.push(`${describeCount(warningEntries.length, 'warning')} recorded.`);
  }

  if (advisoryEntries.length) {
    narrativeParts.push(`${describeCount(advisoryEntries.length, 'advisory')} logged.`);
  }

  if (notes.length) {
    narrativeParts.push(`${describeCount(notes.length, 'note')} captured for follow-up.`);
  }

  const summaryNarrative = narrativeParts.length
    ? `<p class="page-card__lede">${escapeHtml(narrativeParts.join(' '))}</p>`
    : '';

  const insightSections = [
    statusTiles ? { title: 'Run overview', content: statusTiles } : null,
    metricsTiles ? { title: 'Key timings', content: metricsTiles } : null,
    issueTiles ? { title: 'Alerts & notes', content: issueTiles } : null,
  ]
    .filter(Boolean)
    .map(
      (section) =>
        `<div class="page-card__insights"><h4 class="page-card__insights-title">${escapeHtml(
          section.title
        )}</h4>${section.content}</div>`
    )
    .join('\n');

  const insightsHtml = insightSections
    ? `<div class="page-card__insights-grid">${insightSections}</div>`
    : '';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card performance-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
        <span class="status-pill ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
      </div>
      ${summaryNarrative}
      ${insightsHtml}
      <div class="page-card__sections">
        ${sectionsHtml}
      </div>
    </section>
  `;
};

const makeKeyboardIssueEntry = (issue, impact) => {
  if (issue && typeof issue === 'object') {
    const rawMessage = issue.message || issue.rule || issue.id || '';
    const message = String(rawMessage).trim() || 'Issue';
    const identifier = String(issue.summary || issue.id || message).trim() || message;
    const tags = Array.isArray(issue.tags) ? issue.tags.filter(Boolean) : [];
    if (!tags.length && issue.wcag) {
      tags.push(issue.wcag);
    }

    const nodes = Array.isArray(issue.nodes) ? [...issue.nodes] : [];
    const sampleTargets = new Set();
    const addSample = (value) => {
      if (value == null) return;
      const label = String(value).trim();
      if (!label) return;
      sampleTargets.add(label);
    };
    if (Array.isArray(issue.samples)) {
      issue.samples.forEach((s) => {
        if (s && typeof s === 'object') {
          const label = String(s.label || s.sample || s.selector || '').trim();
          if (label) {
            sampleTargets.add(label);
            nodes.push({ target: [label], screenshotDataUri: s.screenshotDataUri || s.screenshot });
          }
        } else {
          addSample(s);
        }
      });
    }
    if (issue.sample) {
      addSample(issue.sample);
    }
    sampleTargets.forEach((label) => {
      // only add plain target if not already added above with screenshot
      const exists = nodes.some((n) => Array.isArray(n.target) && n.target.includes(label));
      if (!exists) nodes.push({ target: [label] });
    });

    return {
      impact: issue.impact || impact || 'info',
      id: identifier,
      rule: message,
      nodes,
      tags,
      helpUrl: issue.helpUrl || issue.help || null,
    };
  }

  const text = String(issue || '').trim() || 'Issue';
  return {
    impact: impact || 'info',
    id: text,
    rule: text,
    nodes: [],
    tags: [],
  };
};

const renderKeyboardPageIssuesTable = (entries, heading, options = {}) => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return options.emptyHtml || '';
  }
  return renderWcagPageIssueTable(entries, heading, options);
};

const normaliseStructureIssueItem = (issue, defaultImpact) => {
  if (!issue) return null;

  if (typeof issue === 'string') {
    const message = issue.trim();
    if (!message) return null;
    return {
      impact: defaultImpact || 'info',
      summary: message,
      message,
      tags: [],
      helpUrl: null,
      samples: [],
      nodes: [],
    };
  }

  if (typeof issue !== 'object') return null;

  const message = String(issue.message || issue.rule || issue.id || '').trim();
  const summary = String(issue.summary || message || '').trim();
  const impact = issue.impact || defaultImpact || 'info';

  const tagsSource = Array.isArray(issue.tags) ? issue.tags.filter(Boolean) : [];
  const tagSet = new Set(tagsSource);
  if (issue.wcag) {
    tagSet.add(issue.wcag);
  }

  const helpUrl = issue.helpUrl || issue.help || null;

  const samples = [];
  if (Array.isArray(issue.samples)) {
    issue.samples.forEach((sample) => {
      const label = String(sample || '').trim();
      if (label) samples.push(label);
    });
  }
  if (issue.sample != null) {
    const label = String(issue.sample || '').trim();
    if (label) samples.push(label);
  }

  const nodes = Array.isArray(issue.nodes) ? issue.nodes.filter(Boolean) : [];

  if (!message && !summary) return null;

  return {
    impact,
    summary: summary || message || 'Issue',
    message: message || summary || 'Issue',
    tags: Array.from(tagSet),
    helpUrl,
    samples,
    nodes,
  };
};

const aggregateStructureIssues = (issues, defaultImpact) => {
  if (!Array.isArray(issues) || issues.length === 0) return [];

  const map = new Map();

  for (const rawIssue of issues) {
    const normalized = normaliseStructureIssueItem(rawIssue, defaultImpact);
    if (!normalized) continue;

    const key = JSON.stringify([
      normalized.summary,
      normalized.tags.join('|'),
      normalized.helpUrl || '',
    ]);

    if (!map.has(key)) {
      map.set(key, {
        impact: normalized.impact,
        summary: normalized.summary,
        message: normalized.message,
        tags: normalized.tags,
        helpUrl: normalized.helpUrl,
        samples: new Set(),
        nodes: [],
      });
    }

    const bucket = map.get(key);
    bucket.impact = normalized.impact || bucket.impact;
    bucket.message = normalized.message || bucket.message;
    if (normalized.tags.length > 0) {
      bucket.tags = normalized.tags;
    }
    if (normalized.helpUrl) {
      bucket.helpUrl = normalized.helpUrl;
    }
    normalized.samples.forEach((sample) => {
      if (sample) bucket.samples.add(sample);
    });
    normalized.nodes.forEach((node) => {
      if (node) bucket.nodes.push(node);
    });
  }

  return Array.from(map.values()).map((entry) => {
    const nodes = [...entry.nodes];
    entry.samples.forEach((sample) => {
      nodes.push({ target: [sample] });
    });
    return {
      impact: entry.impact || defaultImpact || 'info',
      id: entry.summary || entry.message,
      rule: entry.message || entry.summary || 'Issue',
      tags: entry.tags,
      helpUrl: entry.helpUrl || null,
      nodes,
    };
  });
};

const renderKeyboardPageCard = (summary, { projectLabel } = {}) => {
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

  const viewportName = summary.projectName || summary.viewport || projectLabel || 'Not recorded';
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
    }
  );

  const gatingSection = renderKeyboardPageIssuesTable(
    gatingEntries,
    formatUniqueRulesHeading('Gating keyboard issues', gatingEntries.length),
    {
      emptyHtml: '<p class="details">No gating issues detected.</p>',
    }
  );

  const advisorySection = renderKeyboardPageIssuesTable(
    advisoryEntries,
    formatUniqueRulesHeading('Advisories', advisoryEntries.length),
    { headingClass: 'summary-heading-best-practice' }
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
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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
          const tags = Array.isArray(item.tags) ? item.tags : Array.isArray(item.wcagTags) ? item.wcagTags : [];
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
          };
        }

        return { key: source, label: source, helpUrl, helpHtml, helpLabel };
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
      const gatingIssues = collectIssueMessages(
        pagesData,
        ['gating', 'gatingIssues'],
        'critical'
      ).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'minor', {
        normalize: normalizeKeyboardAdvisory,
      });

      const issueSections = [
        executionFailureIssues.length
          ? renderUnifiedIssuesTable(executionFailureIssues, {
              title: formatUniqueRulesHeading('Execution failures', executionFailureIssues.length, {
                noun: 'unique issues',
              }),
              emptyMessage: 'Execution failures recorded during this run.',
              variant: 'gating',
              viewportLabel,
            })
          : '',
        renderIssueSectionPair({
          gatingIssues,
          advisoryIssues,
          gatingTitle: 'Blocking keyboard issues',
          gatingEmptyMessage: 'No blocking keyboard issues detected.',
          advisoryTitle: 'Keyboard advisories',
          advisoryEmptyMessage: 'No advisories detected.',
          viewportLabel,
        }),
      ]
        .filter(Boolean)
        .join('\n');

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
          page: page.page || page.url || 'Unknown page',
          _summaryClass: summaryClass,
        };
      });

      const perPageHtml = renderPerPageAccordion(perPageEntries, {
        heading: 'Per-page keyboard findings',
        summaryClass: 'summary-page--keyboard',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) =>
          renderKeyboardPageCard(entrySummary, { projectLabel: viewportLabel }),
        formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
      });

      const contentParts = [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');

      if (!contentParts.trim()) return '';

      if (buckets.length > 1) {
        return `
          <section class="schema-group__project-block">
            <header class="schema-group__project"><h3>${escapeHtml(projectLabel)}</h3></header>
            ${contentParts}
          </section>
        `;
      }

      return contentParts;
    })
    .filter(Boolean)
    .join('\n');

  if (!sections.trim()) return '';

  return `
    <section class="schema-group">
      ${sections}
    </section>
  `;
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

  const preferenceLabel = preferenceIgnored
    ? 'Ignored'
    : matchesPreference === true
      ? 'Respected'
      : 'Unknown';

  const metrics = renderSummaryMetrics([
    {
      label: 'Viewport',
      value: summary.viewport || summary.projectName || 'Not recorded',
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
      ? renderWcagPageIssueTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking reduced-motion issues', gatingEntries.length)
        )
      : '<p class="details">No blocking reduced-motion issues detected.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderWcagPageIssueTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderWcagPageIssueTable(
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
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const pagesData = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      if (pagesData.length === 0) return '';

      const overview = runPayload.overview || {};
      const metadata = runPayload.metadata || {};
      const viewportList =
        Array.isArray(runPayload.details?.viewports) && runPayload.details.viewports.length
          ? runPayload.details.viewports
          : Array.isArray(metadata.viewports) && metadata.viewports.length
            ? metadata.viewports
            : [];
      const projectLabel = metadata.projectName || bucket.projectName || 'Reduced motion audit';
      const viewportLabel = viewportList.length ? viewportList.join(', ') : projectLabel;
      const wcagRefs = Array.isArray(runPayload.details?.wcagReferences)
        ? runPayload.details.wcagReferences
        : [];
      const wcagBadges = wcagRefs
        .map(
          (ref) => `<span class="badge badge-wcag">${escapeHtml(`${ref.id} ${ref.name}`)}</span>`
        )
        .join(' ');

      const runSummaryHtml = `
        <section class="summary-report summary-a11y summary-a11y--run-summary">
          <h3>Reduced motion preference summary</h3>
          <p>Audited <strong>${escapeHtml(
            formatCount(overview.totalPagesAudited ?? pagesData.length)
          )}</strong> page(s) across ${escapeHtml(
            viewportList.length ? formatCount(viewportList.length) : '1'
          )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
          ${renderSummaryMetrics([
            {
              label: 'Pages respecting preference',
              value:
                overview.pagesRespectingPreference ??
                pagesData.filter((page) => page.matchesPreference).length,
            },
            {
              label: 'Pages with blocking issues',
              value:
                overview.pagesWithGatingIssues ??
                pagesData.filter((page) => (page.gating || page.gatingIssues || []).length > 0)
                  .length,
            },
            {
              label: 'Pages with advisories',
              value:
                overview.pagesWithAdvisories ??
                pagesData.filter((page) => (page.advisories || []).length > 0).length,
            },
            {
              label: 'Significant animations',
              value:
                overview.totalSignificantAnimations ??
                pagesData.reduce(
                  (sum, page) =>
                    sum +
                    (Array.isArray(page.significantAnimations)
                      ? page.significantAnimations.length
                      : 0),
                  0
                ),
            },
          ])}
          ${
            wcagBadges
              ? `<p class="legend"><strong>WCAG coverage:</strong> ${wcagBadges}</p>`
              : '<p class="legend"><strong>WCAG coverage:</strong> —</p>'
          }
        </section>
      `;

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

      const issueSections = renderIssueSectionPair({
        gatingIssues,
        advisoryIssues,
        gatingTitle: 'Blocking reduced-motion issues',
        gatingEmptyMessage: 'No blocking reduced-motion issues detected.',
        advisoryTitle: 'Reduced-motion advisories',
        advisoryEmptyMessage: 'No advisories detected.',
        viewportLabel,
      });

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

      const perPageHtml = renderPerPageAccordion(perPageEntries, {
        heading: 'Per-page reduced-motion findings',
        summaryClass: 'summary-page--reduced-motion',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) => renderReducedMotionPageCard(entrySummary),
        formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
      });

      return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
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

  const formatPx = (value) =>
    Number.isFinite(value) ? `${Math.round(value)}px` : value != null ? `${value}` : 'Not recorded';

  const metrics = renderSummaryMetrics([
    { label: 'Viewport', value: summary.viewport || summary.projectName || 'Not recorded' },
    { label: 'Viewport width', value: formatPx(summary.viewportWidth) },
    { label: 'Document width', value: formatPx(summary.documentWidth) },
    { label: 'Horizontal overflow', value: formatPx(horizontalOverflow) },
  ]);

  const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
  const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
  const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

  const gatingSection =
    gatingEntries.length > 0
      ? renderWcagPageIssueTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking reflow issues', gatingEntries.length)
        )
      : '<p class="details">No blocking reflow issues detected.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderWcagPageIssueTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : horizontalOverflow > 0
        ? `<p class="details">Horizontal overflow measured at ${escapeHtml(formatPx(horizontalOverflow))}.</p>`
        : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderWcagPageIssueTable(
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
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket) || {};
    const pagesData = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
    if (pagesData.length === 0) return '';

    const overview = runPayload.overview || {};
    const wcagRefs = Array.isArray(runPayload.details?.wcagReferences)
      ? runPayload.details.wcagReferences
      : [];
    const wcagBadges = wcagRefs
      .map((ref) => `<span class="badge badge-wcag">${escapeHtml(`${ref.id} ${ref.name}`)}</span>`)
      .join(' ');

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>320px reflow summary</h3>
        <p>Audited <strong>${escapeHtml(
          formatCount(overview.totalPagesAudited ?? pagesData.length)
        )}</strong> page(s) for 320px overflow and layout resiliency.</p>
        ${renderSummaryMetrics([
          {
            label: 'Pages with overflow',
            value:
              overview.pagesWithOverflow ??
              pagesData.filter((page) => (page.gating || []).length > 0).length,
          },
          {
            label: 'Pages with advisories',
            value:
              overview.pagesWithAdvisories ??
              pagesData.filter((page) => (page.advisories || []).length > 0).length,
          },
          {
            label: 'Max overflow (px)',
            value:
              overview.maxOverflowPx ??
              pagesData.reduce(
                (max, page) =>
                  Math.max(
                    max,
                    Number.isFinite(page.horizontalOverflowPx) ? page.horizontalOverflowPx : 0
                  ),
                0
              ),
          },
        ])}
        ${
          wcagBadges
            ? `<p class="legend"><strong>WCAG coverage:</strong> ${wcagBadges}</p>`
            : '<p class="legend"><strong>WCAG coverage:</strong> —</p>'
        }
      </section>
    `;

    const gatingIssues = collectIssueMessages(
      pagesData,
      ['gating', 'gatingIssues'],
      'critical'
    ).filter((issue) => issue.pageCount > 0);
    const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'moderate');

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues,
      gatingTitle: 'Blocking reflow issues',
      gatingEmptyMessage: 'No blocking reflow issues detected.',
      advisoryTitle: 'Reflow advisories',
      advisoryEmptyMessage: 'No advisories detected.',
    });

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

    const perPageHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page reflow findings',
      summaryClass: 'summary-page--reflow',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) => renderReflowPageCard(entrySummary),
      formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
    });

    return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
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
    { label: 'Viewport', value: summary.viewport || summary.projectName || 'Not recorded' },
    { label: 'Iframes detected', value: formatCount(iframeCount) },
    { label: 'Cross-origin frames', value: formatCount(crossOriginCount) },
    { label: 'Missing accessible name', value: formatCount(unlabeledFrames) },
  ]);

  const gatingEntries = aggregatePageIssueEntries(gating, { defaultImpact: 'critical' });
  const warningEntries = aggregatePageIssueEntries(warnings, { defaultImpact: 'moderate' });
  const advisoryEntries = aggregatePageIssueEntries(advisories, { defaultImpact: 'minor' });

  const gatingSection =
    gatingEntries.length > 0
      ? renderWcagPageIssueTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking iframe issues', gatingEntries.length)
        )
      : '<p class="details">No blocking iframe issues detected.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderWcagPageIssueTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : unlabeledFrames > 0
        ? `<p class="details">${escapeHtml(
            formatCount(unlabeledFrames)
          )} iframe(s) lack an accessible name.</p>`
        : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderWcagPageIssueTable(
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
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const pagesData = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      if (pagesData.length === 0) return '';

      const overview = runPayload.overview || {};
      const wcagRefs = Array.isArray(runPayload.details?.wcagReferences)
        ? runPayload.details.wcagReferences
        : [];
      const wcagBadges = wcagRefs
        .map(
          (ref) => `<span class="badge badge-wcag">${escapeHtml(`${ref.id} ${ref.name}`)}</span>`
        )
        .join(' ');

      const runSummaryHtml = `
        <section class="summary-report summary-a11y summary-a11y--run-summary">
          <h3>Iframe accessibility summary</h3>
          <p>Audited iframe metadata across <strong>${escapeHtml(
            formatCount(overview.totalPagesAudited ?? pagesData.length)
          )}</strong> page(s).</p>
          ${renderSummaryMetrics([
            {
              label: 'Iframe count',
              value:
                overview.totalIframesDetected ??
                pagesData.reduce(
                  (sum, page) => sum + (Array.isArray(page.frames) ? page.frames.length : 0),
                  0
                ),
            },
            {
              label: 'Pages with blocking issues',
              value:
                overview.pagesWithMissingLabels ??
                pagesData.filter((page) => (page.gating || page.gatingIssues || []).length > 0)
                  .length,
            },
            {
              label: 'Pages with advisories',
              value:
                overview.pagesWithAdvisories ??
                pagesData.filter((page) => (page.advisories || []).length > 0).length,
            },
          ])}
          ${
            wcagBadges
              ? `<p class="legend"><strong>WCAG coverage:</strong> ${wcagBadges}</p>`
              : '<p class="legend"><strong>WCAG coverage:</strong> —</p>'
          }
        </section>
      `;

      const gatingIssues = collectIssueMessages(
        pagesData,
        ['gating', 'gatingIssues'],
        'critical'
      ).filter((issue) => issue.pageCount > 0);
      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'moderate');

      const issueSections = renderIssueSectionPair({
        gatingIssues,
        advisoryIssues,
        gatingTitle: 'Blocking iframe issues',
        gatingEmptyMessage: 'No blocking iframe issues detected.',
        advisoryTitle: 'Iframe advisories',
        advisoryEmptyMessage: 'No advisories detected.',
      });

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

      const perPageHtml = renderPerPageAccordion(perPageEntries, {
        heading: 'Per-page iframe findings',
        summaryClass: 'summary-page--iframe',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) => renderIframePageCard(entrySummary),
        formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
      });

      return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
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

  const gatingSection = gatingEntries.length
    ? renderWcagPageIssueTable(
        gatingEntries,
        `Gating structural issues (${formatCount(gatingEntries.length)})`
      )
    : '<p class="details">No gating issues detected.</p>';

  const warningsSection = warningEntries.length
    ? renderWcagPageIssueTable(
        warningEntries,
        `Structural warnings (${formatCount(warningEntries.length)})`
      )
    : '<p class="details">No structural warnings detected.</p>';

  const advisoriesSection = advisoryEntries.length
    ? renderWcagPageIssueTable(
        advisoryEntries,
        `Structural advisories (${formatCount(advisoryEntries.length)})`,
        { headingClass: 'summary-heading-best-practice' }
      )
    : '<p class="details">No structural advisories detected.</p>';

  return `
    <section class="summary-report summary-a11y summary-a11y--page-card">
      <div class="page-card__header">
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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

const renderResponsiveStructureGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket) || {};
      const metadata = runPayload.metadata || {};
      const viewportList = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportLabel =
        (viewportList.length ? viewportList.join(', ') : null) ||
        metadata.projectName ||
        bucket.projectName ||
        null;

      const detailPages = Array.isArray(runPayload?.details?.pages) ? runPayload.details.pages : [];
      const pageEntryPayloads = (bucket.pageEntries || [])
        .map((entry) => entry.payload || {})
        .filter((payload) => payload.kind === KIND_PAGE_SUMMARY);

      const pagesData =
        detailPages.length > 0
          ? detailPages
          : pageEntryPayloads.map((payload) => payload.summary || payload);

      if (pagesData.length === 0) return '';

      const overview = runPayload.overview || {};
      const totalPages = overview.totalPages ?? pagesData.length;
      const pagesWithGating =
        overview.pagesWithGatingIssues ??
        pagesData.filter((page) => {
          const list = []
            .concat(
              Array.isArray(page.gatingIssues) ? page.gatingIssues : [],
              Array.isArray(page.gating) ? page.gating : [],
              Array.isArray(page.errors) ? page.errors : []
            )
            .filter(Boolean);
          return list.length > 0;
        }).length;
      const pagesWithWarnings =
        overview.pagesWithWarnings ??
        pagesData.filter((page) => Array.isArray(page.warnings) && page.warnings.length > 0).length;
      const loadBreaches =
        overview.loadBudgetBreaches ??
        pagesData.filter((page) => {
          const warnings = Array.isArray(page.warnings) ? page.warnings : [];
          return warnings.some((warning) => /threshold/i.test(String(warning)));
        }).length;
      const missingStructure =
        (overview.headerMissing ?? 0) +
        (overview.navigationMissing ?? 0) +
        (overview.contentMissing ?? 0) +
        (overview.footerMissing ?? 0);

      const runSummaryHtml = `
        <section class="summary-report summary-a11y summary-a11y--run-summary">
          <h3>Responsive structure summary</h3>
          <p>Audited <strong>${escapeHtml(
            formatCount(totalPages)
          )}</strong> page(s) across ${escapeHtml(
            viewportList.length ? formatCount(viewportList.length) : '1'
          )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
          ${renderSummaryMetrics([
            { label: 'Pages with blocking issues', value: pagesWithGating },
            { label: 'Pages with warnings', value: pagesWithWarnings },
            { label: 'Load budget breaches', value: loadBreaches },
            { label: 'Missing structure elements', value: missingStructure },
          ])}
        </section>
      `;

      const pagesForGating = pagesData.map((page) => ({
        ...page,
        responsiveGating: []
          .concat(
            Array.isArray(page.gatingIssues) ? page.gatingIssues : [],
            Array.isArray(page.gating) ? page.gating : [],
            Array.isArray(page.errors) ? page.errors : []
          )
          .filter(Boolean),
      }));
      const gatingIssues = collectIssueMessages(
        pagesForGating,
        'responsiveGating',
        'critical'
      ).filter((issue) => issue.pageCount > 0);

      const pagesForAdvisories = pagesData.map((page) => ({
        ...page,
        responsiveAdvisories: []
          .concat(
            Array.isArray(page.warnings) ? page.warnings : [],
            Array.isArray(page.advisories) ? page.advisories : []
          )
          .filter(Boolean),
      }));
      const advisoryIssues = collectIssueMessages(
        pagesForAdvisories,
        'responsiveAdvisories',
        'moderate'
      );

      const issueSections = renderIssueSectionPair({
        gatingIssues,
        advisoryIssues,
        gatingTitle: 'Blocking responsive issues',
        gatingEmptyMessage: 'No blocking responsive issues detected.',
        advisoryTitle: 'Responsive advisories',
        advisoryEmptyMessage: 'No advisories detected.',
        viewportLabel,
      });

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

      const perPageHtml = renderPerPageAccordion(perPageEntries, {
        heading: 'Per-page responsive findings',
        summaryClass: 'summary-page--responsive',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) =>
          renderResponsiveStructurePageCard(entrySummary, { viewportLabel }),
        formatSummaryLabel: (entrySummary) => formatPageLabel(entrySummary?.page || 'Page'),
      });

      return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  if (sections.length === 0) return '';

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
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
    { label: 'Viewport', value: summary.viewport || viewportLabel || 'Not recorded' },
    { label: 'Load time', value: formatMillisecondsDisplay(summary.loadTimeMs) },
    { label: 'Threshold', value: formatMillisecondsDisplay(summary.thresholdMs) },
    { label: 'Header landmark', value: summary.headerPresent === false ? 'Missing' : 'Present' },
    {
      label: 'Navigation landmark',
      value: summary.navigationPresent === false ? 'Missing' : 'Present',
    },
    { label: 'Content landmark', value: summary.contentPresent === false ? 'Missing' : 'Present' },
    { label: 'Footer landmark', value: summary.footerPresent === false ? 'Missing' : 'Present' },
  ]);

  const aggregateMessages = (items, impact) => {
    const map = new Map();
    items.forEach((raw) => {
      if (!raw) return;
      const message = String(raw).replace(/\s+/g, ' ').trim();
      if (!message) return;
      if (!map.has(message)) map.set(message, { impact, message, count: 0 });
      map.get(message).count += 1;
    });
    return Array.from(map.values());
  };

  const gatingEntries = aggregateMessages(gating, 'critical');
  const warningEntries = aggregateMessages(warnings, 'moderate');
  const advisoryEntries = aggregateMessages(advisories, 'minor');

  const renderEntriesTable = (entries, heading, options = {}) =>
    entries.length
      ? renderWcagPageIssueTable(
          entries.map((entry) => ({
            impact: entry.impact,
            id: entry.message,
            nodesCount: entry.count,
          })),
          heading,
          options
        )
      : '';

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
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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

const renderResponsiveWpGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets
    .map((bucket) => {
      const runPayload = firstRunPayload(bucket);
      if (!runPayload) return '';

      const details = runPayload.details || {};
      const pagesData = Array.isArray(details.pages) ? details.pages : [];
      if (pagesData.length === 0) return '';

      const metadata = runPayload.metadata || {};
      const projectLabel =
        metadata.projectName || bucket.projectName || 'WordPress responsive features';
      const detailViewports = Array.isArray(details.viewports) ? details.viewports : [];
      const metadataViewports = Array.isArray(metadata.viewports) ? metadata.viewports : [];
      const viewportList = detailViewports.length > 0 ? detailViewports : metadataViewports;
      const viewportLabel = viewportList.length ? viewportList.join(', ') : null;

      const overview = runPayload.overview || {};
      const viewportsAudited = overview.totalViewports ?? pagesData.length;
      const responsiveViewports =
        overview.viewportsWithResponsiveElements ??
        pagesData.filter((page) => page.responsiveDetected).length;
      const widgetViewports =
        overview.viewportsWithWidgets ??
        pagesData.filter((page) => (Number(page.widgets) || 0) > 0).length;
      const blockingViewports =
        overview.viewportsWithGatingIssues ??
        pagesData.filter((page) => (Array.isArray(page.gating) ? page.gating : []).length > 0)
          .length;
      const warningViewports =
        overview.viewportsWithWarnings ??
        pagesData.filter((page) => (Array.isArray(page.warnings) ? page.warnings : []).length > 0)
          .length;
      const averageBlocksRaw = overview.averageBlockElements;
      const averageBlocks =
        Number.isFinite(averageBlocksRaw) && averageBlocksRaw !== null
          ? averageBlocksRaw
          : pagesData.length
            ? pagesData.reduce((sum, page) => sum + (Number(page.blockElements) || 0), 0) /
              pagesData.length
            : 0;

      const summaryMetrics = renderSummaryMetrics([
        { label: 'Viewports audited', value: formatCount(viewportsAudited) },
        { label: 'Responsive viewports', value: formatCount(responsiveViewports) },
        { label: 'Viewports with widgets', value: formatCount(widgetViewports) },
        { label: 'Blocking issues', value: formatCount(blockingViewports) },
        { label: 'Warnings', value: formatCount(warningViewports) },
        {
          label: 'Avg. WP block count',
          value: Number.isFinite(averageBlocks)
            ? averageBlocks.toFixed(1)
            : formatCount(averageBlocks),
        },
      ]);

      const viewportSummary = viewportLabel ? ` across ${escapeHtml(viewportLabel)}.` : '.';

      const runSummaryHtml = `
        <section class="summary-report summary-a11y summary-a11y--run-summary">
          <h3>WordPress responsive features summary</h3>
          <p>Audited <strong>${escapeHtml(formatCount(viewportsAudited))}</strong> viewport(s)${viewportSummary}</p>
          ${summaryMetrics}
        </section>
      `;

      const issueSource = pagesData.map((page) => ({
        ...page,
        page: `${page.viewport || 'Viewport'} › ${page.page || '/'}`,
      }));

      const gatingIssues = collectIssueMessages(issueSource, 'gating', 'critical');
      const warningIssues = collectIssueMessages(issueSource, 'warnings', 'moderate');
      const advisoryIssues = collectIssueMessages(issueSource, 'advisories', 'minor');
      const combinedAdvisories = warningIssues.concat(advisoryIssues);

      const issueSections = renderIssueSectionPair({
        gatingIssues,
        advisoryIssues: combinedAdvisories,
        gatingTitle: 'Blocking WordPress responsive issues',
        gatingEmptyMessage: 'No blocking WordPress responsive issues detected.',
        advisoryTitle: 'WordPress responsive advisories',
        advisoryEmptyMessage: 'No advisories detected.',
        viewportLabel,
      });

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

      const perPageHtml = renderPerPageAccordion(perPageEntries, {
        heading: 'Per-viewport WordPress responsive findings',
        summaryClass: 'summary-page--responsive',
        containerClass: 'summary-report summary-a11y summary-a11y--per-page',
        renderCard: (entrySummary) => renderResponsiveWpPageCard(entrySummary, { projectLabel }),
        formatSummaryLabel: (entrySummary) =>
          `${entrySummary?.viewport || 'Viewport'} — ${formatPageLabel(entrySummary?.page || '/')}`,
      });

      return [runSummaryHtml, issueSections, perPageHtml].filter(Boolean).join('\n');
    })
    .filter(Boolean);

  if (sections.length === 0) return '';

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

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
    { label: 'Viewport', value: summary.viewport || projectLabel || 'Not recorded' },
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
      ? renderWcagPageIssueTable(
          gatingEntries,
          formatUniqueRulesHeading('Blocking issues', gatingEntries.length)
        )
      : '<p class="details">No blocking issues detected for this viewport.</p>';

  const warningSection =
    warningEntries.length > 0
      ? renderWcagPageIssueTable(warningEntries, `Warnings (${formatCount(warningEntries.length)})`)
      : '';

  const advisorySection =
    advisoryEntries.length > 0
      ? renderWcagPageIssueTable(
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
        <h3>${escapeHtml(summary.page || 'Unknown page')}</h3>
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

const renderStructureGroupHtml = (group) => {
  const firstSummary = Array.isArray(group?.summaries) ? group.summaries[0] : null;
  if (firstSummary?.metadata?.scope === 'page' || (group.runEntries || []).length === 0) {
    return '';
  }
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    let runSummaryBlock = '';
    let gatingIssuesTable = '';
    let advisoryIssuesTable = '';

    if (runPayload) {
      const pagesData = Array.isArray(runPayload.details?.pages) ? runPayload.details.pages : [];
      const overview = runPayload.overview || {};
      const totalPagesAudited = overview.totalPagesAudited ?? pagesData.length;
      const pagesMissingMain =
        overview.pagesMissingMain ?? pagesData.filter((page) => !page.hasMainLandmark).length;
      const pagesWithHeadingSkips =
        overview.pagesWithHeadingSkips ??
        pagesData.filter((page) => (page.headingSkips || []).length > 0).length;
      const pagesWithGatingIssues =
        overview.pagesWithGatingIssues ??
        pagesData.filter((page) => (page.gating || page.gatingIssues || []).length > 0).length;
      const pagesWithAdvisories =
        overview.pagesWithAdvisories ??
        pagesData.filter((page) => (page.advisories || []).length > 0).length;

      const wcagRefs = runPayload.details?.wcagReferences || [];
      const wcagBadges = wcagRefs
        .map(
          (ref) => `<span class="badge badge-wcag">${escapeHtml(`${ref.id} ${ref.name}`)}</span>`
        )
        .join(' ');

      const metadata = runPayload.metadata || {};
      const detailViewports = Array.isArray(runPayload.details?.viewports)
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

      const summaryItems = [
        {
          label: 'Gating issues',
          tone: 'status-error',
          count: pagesWithGatingIssues,
          suffix: 'page(s)',
        },
        {
          label: 'Missing main landmarks',
          tone: 'status-warning',
          count: pagesMissingMain,
          suffix: 'page(s)',
        },
        {
          label: 'Heading skips',
          tone: 'status-warning',
          count: pagesWithHeadingSkips,
          suffix: 'page(s)',
        },
        {
          label: 'Advisories',
          tone: 'status-info',
          count: pagesWithAdvisories,
          suffix: 'page(s)',
        },
      ];
      const statusSummary = renderStatusSummaryList(summaryItems, { className: 'status-summary' });

      const detailNotes = [];
      if (pagesMissingMain > 0) {
        detailNotes.push(
          `<p class="details">Main landmark missing on ${escapeHtml(formatCount(pagesMissingMain))} page(s).</p>`
        );
      }
      if (pagesWithHeadingSkips > 0) {
        detailNotes.push(
          `<p class="details">Heading level sequence issues on ${escapeHtml(formatCount(pagesWithHeadingSkips))} page(s).</p>`
        );
      }
      if (pagesWithAdvisories > 0) {
        detailNotes.push(
          `<p class="details">Advisories recorded on ${escapeHtml(formatCount(pagesWithAdvisories))} page(s).</p>`
        );
      }

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

      const normalizeStructureWarning = ({ message, raw }) => {
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
        return {
          key: trimmedMessage || 'Structural warning',
          label: trimmedMessage || 'Structural warning',
          sample,
          helpUrl,
          helpHtml,
          helpLabel,
        };
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
      const headingSkipIssues = collectIssueMessages(pagesData, 'headingSkips', 'moderate', {
        normalize: normalizeStructureAdvisory,
      });
      const warningIssues = collectIssueMessages(pagesData, 'warnings', 'moderate', {
        normalize: normalizeStructureWarning,
      });
      const advisoryIssues = collectIssueMessages(pagesData, 'advisories', 'minor', {
        normalize: normalizeStructureAdvisory,
      });
      const combinedAdvisories = [...headingSkipIssues, ...warningIssues, ...advisoryIssues].filter(
        (issue) => issue.pageCount > 0
      );

      runSummaryBlock = `
        <section class="summary-report summary-a11y summary-a11y--run-summary">
          <h3>Structural accessibility run summary</h3>
          <p>Audited <strong>${escapeHtml(
            formatCount(totalPagesAudited)
          )}</strong> page(s) per browser across ${escapeHtml(
            formatCount(viewportList.length || 1)
          )} viewport(s): ${escapeHtml(viewportLabel || 'Not recorded')}.</p>
          ${
            statusSummary ||
            '<p class="details">No structural issues detected across the audited pages.</p>'
          }
          ${detailNotes.join('\n')}
          ${
            wcagBadges
              ? `<p class="legend"><strong>WCAG coverage:</strong> ${wcagBadges}</p>`
              : '<p class="legend"><strong>WCAG coverage:</strong> —</p>'
          }
        </section>
      `;

      gatingIssuesTable = renderUnifiedIssuesTable(gatingIssues, {
        title: formatUniqueRulesHeading('Gating structural issues', gatingIssues.length),
        emptyMessage: 'No gating issues detected.',
        variant: 'gating',
        viewportLabel,
      });

      // Dedupe advisory/warning entries by message regardless of differing impact
      // to avoid showing the same rule twice when a summarised advisory and a
      // per-occurrence warning share the same label.
      const combinedDedupe = collectIssueMessages(pagesData, ['headingSkips', 'warnings', 'advisories'], 'minor', {
        normalize: normalizeStructureAdvisory,
        dedupeIgnoreImpact: true,
      }).filter((issue) => issue.pageCount > 0);

      advisoryIssuesTable = renderUnifiedIssuesTable(combinedDedupe, {
        title: formatUniqueRulesHeading(
          'Structural advisories and warnings',
          combinedDedupe.length
        ),
        emptyMessage: 'No advisories detected.',
        variant: 'advisory',
        viewportLabel,
      });
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

    const accordionHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-page structure findings',
      summaryClass: 'summary-page--structure',
      renderCard: (entrySummary) => renderStructurePageCard(entrySummary),
      formatSummaryLabel: (entrySummary) => entrySummary?.page || 'Unknown page',
    });

    return [runSummaryBlock, gatingIssuesTable, advisoryIssuesTable, accordionHtml]
      .filter(Boolean)
      .join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};
const renderFormsGroupHtml = (group) => {
  const buckets = collectSchemaProjects(group);
  if (buckets.length === 0) return '';

  const sections = buckets.map((bucket) => {
    const runPayload = firstRunPayload(bucket);
    if (!runPayload) return '';

    const formsData = Array.isArray(runPayload?.details?.forms) ? runPayload.details.forms : [];
    if (formsData.length === 0) return '';

    const metadata = runPayload.metadata || {};
    const projectLabel = metadata.projectName || bucket.projectName || 'Forms accessibility';
    const overview = runPayload.overview || {};

    const formsAudited = overview.totalFormsAudited ?? formsData.length;
    const formsWithGating =
      overview.formsWithGatingIssues ??
      formsData.filter((form) => (form.gating || []).length > 0).length;
    const formsWithAdvisories =
      overview.formsWithAdvisories ??
      formsData.filter((form) => (form.advisories || []).length > 0).length;
    const fieldsReviewed =
      overview.totalFieldsAudited ??
      formsData.reduce((sum, form) => sum + (form.fields || []).length, 0);
    const totalGatingFindings =
      overview.totalGatingFindings ??
      formsData.reduce((sum, form) => sum + (form.gating || []).length, 0);
    const totalAdvisoryFindings =
      overview.totalAdvisoryFindings ??
      formsData.reduce((sum, form) => sum + (form.advisories || []).length, 0);

    const uniquePages = new Set(formsData.map((form) => form.page || 'Unknown page')).size;

    const summaryMetrics = renderSummaryMetrics([
      { label: 'Forms audited', value: formatCount(formsAudited) },
      { label: 'Forms with gating issues', value: formatCount(formsWithGating) },
      { label: 'Forms with advisories', value: formatCount(formsWithAdvisories) },
      { label: 'Fields reviewed', value: formatCount(fieldsReviewed) },
      { label: 'Total gating findings', value: formatCount(totalGatingFindings) },
      { label: 'Total advisory findings', value: formatCount(totalAdvisoryFindings) },
    ]);

    const wcagRefs = Array.isArray(runPayload?.details?.wcagReferences)
      ? runPayload.details.wcagReferences
      : [];
    const wcagBadges = wcagRefs
      .map((ref) => `<span class="badge badge-wcag">${escapeHtml(`${ref.id} ${ref.name}`)}</span>`)
      .join(' ');

    const runSummaryHtml = `
      <section class="summary-report summary-a11y summary-a11y--run-summary">
        <h3>Forms accessibility summary</h3>
        <p>Audited <strong>${escapeHtml(formatCount(formsAudited))}</strong> form(s) across ${escapeHtml(
          formatCount(uniquePages)
        )} page(s).</p>
        ${summaryMetrics}
        <p class="legend"><strong>WCAG coverage:</strong> ${wcagBadges || '—'}</p>
      </section>
    `;

    const issueSource = formsData.map((form) => ({
      ...form,
      page: `${form.page || 'Unknown page'} › ${form.formName || 'Form'}`,
    }));

    const gatingIssues = collectIssueMessages(issueSource, 'gating', 'critical');
    const warningIssues = collectIssueMessages(issueSource, 'warnings', 'moderate');
    const advisoryIssues = collectIssueMessages(issueSource, 'advisories', 'minor');
    const combinedAdvisories = warningIssues.concat(advisoryIssues);

    const issueSections = renderIssueSectionPair({
      gatingIssues,
      advisoryIssues: combinedAdvisories,
      gatingTitle: 'Blocking form issues',
      gatingEmptyMessage: 'No blocking form issues detected.',
      advisoryTitle: 'Form advisories & warnings',
      advisoryEmptyMessage: 'No advisories detected.',
    });

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
      const summaryClass = gatingList.length
        ? 'summary-page--fail'
        : warningsList.length > 0
          ? 'summary-page--warn'
          : advisoriesList.length > 0
            ? 'summary-page--advisory'
            : 'summary-page--ok';
      return {
        ...summary,
        formName: summary.formName || payload.formName || 'Form',
        page: payload.page || summary.page,
        _summaryClass: summaryClass,
      };
    });

    if (perPageEntries.length === 0) {
      perPageEntries = formsData.map((form) => {
        const gatingList = Array.isArray(form.gating) ? form.gating : [];
        const warningsList = Array.isArray(form.warnings) ? form.warnings : [];
        const advisoriesList = Array.isArray(form.advisories) ? form.advisories : [];
        const summaryClass = gatingList.length
          ? 'summary-page--fail'
          : warningsList.length > 0
            ? 'summary-page--warn'
            : advisoriesList.length > 0
              ? 'summary-page--advisory'
              : 'summary-page--ok';
        return {
          ...form,
          formName: form.formName || 'Form',
          page: form.page || 'Unknown page',
          _summaryClass: summaryClass,
        };
      });
    }

    const accordionHtml = renderPerPageAccordion(perPageEntries, {
      heading: 'Per-form breakdown',
      summaryClass: 'summary-page--forms',
      containerClass: 'summary-report summary-a11y summary-a11y--per-page',
      renderCard: (entrySummary) => renderFormsPageCard(entrySummary, { projectLabel }),
      formatSummaryLabel: (entrySummary) => {
        const formName = entrySummary?.formName || 'Form';
        const page = entrySummary?.page || 'Unknown page';
        return `${formName} — ${page}`;
      },
    });

    return [runSummaryHtml, issueSections, accordionHtml].filter(Boolean).join('\n');
  });

  return `
    <article class="schema-group">
      ${sections.join('\n')}
    </article>
  `;
};

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
    ? renderWcagPageIssueTable(
        violations,
        `Gating WCAG violations (${formatCount(violations.length)})`
      )
    : '<p class="details">No gating violations detected.</p>';

  const advisorySection = advisories.length
    ? renderWcagPageIssueTable(
        advisories,
        `WCAG advisory findings (${formatCount(advisories.length)})`
      )
    : '';

  const bestPracticeSection = bestPractices.length
    ? renderWcagPageIssueTable(
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

const SCHEMA_HTML_RENDERERS = {
  forms: renderFormsGroupHtml,
  keyboard: renderKeyboardGroupHtml,
  'reduced-motion': renderReducedMotionGroupHtml,
  reflow: renderReflowGroupHtml,
  'iframe-metadata': renderIframeGroupHtml,
  structure: renderStructureGroupHtml,
  'responsive-structure': renderResponsiveStructureGroupHtml,
  'internal-links': renderInternalLinksGroupHtml,
  interactive: renderInteractiveGroupHtml,
  availability: renderAvailabilityGroupHtml,
  http: renderHttpGroupHtml,
  performance: renderPerformanceGroupHtml,
  visual: renderVisualGroupHtml,
  wcag: renderAccessibilityGroupHtml,
  'wp-features': renderResponsiveWpGroupHtml,
};

const renderSchemaGroup = (group) => {
  const summaryType = summaryTypeFromGroup(group);
  if (summaryType && SCHEMA_HTML_RENDERERS[summaryType]) {
    return SCHEMA_HTML_RENDERERS[summaryType](group);
  }
  return renderSchemaGroupFallbackHtml(group);
};

const panelStatusFromMetrics = (metrics) => {
  if (!metrics) return 'info';
  if ((metrics.blocking || 0) > 0) return 'fail';
  if ((metrics.warnings || 0) + (metrics.advisories || 0) > 0) return 'warn';
  return 'pass';
};

const summariseStatuses = (tests) =>
  tests.reduce((acc, test) => {
    const status = test.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

const renderStatusPills = (counts, options = {}) => {
  const showCount = options.showCount !== false;
  return STATUS_ORDER.filter((status) => counts[status])
    .map((status) => {
      const label = STATUS_LABELS[status] || status;
      const count = counts[status];
      const countHtml = showCount
        ? `<span class="status-count">${escapeHtml(String(count))}</span>`
        : '';
      return `<span class="status-pill status-${status}">${escapeHtml(label)}${countHtml}</span>`;
    })
    .join('');
};

const groupTests = (tests) => {
  const groups = [];
  const map = new Map();
  const usedIds = new Set();
  const skippedTests = [];
  const unexecutedTests = [];

  const ensureUniqueId = (base) => {
    let candidate = base || 'group';
    let counter = 1;
    while (usedIds.has(candidate)) {
      counter += 1;
      candidate = `${base}-${counter}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  (tests || []).forEach((test) => {
    const status = test?.status || 'unknown';
    if (status === 'skipped') {
      skippedTests.push(test);
      return;
    }
    if (status === 'timedOut' || status === 'interrupted') {
      unexecutedTests.push(test);
      return;
    }

    const filePath = test.location?.file || 'Unknown file';
    const fileName = filePath.split(/[/\\]/).pop();
    const project = test.projectName || 'Default project';
    const key = `${project}::${filePath}`;
    if (!map.has(key)) {
      const idBase = slugify(`${project}-${fileName}`);
      const group = {
        id: ensureUniqueId(idBase),
        title: `${project} › ${fileName}`,
        project,
        file: filePath,
        tests: [],
      };
      map.set(key, group);
      groups.push(group);
    }
    map.get(key).tests.push(test);
  });

  const augmentGroup = (idBase, title, list) => {
    if (!Array.isArray(list) || list.length === 0) return;
    groups.push({
      id: ensureUniqueId(idBase),
      title,
      project: title,
      file: null,
      tests: list,
    });
  };

  augmentGroup('unexecuted-tests', 'Tests that failed to execute', unexecutedTests);
  augmentGroup('skipped-tests', 'Skipped tests', skippedTests);

  return groups;
};

const renderTestNavigation = (groups) => {
  if (!Array.isArray(groups) || groups.length === 0) return '';

  const items = groups
    .map((group) => {
      const groupCounts = summariseStatuses(group.tests);
      const groupStats = renderStatusPills(groupCounts);
      const testsList = group.tests
        .map((test) => {
          const statusLabel = STATUS_LABELS[test.status] || test.status;
          return `
            <li data-test-anchor="${escapeHtml(test.anchorId)}">
              <a href="#${escapeHtml(test.anchorId)}">${escapeHtml(test.displayTitle || test.title)}</a>
              <span class="status-pill status-${test.status}">${escapeHtml(statusLabel)}</span>
            </li>
          `;
        })
        .join('');

      const statsHtml = groupStats
        ? `<div class="test-navigation__group-stats">${groupStats}</div>`
        : '';

      return `
        <li data-group-anchor="${escapeHtml(group.id)}">
          <div class="test-navigation__group-header">
            <a href="#${escapeHtml(group.id)}">${escapeHtml(group.title)}</a>
            ${statsHtml}
          </div>
          <ul class="test-navigation__group-tests">
            ${testsList}
          </ul>
        </li>
      `;
    })
    .join('');

  return `
    <nav class="test-navigation" aria-label="Test navigation">
      <h2>Test navigation</h2>
      <ul>
        ${items}
      </ul>
    </nav>
  `;
};

const renderTestGroup = (group, options = {}) => {
  const counts = summariseStatuses(group.tests);
  const stats = renderStatusPills(counts);
  const statsHtml = stats ? `<div class="test-group__stats">${stats}</div>` : '';
  return `
    <section class="test-group" id="${escapeHtml(group.id)}">
      <header class="test-group__header">
        <div class="test-group__title">
          <h2>${escapeHtml(group.title)}</h2>
          <div class="test-group__meta">${group.file ? `<code>${escapeHtml(group.file)}</code>` : ''}</div>
        </div>
        ${statsHtml}
      </header>
      <div class="test-group__body">
        ${group.tests.map((test) => renderTestCard(test, options)).join('\n')}
      </div>
    </section>
  `;
};

const renderErrorBlock = () => '';

const renderLogBlock = () => '';

const renderAttachment = (attachment) => {
  if (attachment.omitted) {
    return `
      <div class="attachment omitted">
        <div class="attachment__meta">
          <span class="attachment__name">${escapeHtml(attachment.name || 'Attachment')}</span>
          <span class="attachment__meta-details">${escapeHtml(attachment.contentType || 'unknown')} • ${escapeHtml(formatBytes(attachment.size || 0))}</span>
        </div>
        <div class="attachment__body">${escapeHtml(attachment.reason || 'Attachment omitted')}</div>
      </div>
    `;
  }

  let bodyHtml = '';
  if (attachment.dataUri && attachment.contentType?.startsWith('image/')) {
    bodyHtml = `<figure><img src="${attachment.dataUri}" alt="${escapeHtml(attachment.name || 'Attachment image')}" /><figcaption>${escapeHtml(attachment.name || attachment.contentType || 'Image')}</figcaption></figure>`;
  } else if (attachment.html) {
    bodyHtml = `<div class="attachment-html">${attachment.html}</div>`;
  } else if (attachment.text) {
    bodyHtml = `<pre>${escapeHtml(attachment.text)}</pre>`;
  } else if (attachment.dataUri) {
    bodyHtml = `<a class="attachment-download" href="${attachment.dataUri}" download="${escapeHtml(attachment.name || 'attachment')}" rel="noopener">Download ${escapeHtml(attachment.name || attachment.contentType || 'attachment')}</a>`;
  } else if (attachment.base64) {
    bodyHtml = `<code class="attachment-base64">${attachment.base64}</code>`;
  } else if (attachment.error) {
    bodyHtml = `<div class="attachment-error">${escapeHtml(attachment.error)}</div>`;
  } else {
    bodyHtml = '<p>No attachment data available.</p>';
  }

  return `
    <div class="attachment">
      <div class="attachment__meta">
        <span class="attachment__name">${escapeHtml(attachment.name || 'Attachment')}</span>
        <span class="attachment__meta-details">${escapeHtml(attachment.contentType || 'unknown')} • ${escapeHtml(formatBytes(attachment.size || 0))}</span>
      </div>
      <div class="attachment__body">${bodyHtml}</div>
    </div>
  `;
};

const stripSummaryStyles = (html) => {
  if (!html) return '';
  return html.replace(SUMMARY_STYLES, '').trimStart();
};

const renderSummaries = (summaries, options = {}) => {
  if (!summaries || summaries.length === 0) return '';

  const exclude = new Set((options.excludeBaseNames || []).filter(Boolean));
  const htmlSummaries = summaries
    .filter((summary) => summary?.html)
    .filter((summary) => !exclude.has(summary.baseName));

  if (htmlSummaries.length === 0) return '';

  const sectionClasses = ['test-summaries'];
  if (options.compact) sectionClasses.push('test-summaries--compact');

  const sections = htmlSummaries
    .map((summary) => {
      const label = summary.title || summary.baseName || 'Summary';
      const sanitizedHtml = stripSummaryStyles(summary.html);
      return `
        <details class="summary-block" data-summary-type="html">
          <summary>${escapeHtml(label)}</summary>
          <div class="summary-block__body">${sanitizedHtml}</div>
        </details>
      `;
    })
    .join('\n');

  const heading = options.heading
    ? `<header class="test-summaries__header"><h4>${escapeHtml(options.heading)}</h4></header>`
    : '';

  return `
    <section class="${sectionClasses.join(' ')}" aria-label="Summary attachments">
      ${heading}
      ${sections}
    </section>
  `;
};

const renderAttempts = (attempts, options = {}) => {
  if (!attempts || attempts.length === 0) return '';

  const excludeBaseNames = new Set((options.excludeSummaryBaseNames || []).filter(Boolean));

  const attemptEntries = attempts
    .map((attempt, index) => {
      const filteredSummaries = (attempt.summaries || []).filter(
        (summary) => summary?.baseName && !excludeBaseNames.has(summary.baseName)
      );

      const summariesHtml = renderSummaries(filteredSummaries, { compact: true });
      const attachmentHtml = attempt.attachments?.length
        ? `<div class="attempt-attachments">${attempt.attachments.map(renderAttachment).join('\n')}</div>`
        : '';
      const errorsHtml = renderErrorBlock(attempt.errors);
      const stdoutHtml = renderLogBlock();
      const stderrHtml = renderLogBlock();

      const bodySegments = [summariesHtml, attachmentHtml, errorsHtml, stdoutHtml, stderrHtml]
        .filter(Boolean)
        .join('\n');

      const headerMeta = [
        escapeHtml(STATUS_LABELS[attempt.status] || attempt.status),
        attempt.durationFriendly ? escapeHtml(attempt.durationFriendly) : null,
        attempt.startTimeFriendly ? escapeHtml(attempt.startTimeFriendly) : null,
      ]
        .filter(Boolean)
        .map((item) => `<span>${item}</span>`) // html safe
        .join('');

      return `
        <details class="attempt-card status-${attempt.status}">
          <summary>
            <span class="attempt-title">Attempt ${index + 1}</span>
            <span class="attempt-meta">${headerMeta}</span>
          </summary>
          <div class="attempt-body">
            ${bodySegments || '<p class="attempt-note">No additional data recorded for this attempt.</p>'}
          </div>
        </details>
      `;
    })
    .join('\n');

  return `
    <section class="test-attempts" aria-label="Attempts">
      <header class="test-attempts__header"><h4>Attempts</h4></header>
      ${attemptEntries}
    </section>
  `;
};

const renderTestCard = (test, options = {}) => {
  const promotedSummaryBaseNames = options.promotedSummaryBaseNames || new Set();
  const allSummaryBlocks = Array.isArray(test.summaryBlocks) ? test.summaryBlocks : [];
  const retainedSummaries = allSummaryBlocks.filter(
    (summary) => !promotedSummaryBaseNames.has(summary.baseName)
  );
  const summariesHtml = renderSummaries(retainedSummaries, {
    heading: retainedSummaries.length ? 'Summary' : null,
  });
  const summaryBaseNames = retainedSummaries.map((summary) => summary.baseName).filter(Boolean);

  const attemptsExcludeBaseNames = new Set(summaryBaseNames);
  allSummaryBlocks
    .map((summary) => summary.baseName)
    .filter((baseName) => promotedSummaryBaseNames.has(baseName))
    .forEach((baseName) => attemptsExcludeBaseNames.add(baseName));

  const attemptsHtml = renderAttempts(test.attempts, {
    excludeSummaryBaseNames: Array.from(attemptsExcludeBaseNames),
  });
  const errorHtml = !test.attempts?.length ? renderErrorBlock(test.errors) : '';
  const stdoutHtml = '';
  const stderrHtml = '';
  const primaryError = Array.isArray(test.errors)
    ? test.errors.find((error) => error?.message)
    : null;
  let statusNote = '';
  if (primaryError?.message) {
    const headline = primaryError.message
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    if (headline) {
      statusNote = `<div class="test-card__note status-error">${escapeHtml(headline)}</div>`;
    }
  }
  if (
    !retainedSummaries.length &&
    allSummaryBlocks.some((summary) => promotedSummaryBaseNames.has(summary.baseName))
  ) {
    statusNote += `<div class="test-card__note status-neutral">Detailed run findings appear in the summary section above.</div>`;
  }

  const annotations = (test.annotations || [])
    .map((ann) => ann?.type || ann?.title)
    .filter(Boolean);
  const tags = Array.isArray(test.tags) ? test.tags : [];
  const statusLabel = STATUS_LABELS[test.status] || test.status;
  const displayTitle = test.displayTitle || test.title;

  return `
    <article class="test-card status-${test.status} ${test.flaky ? 'is-flaky' : ''}" id="${escapeHtml(test.anchorId)}">
      <header class="test-card__header">
        <div>
          <h3>${escapeHtml(displayTitle)}</h3>
          <div class="test-card__meta">
            <span class="meta-item">${escapeHtml(test.projectName || 'Unnamed project')}</span>
            <span class="meta-item">${escapeHtml(statusLabel)}</span>
            ${test.flaky ? '<span class="meta-item flaky">Flaky</span>' : ''}
            ${test.durationFriendly ? `<span class="meta-item">${escapeHtml(test.durationFriendly)}</span>` : ''}
          </div>
        </div>
        <div class="test-card__location">
          ${test.location?.file ? `<code>${escapeHtml(test.location.file)}:${escapeHtml(test.location.line ?? 1)}</code>` : ''}
        </div>
      </header>

      ${
        annotations.length || tags.length
          ? `<div class="test-card__badges">${[...annotations, ...tags].map((item) => `<span class="badge">${escapeHtml(item)}</span>`).join('')}</div>`
          : ''
      }

      ${statusNote}
      ${summariesHtml}
      ${attemptsHtml}
      ${errorHtml}
      ${stdoutHtml}
      ${stderrHtml}
    </article>
  `;
};

const sass = require('sass');

const styleSourcePath = path.join(__dirname, '..', 'docs', 'mocks', 'report-styles.scss');

function compileReportStyles() {
  try {
    const result = sass.compile(styleSourcePath, { style: 'expanded' });
    const css = `${result.css.trim()}\n`;
    const legacyPath = styleSourcePath.replace(/\.scss$/, '.css');
    try {
      fs.writeFileSync(legacyPath, css);
    } catch (writeError) {
      console.warn(`⚠️  Unable to write compiled CSS to ${legacyPath}: ${writeError.message}`);
    }
    return css;
  } catch (error) {
    throw new Error(`Failed to compile report styles from ${styleSourcePath}: ${error.message}`);
  }
}

const baseStyles = compileReportStyles();

const filterScript = `
(function () {
  const statusInputs = Array.from(document.querySelectorAll('.status-filters input[type="checkbox"]'));
  const searchInput = document.getElementById('report-search');
  const testCards = Array.from(document.querySelectorAll('.test-card'));
  const testGroups = Array.from(document.querySelectorAll('.test-group'));
  const navTestItems = Array.from(document.querySelectorAll('.test-navigation [data-test-anchor]'));
  const navGroupItems = Array.from(document.querySelectorAll('.test-navigation [data-group-anchor]'));
  const collapsibleSections = Array.from(
    document.querySelectorAll('.test-logs, .summary-block, .debug-deck')
  );

  // Guarantee all accordions start collapsed, even if the browser restores prior state.
  collapsibleSections.forEach((section) => {
    if (typeof section.open === 'boolean') {
      section.open = false;
    } else {
      section.removeAttribute('open');
    }
  });

  function applyFilters() {
    const activeStatuses = statusInputs.filter((input) => input.checked).map((input) => input.value);
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    testCards.forEach((card) => {
      const status = Array.from(card.classList).find((cls) => cls.startsWith('status-'))?.replace('status-', '');
      const matchesStatus = activeStatuses.length === 0 || activeStatuses.includes(status);
      const content = (card.textContent || '').toLowerCase();
      const matchesSearch = !searchTerm || content.includes(searchTerm);
      card.setAttribute('data-hidden', matchesStatus && matchesSearch ? 'false' : 'true');
    });

    testGroups.forEach((group) => {
      const visible = Array.from(group.querySelectorAll('.test-card')).some((card) => card.getAttribute('data-hidden') !== 'true');
      group.setAttribute('data-hidden', visible ? 'false' : 'true');
    });

    navTestItems.forEach((item) => {
      const anchor = item.getAttribute('data-test-anchor');
      const card = anchor ? document.getElementById(anchor) : null;
      const hidden = !card || card.getAttribute('data-hidden') === 'true';
      item.setAttribute('data-hidden', hidden ? 'true' : 'false');
    });

    navGroupItems.forEach((item) => {
      const anchor = item.getAttribute('data-group-anchor');
      const group = anchor ? document.getElementById(anchor) : null;
      const hidden = !group || group.getAttribute('data-hidden') === 'true';
      item.setAttribute('data-hidden', hidden ? 'true' : 'false');
    });
  }

  statusInputs.forEach((input) => input.addEventListener('change', applyFilters));
  searchInput?.addEventListener('input', applyFilters);
  applyFilters();

  const THEME_STORAGE_KEY = 'report-theme';
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const themeLabel = themeToggle?.querySelector('[data-theme-label]');
  const prefersDarkQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const safeGetStoredTheme = () => {
    try {
      return window.localStorage ? window.localStorage.getItem(THEME_STORAGE_KEY) : null;
    } catch (_error) {
      return null;
    }
  };

  const safeSetStoredTheme = (value) => {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(THEME_STORAGE_KEY, value);
      }
    } catch (_error) {
      // Ignore storage failures (private mode, etc.)
    }
  };

  const updateToggleUi = (theme) => {
    if (!themeToggle) return;
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    if (themeLabel) {
      themeLabel.textContent = isDark ? 'Solarized Light' : 'Solarized Dark';
    }
  };

  const applyTheme = (theme, options = {}) => {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    document.body.dataset.theme = normalized;
    if (options.persist !== false) {
      safeSetStoredTheme(normalized);
    }
    updateToggleUi(normalized);
  };

  const storedTheme = safeGetStoredTheme();
  const initialTheme =
    storedTheme || (prefersDarkQuery && prefersDarkQuery.matches ? 'dark' : 'light');
  applyTheme(initialTheme, { persist: false });

  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  if (!storedTheme && prefersDarkQuery) {
    const handlePreferenceChange = (event) => {
      applyTheme(event.matches ? 'dark' : 'light', { persist: false });
    };
    if (typeof prefersDarkQuery.addEventListener === 'function') {
      prefersDarkQuery.addEventListener('change', handlePreferenceChange);
    } else if (typeof prefersDarkQuery.addListener === 'function') {
      prefersDarkQuery.addListener(handlePreferenceChange);
    }
  }
})();
`;

function renderReportHtml(run) {
  const groupedTests = groupTests(run.tests);
  const navigationHtml = renderTestNavigation(groupedTests);
  const summaryMap = collectRunSummariesByType(run.schemaSummaries || []);
  const schemaGroups = buildSchemaGroups(run.schemaSummaries || []);
  const { panels: suitePanels, baseNamesUsed } = buildSuitePanels(schemaGroups, summaryMap);
  const filteredRunSummaries = (run.runSummaries || []).filter((summary) =>
    summary?.baseName ? !baseNamesUsed.has(summary.baseName) : true
  );

  const themeToggleButton = `
    <button class="theme-toggle" type="button" aria-pressed="false" aria-label="Toggle Solarized theme" data-theme-toggle>
      <span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">☀️</span>
      <span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">🌙</span>
      <span class="theme-toggle__label" data-theme-label>Solarized Dark</span>
    </button>
  `;

  const summaryOverviewHtml = renderSummaryOverview(run, run.schemaSummaries || [], suitePanels);
  const runSummariesHtml = renderRunSummaries(filteredRunSummaries);

  const testsHtml = groupedTests
    .map((group) => renderTestGroup(group, { promotedSummaryBaseNames: baseNamesUsed }))
    .join('\n');
  const summarySections = [summaryOverviewHtml, runSummariesHtml]
    .filter((section) => Boolean(section && section.trim()))
    .join('\n');

  const summaryPanel = {
    id: 'summary',
    navGroup: null,
    label: 'Summary',
    specLabel: 'Summary',
    title: 'Test run overview',
    description:
      'Pulls together pass/fail counts, timing, and standout issues from every suite. Start here to understand overall health before diving into individual checks.',
    status: 'info',
    statusMeta: {
      ...PANEL_STATUS_META.info,
      navClass: 'status-summary',
      specClass: 'spec-status--info',
    },
    content: `
      <header class="panel-header">
        <div class="panel-info">
          <span class="spec-label">Summary</span>
          <h2>Test run overview</h2>
          <p class="panel-description">Pulls together pass/fail counts, timing, and standout issues from every suite. Start here to understand overall health before diving into individual checks.</p>
        </div>
      </header>
      <div class="panel-body">
        ${summarySections}
      </div>
    `,
  };

  const testsPanel =
    groupedTests.length > 0
      ? (() => {
          const testCounts = summariseStatuses(run.tests || []);
          const filtersHtml = renderStatusFilters(testCounts);
          const testsStatus =
            (testCounts.failed || 0) > 0 ||
            (testCounts.timedOut || 0) > 0 ||
            (testCounts.interrupted || 0) > 0
              ? 'fail'
              : (testCounts.flaky || 0) > 0
                ? 'warn'
                : 'pass';
          const testsStatusMeta = PANEL_STATUS_META[testsStatus] || PANEL_STATUS_META.info;
          return {
            id: 'tests',
            navGroup: 'Diagnostics',
            label: 'Test details',
            specLabel: 'Test diagnostics',
            title: 'Detailed test results',
            description:
              'Explore every Playwright spec, filter by status, and review logs or attachments for failing cases.',
            status: testsStatus,
            statusMeta: {
              ...testsStatusMeta,
              navClass: testsStatusMeta.navClass || 'status-info',
            },
            content: `
        <header class="panel-header">
          <div class="panel-info">
            <span class="spec-label">${escapeHtml('Test diagnostics')}</span>
            <h2>Detailed test results</h2>
            <p class="panel-description">Explore every Playwright spec, filter by status, and review logs or attachments for failing cases.</p>
          </div>
          <span class="spec-status ${testsStatusMeta.specClass}">${escapeHtml(
            testsStatusMeta.label
          )}</span>
        </header>
        <div class="panel-body panel-body--tests">
          ${filtersHtml}
          ${navigationHtml}
          <div class="test-groups">
            ${testsHtml}
          </div>
        </div>
      `,
          };
        })()
      : null;

  const panels = [summaryPanel, ...suitePanels, ...(testsPanel ? [testsPanel] : [])];
  const toggleStyles = buildPanelToggleStyles(panels);
  const radioInputs = panels
    .map(
      (panel, index) =>
        `<input type="radio" name="report-view" id="view-${panel.id}" ${index === 0 ? 'checked' : ''} />`
    )
    .join('\n');
  const sidebarHtml = renderSidebar(panels, run, summaryMap);
  const panelsHtml = panels
    .map(
      (panel) => `
        <section class="panel" data-view="view-${panel.id}">
          ${panel.content}
        </section>
      `
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(run.runId)} – Playwright Test Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Work+Sans:wght@400;500&display=swap" rel="stylesheet" />
  <style>
${baseStyles}
${toggleStyles}
${imageViewerStyles}
  </style>
  ${SUMMARY_STYLES}
</head>
<body class="report-app" data-theme="light">
  ${radioInputs}
  <div class="report-shell">
    ${sidebarHtml}
    <main class="report-content">
      <div class="report-toolbar">
        ${themeToggleButton}
      </div>
      ${panelsHtml}
    </main>
  </div>
  <script>${imageViewerScript}</script>
  <script>${filterScript}</script>
</body>
</html>`;
}

module.exports = {
  renderReportHtml,
  escapeHtml,
  formatBytes,
  renderSchemaSummariesMarkdown,
  renderRunSummariesMarkdown,
};

// Lightweight in-page image viewer to avoid new-tab data: URL issues in some browsers.
const imageViewerStyles = `
.image-viewer-overlay { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.66); z-index: 9999; padding: 2rem; }
.image-viewer-overlay[open] { display: flex; }
.image-viewer { position: relative; max-width: 92vw; max-height: 92vh; background: var(--surface-panel); border: 1px solid var(--border-default); border-radius: var(--radius-md); box-shadow: var(--shadow-floating); padding: .5rem; }
.image-viewer img { display: block; max-width: 90vw; max-height: 88vh; }
.image-viewer__close { position: absolute; top: .5rem; right: .5rem; background: var(--surface-card); border: 1px solid var(--border-default); border-radius: 8px; padding: .35rem .6rem; cursor: pointer; }
`;

const imageViewerScript = `
(function () {
  let overlay;
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'image-viewer-overlay';
    overlay.innerHTML = '<button class="image-viewer__close" aria-label="Close image">✕</button><div class="image-viewer"><img alt="Issue screenshot" /></div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.classList.contains('image-viewer__close')) {
        overlay.removeAttribute('open');
      }
    });
    return overlay;
  }
  function openImage(href) {
    const ov = ensureOverlay();
    const img = ov.querySelector('img');
    if (img) img.src = href;
    ov.setAttribute('open', '');
  }
  function isImageHref(href) {
    if (!href) return false;
    if (href.startsWith('data:image/')) return true;
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(href);
  }
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.screenshot-link');
    if (!a) return;
    const href = a.getAttribute('href');
    if (isImageHref(href)) {
      e.preventDefault();
      openImage(href);
    }
  });
})();
`;

module.exports.__test__ = {
  renderIssueSectionPair,
  renderAvailabilityPageCard,
  renderHttpPageCard,
  renderPerformancePageCard,
  renderResponsiveStructurePageCard,
  renderVisualPageCard,
};
