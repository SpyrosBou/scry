const {
  describeCount,
  escapeHtml,
  formatCount,
  formatIssueImpactLabel,
  renderStatusSummaryList,
  summariseIssueEntries,
} = require('../../report-template-helpers');
const { renderPerPageAccordion } = require('../../reporting-utils');
const { assembleSuiteSections } = require('../../report-components/layout');

const MISSING_DATA_LABEL = 'DATA MISSING';

const ensureDisplayValue = (value) => {
  if (value === null || value === undefined) return MISSING_DATA_LABEL;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : MISSING_DATA_LABEL;
  }
  return value;
};

const ensurePageLabel = (page) => ensureDisplayValue(page);

const renderRuleSnapshotsTable = (snapshots) => {
  if (!Array.isArray(snapshots) || snapshots.length === 0) return '';
  const rows = snapshots
    .map((snapshot) => {
      const impact = snapshot.impact || snapshot.category || 'info';
      const impactLabel = formatIssueImpactLabel(impact);
      const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];
      const viewports = Array.isArray(snapshot.viewports) ? snapshot.viewports : [];
      const wcagTags = Array.isArray(snapshot.wcagTags) ? snapshot.wcagTags : [];
      const snapshotBrowsers = normaliseStringList(snapshot.browsers, snapshot.projects);
      const browserValues = snapshotBrowsers.length ? snapshotBrowsers : [MISSING_DATA_LABEL];
      const browsers = renderCodeList(browserValues, MISSING_DATA_LABEL);
      const viewportValues = viewports.length ? viewports : [MISSING_DATA_LABEL];
      const viewportList = renderCodeList(viewportValues, MISSING_DATA_LABEL);
      const detailsText = snapshot.description || snapshot.help || '';
      const detailsContent = detailsText ? escapeHtml(detailsText) : MISSING_DATA_LABEL;
      const helpLink = snapshot.helpUrl
        ? `<br /><a class="details-link" href="${escapeHtml(
            snapshot.helpUrl
          )}" target="_blank" rel="noopener noreferrer">Guidance</a>`
        : '';
      return `
        <tr class="impact-${impact.toLowerCase?.() || 'info'}">
          <td>${escapeHtml(impactLabel)}</td>
          <td>${escapeHtml(snapshot.rule || snapshot.id || 'rule')}</td>
          <td><span class="details-text">${detailsContent}</span>${helpLink}</td>
          <td>${browsers}</td>
          <td>${viewportList}</td>
          <td>${pages.length ? renderCodeList(pages) : MISSING_DATA_LABEL}</td>
          <td>${snapshot.nodes != null ? escapeHtml(formatCount(snapshot.nodes)) : MISSING_DATA_LABEL}</td>
          <td>${renderComplianceCell(wcagTags)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="schema-table">
      <thead>
        <tr><th>Impact</th><th>Rule</th><th>Details</th><th>Browser</th><th>Viewport</th><th>Pages</th><th>Nodes</th><th>WCAG level</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
};


const normaliseStringList = (...inputs) => {
  const set = new Set();
  for (const input of inputs) {
    if (Array.isArray(input)) {
      input.forEach((value) => {
        if (value || value === 0) {
          const trimmed = String(value).trim();
          if (trimmed) set.add(trimmed);
        }
      });
    } else if (input || input === 0) {
      const trimmed = String(input).trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return Array.from(set);
};

const renderCodeList = (values, fallback = MISSING_DATA_LABEL) => {
  const list = normaliseStringList(values);
  if (list.length === 0) return fallback;
  return list.map((value) => `<code>${escapeHtml(value)}</code>`).join('<br />');
};

const defaultHydrateSuiteIssue = (issue) => {
  if (!issue) return null;
  const message =
    issue.message || issue.rule || issue.id || issue.text || issue.description || '';
  if (!message.trim()) return null;

  const pages = Array.isArray(issue.pages) ? issue.pages : [];
  const pageCount = Number.isFinite(issue.pageCount) ? issue.pageCount : pages.length;
  const nodesCount = Number.isFinite(issue.nodesCount)
    ? issue.nodesCount
    : Number.isFinite(issue.instanceCount)
      ? issue.instanceCount
      : Number.isFinite(issue.nodes)
        ? issue.nodes
        : pageCount;

  const viewports = normaliseStringList(
    Array.isArray(issue.viewports) ? issue.viewports : [],
    issue.viewport,
    issue.viewportLabel,
    issue.viewportName
  );
  const browsers = normaliseStringList(
    issue.browsers,
    issue.browser,
    issue.projects,
    issue.projectName,
    issue.project
  );

  return {
    impact: issue.impact || 'info',
    label: message,
    pages,
    pageCount,
    nodesCount,
    viewports,
    browsers,
    samples: Array.isArray(issue.samples) ? issue.samples : [],
    wcagHtml: issue.wcagHtml,
    wcagBadge: issue.wcagBadge,
    wcagTags: Array.isArray(issue.wcagTags) ? issue.wcagTags : [],
    helpHtml: issue.helpHtml,
    helpUrl: issue.helpUrl,
    helpLabel: issue.helpLabel,
    ruleId:
      issue.ruleId ||
      issue.rule ||
      issue.id ||
      issue.auditId ||
      issue.checkId ||
      null,
    category: issue.category || issue.ruleCategory || issue.issueCategory || null,
    ruleLabel: issue.ruleLabel || issue.rule || issue.id || null,
    details: issue.details || message,
  };
};

const renderUnifiedIssuesTable = (
  issues,
  {
    title,
    emptyMessage,
    variant = 'gating',
    viewportLabel,
    includeWcagColumn = false,
    hydrate,
  } = {}
) => {
  if (!title) return '';

  const baseClass = [
    'summary-report summary-a11y summary-a11y--rule-table',
    variant === 'gating' ? 'summary-a11y--rule-table-gating' : 'summary-a11y--rule-table-advisory',
  ].join(' ');

  const hydrator = typeof hydrate === 'function' ? hydrate : defaultHydrateSuiteIssue;
  const normalisedRows = (Array.isArray(issues) ? issues : [])
    .map((issue) => {
      const hydrated = hydrator(issue, { variant, viewportLabel }) || null;
      if (!hydrated) return null;
      const pages = Array.isArray(hydrated.pages) ? hydrated.pages : [];
      const pageCount = Number.isFinite(hydrated.pageCount) ? hydrated.pageCount : pages.length;
      const nodesCount = Number.isFinite(hydrated.nodesCount)
        ? hydrated.nodesCount
        : Number.isFinite(hydrated.instanceCount)
          ? hydrated.instanceCount
          : Number.isFinite(hydrated.nodes)
            ? hydrated.nodes
            : pageCount;

      return {
        impact: String(hydrated.impact || 'info').toLowerCase(),
        label: ensureDisplayValue(hydrated.label || hydrated.message || hydrated.rule),
        pages,
        pageCount,
        nodesCount,
        viewports: normaliseStringList(hydrated.viewports),
        browsers: normaliseStringList(hydrated.browsers),
        samples: Array.isArray(hydrated.samples) ? hydrated.samples : [],
        wcagHtml: hydrated.wcagHtml,
        wcagBadge: hydrated.wcagBadge,
        wcagTags: Array.isArray(hydrated.wcagTags) ? hydrated.wcagTags : [],
        helpHtml: hydrated.helpHtml,
        helpUrl: hydrated.helpUrl,
        helpLabel: hydrated.helpLabel,
        ruleId: hydrated.ruleId || hydrated.rule || hydrated.id || null,
        category: hydrated.category || hydrated.ruleCategory || null,
        ruleLabel: hydrated.ruleLabel || hydrated.rule || hydrated.id || null,
        details: hydrated.details || hydrated.label || hydrated.message || '',
      };
    })
    .filter(Boolean);

  if (normalisedRows.length === 0) {
    return `
      <section class="${baseClass}">
        <h3>${escapeHtml(title)}</h3>
        <p class="details">${escapeHtml(emptyMessage || 'No issues detected.')}</p>
      </section>
    `;
  }

  const rowsHtml = normalisedRows
    .slice()
    .sort((a, b) => {
      const aCount = Number.isFinite(a.pageCount) ? a.pageCount : 0;
      const bCount = Number.isFinite(b.pageCount) ? b.pageCount : 0;
      if (bCount !== aCount) return bCount - aCount;
      return (a.label || '').localeCompare(b.label || '');
    })
    .map((row) => {
      const pageCountValue = Number.isFinite(row.pageCount) ? row.pageCount : row.pages.length;
      const hasManyPages = pageCountValue > 5 || row.pages.length > 5;
      const pagesList = hasManyPages
        ? `<span class="details-text">${escapeHtml(`${formatCount(pageCountValue)} pages`)}</span>`
        : renderCodeList(row.pages, '—');
      const browserList = renderCodeList(row.browsers, '—');
      const viewportsList = renderCodeList(
        formatViewportList(row.viewports),
        viewportLabel ? escapeHtml(viewportLabel) : '—'
      );
      const wcagHtml = (() => {
        if (!includeWcagColumn) return '';
        if (typeof row.wcagHtml === 'string' && row.wcagHtml.trim()) return row.wcagHtml;
        const tags = Array.isArray(row.wcagTags) ? row.wcagTags.filter(Boolean) : [];
        const badge = row.wcagBadge != null ? String(row.wcagBadge).trim() : '';
        if (tags.length > 0) {
          return renderComplianceCell(tags);
        }
        if (badge) {
          return `<span class="badge badge-wcag">${escapeHtml(badge)}</span>`;
        }
        return renderComplianceCell([]);
      })();
      const ruleLabel = ensureDisplayValue(row.ruleLabel || row.ruleId || row.label);
      const detailsText = row.details || row.label || '';
      const detailsContent = detailsText ? escapeHtml(detailsText) : '—';
      const helpLink =
        row.helpUrl && typeof row.helpUrl === 'string' && row.helpUrl.trim()
          ? `<br /><a class="details-link" href="${escapeHtml(
              row.helpUrl
            )}" target="_blank" rel="noopener noreferrer">Guidance</a>`
          : '';

      const cells = [
        `<td class="impact-cell"><span class="impact impact-${escapeHtml(
          row.impact
        )}">${escapeHtml(formatIssueImpactLabel(row.impact || 'info'))}</span></td>`,
        `<td>${escapeHtml(ruleLabel)}</td>`,
        `<td><span class="details-text">${detailsContent}</span>${helpLink}</td>`,
        `<td>${browserList}</td>`,
        `<td>${viewportsList}</td>`,
      ];

      cells.push(`<td>${pagesList}</td>`);
      cells.push(`<td>${escapeHtml(formatCount(row.nodesCount))}</td>`);

      if (includeWcagColumn) {
        cells.push(`<td>${wcagHtml || '—'}</td>`);
      }

      return `<tr class="impact-${escapeHtml(row.impact)}">${cells.join('')}</tr>`;
    })
    .join('');

  const headers = ['Impact', 'Rule', 'Details', 'Browser', 'Viewport', 'Pages', 'Nodes'];
  if (includeWcagColumn) headers.push('WCAG level');

  return `
    <section class="${baseClass}">
      <h3>${escapeHtml(title)}</h3>
      <table class="schema-table">
        <thead><tr>${headers.map((heading) => `<th>${escapeHtml(heading)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>
  `;
};

const renderSuiteGatingTable = (issues, options = {}) =>
  renderUnifiedIssuesTable(issues, {
    ...options,
    variant: 'gating',
  });

const renderSuiteAdvisoryTable = (issues, options = {}) =>
  renderUnifiedIssuesTable(issues, {
    ...options,
    variant: 'advisory',
  });

const renderSuiteFindingsBlock = ({
  gatingIssues = null,
  advisoryIssues = null,
  perPageEntries = null,
  gatingOptions = {},
  advisoryOptions = {},
  perPageOptions = {},
} = {}) => {
  const sections = [];
  if (Array.isArray(gatingIssues)) {
    sections.push(renderSuiteGatingTable(gatingIssues, gatingOptions));
  }
  if (Array.isArray(advisoryIssues)) {
    sections.push(renderSuiteAdvisoryTable(advisoryIssues, advisoryOptions));
  }
  if (Array.isArray(perPageEntries) && perPageEntries.length > 0) {
    sections.push(renderPerPageAccordion(perPageEntries, perPageOptions));
  }
  return assembleSuiteSections(sections);
};

const renderIssueSectionPair = ({
  gatingIssues = [],
  advisoryIssues = [],
  gatingTitle = 'Gating issues',
  advisoryTitle = 'Advisories',
  gatingEmptyMessage = 'No gating issues detected.',
  advisoryEmptyMessage = 'No advisories detected.',
  viewportLabel = null,
  includeWcagColumn = false,
  gatingHydrate = null,
  advisoryHydrate = null,
} = {}) => {
  const gatingCount = Array.isArray(gatingIssues) ? gatingIssues.length : 0;
  const advisoryCount = Array.isArray(advisoryIssues) ? advisoryIssues.length : 0;
  const sections = [
    renderSuiteGatingTable(gatingIssues, {
      title: formatUniqueRulesHeading(gatingTitle, gatingCount),
      emptyMessage: gatingEmptyMessage,
      viewportLabel,
      includeWcagColumn,
      hydrate: gatingHydrate,
    }),
    renderSuiteAdvisoryTable(advisoryIssues, {
      title: formatUniqueRulesHeading(advisoryTitle, advisoryCount),
      emptyMessage: advisoryEmptyMessage,
      viewportLabel,
      includeWcagColumn,
      hydrate: advisoryHydrate,
    }),
  ].filter(Boolean);

  return sections.join('\n');
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

const renderWcagBadgesLinked = (tags) => {
  const badges = renderWcagTagBadges(tags);
  const derived = deriveWcagHelpLink(tags || []);
  if (derived && derived.helpUrl) {
    return `<a href="${escapeHtml(derived.helpUrl)}" target="_blank" rel="noopener noreferrer">${badges}</a>`;
  }
  return badges;
};

const renderComplianceCell = (tags) => {
  if (Array.isArray(tags) && tags.length > 0) return renderWcagBadgesLinked(tags);
  return '<span class="badge badge-neutral">No WCAG mapping</span>';
};

const NORMALISED_VIEWPORT_LABELS = {
  chrome: 'Desktop',
  firefox: 'Desktop',
  safari: 'Desktop',
  'chrome mobile': 'Mobile',
  'chrome tablet': 'Tablet',
  'chrome desktop large': 'Desktop',
};

const formatViewportList = (values) => {
  const list = normaliseStringList(values);
  if (list.length === 0) return [];
  return list.map((value) => {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return value;
    return NORMALISED_VIEWPORT_LABELS[key] || value;
  });
};

module.exports = {
  MISSING_DATA_LABEL,
  ensureDisplayValue,
  ensurePageLabel,
  normaliseStringList,
  renderCodeList,
  renderRuleSnapshotsTable,
  renderUnifiedIssuesTable,
  renderSuiteGatingTable,
  renderSuiteAdvisoryTable,
  renderSuiteFindingsBlock,
  renderIssueSectionPair,
  formatUniqueRulesHeading,
  aggregatePageIssueEntries,
  deriveWcagHelpLink,
  renderComplianceCell,
  formatViewportList,
};
