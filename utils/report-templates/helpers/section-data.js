const { ensurePageLabel, normaliseStringList, deriveWcagHelpLink } = require('./render-primitives');

const collectIssueMessages = (pages, fields, defaultImpact, options = {}) => {
  if (!Array.isArray(pages) || pages.length === 0) return [];
  const fieldList = Array.isArray(fields) ? fields : [fields];
  const normalizeFn = typeof options.normalize === 'function' ? options.normalize : null;
  const dedupeIgnoreImpact = Boolean(options.dedupeIgnoreImpact);

  const map = new Map();

  const pushString = (set, value) => {
    if (!value && value !== 0) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    set.add(trimmed);
  };

  for (const page of pages) {
  const pageId = ensurePageLabel(page?.page);
    const pageProject =
      page?.browser ||
      page?.projectName ||
      page?.project ||
      (Array.isArray(page?.projects) ? page.projects[0] : null);
    const pageViewport =
      page?.viewport ||
      page?.viewportLabel ||
      (Array.isArray(page?.viewports) ? page.viewports[0] : null) ||
      pageProject;
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
        let ruleId = null;
        let ruleLabel = null;

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
          if (rawItem.ruleId) ruleId = rawItem.ruleId;
          if (!ruleId && rawItem.id) ruleId = rawItem.id;
          if (!ruleId && rawItem.rule) ruleId = rawItem.rule;
          if (rawItem.rule) ruleLabel = rawItem.rule;
          if (!ruleLabel && rawItem.id) ruleLabel = rawItem.id;
          if (rawItem.ruleLabel) ruleLabel = rawItem.ruleLabel;
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
        let normalizedProjects = null;
        let normalizedViewports = null;
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
            if (Array.isArray(normalized.wcagTags)) wcagTags = normalized.wcagTags.slice();
            if (normalized.wcagBadge) wcagBadge = normalized.wcagBadge;
            if (normalized.ruleId) ruleId = normalized.ruleId;
            if (normalized.ruleLabel) ruleLabel = normalized.ruleLabel;
            if (Array.isArray(normalized.projects)) normalizedProjects = normalized.projects;
            if (Array.isArray(normalized.viewports)) normalizedViewports = normalized.viewports;
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
            projects: new Set(),
            viewports: new Set(),
            ruleId: null,
            ruleLabel: null,
          });
        }

        const entry = map.get(key);
        entry.message = displayMessage;
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
        if (ruleId && !entry.ruleId) {
          entry.ruleId = String(ruleId);
        }
        if (ruleLabel && !entry.ruleLabel) {
          entry.ruleLabel = String(ruleLabel);
        }
        const ensureProjectSet = entry.projects;
        const ensureViewportSet = entry.viewports;
        if (Array.isArray(normalizedProjects)) {
          normalizedProjects.forEach((value) => pushString(ensureProjectSet, value));
        }
        if (Array.isArray(normalizedViewports)) {
          normalizedViewports.forEach((value) => pushString(ensureViewportSet, value));
        }
        if (pageProject) pushString(ensureProjectSet, pageProject);
        if (pageViewport) pushString(ensureViewportSet, pageViewport);
        if (rawItem && typeof rawItem === 'object') {
          if (rawItem.projectName || rawItem.project) {
            pushString(ensureProjectSet, rawItem.projectName || rawItem.project);
          }
          if (rawItem.browser) {
            pushString(ensureProjectSet, rawItem.browser);
          }
          if (rawItem.viewport) {
            pushString(ensureViewportSet, rawItem.viewport);
          }
          if (Array.isArray(rawItem.projects)) {
            rawItem.projects.forEach((value) => pushString(ensureProjectSet, value));
          }
          if (Array.isArray(rawItem.viewports)) {
            rawItem.viewports.forEach((value) => pushString(ensureViewportSet, value));
          }
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
      projects: Array.from(entry.projects || []).filter(Boolean),
      viewports: Array.from(entry.viewports || []).filter(Boolean),
      ruleId: entry.ruleId,
      ruleLabel: entry.ruleLabel,
    };
  });
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

const firstRunPayload = (bucket) =>
  bucket.runEntries.find((entry) => Boolean(entry?.payload))?.payload || null;

;

;

module.exports = {
  collectIssueMessages,
  collectSchemaProjects,
  summaryTypeFromGroup,
  firstRunPayload,
};
