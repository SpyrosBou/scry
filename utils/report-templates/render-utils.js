'use strict';

const { escapeHtml, formatCount, formatPercentage } = require('../report-template-helpers');
const { renderSummaryMetrics } = require('../reporting-utils');

const MISSING_DATA_LABEL = 'DATA MISSING';

const ensureDisplayValue = (value, fallback = MISSING_DATA_LABEL) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  return value;
};

const ensurePageLabel = (value) => ensureDisplayValue(value);

const renderCodeList = (values, fallback = MISSING_DATA_LABEL) => {
  const list = new Set();
  (Array.isArray(values) ? values : [values]).forEach((value) => {
    if (value === null || value === undefined) return;
    const trimmed = String(value).trim();
    if (trimmed) list.add(trimmed);
  });
  if (list.size === 0) return fallback;
  return Array.from(list)
    .map((value) => `<code>${escapeHtml(value)}</code>`)
    .join('<br />');
};

const formatMillisecondsDisplay = (value) => {
  if (!Number.isFinite(value)) return MISSING_DATA_LABEL;
  if (value >= 1000) {
    const seconds = value / 1000;
    return `${seconds.toFixed(1)}s`;
  }
  return `${Math.round(value)}ms`;
};

const formatPercentValue = (value) => {
  if (value === null || value === undefined) return MISSING_DATA_LABEL;
  const numeric = Math.abs(value) <= 1 ? value * 100 : value;
  return formatPercentage(numeric);
};

module.exports = {
  MISSING_DATA_LABEL,
  ensureDisplayValue,
  ensurePageLabel,
  renderCodeList,
  renderSummaryMetrics,
  formatMillisecondsDisplay,
  formatPercentValue,
  formatCount,
  escapeHtml,
};
