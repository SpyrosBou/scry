'use strict';

const { createRunSummaryPayload, createPageSummaryPayload } = require('./report-schema');
const { createSummaryBaseName } = require('./reporting-helpers');

const buildRunSummaryPayload = ({
  prefix,
  key,
  title,
  overview = {},
  metadata = {},
  ruleSnapshots = [],
  details = null,
}) => {
  const baseName = createSummaryBaseName(
    prefix,
    key || metadata.projectName || metadata.siteName || 'run'
  );
  const payload = createRunSummaryPayload({
    baseName,
    title,
    overview,
    ruleSnapshots,
    metadata,
  });
  if (details) {
    payload.details = details;
  }
  return payload;
};

const buildPageSummaryPayload = ({
  prefix,
  projectName,
  viewport,
  page,
  title,
  summary,
  metadata = {},
}) => {
  const baseName = createSummaryBaseName(prefix, projectName, viewport, page);
  return createPageSummaryPayload({
    baseName,
    title,
    page,
    viewport,
    summary,
    metadata,
  });
};

module.exports = {
  buildRunSummaryPayload,
  buildPageSummaryPayload,
};
