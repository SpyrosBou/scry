const {
  SCHEMA_ID,
  SCHEMA_VERSION,
  KIND_RUN_SUMMARY,
  KIND_PAGE_SUMMARY,
} = require('./report-schema');
const { ACTIVE_SUMMARY_TYPES, STANDARD_FINDING_SUMMARY_TYPES } = require('./report-summary-types');

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normaliseKey = (key) => String(key || '');

const SUMMARY_TYPES_WITH_STANDARD_FINDINGS = new Set(STANDARD_FINDING_SUMMARY_TYPES);
const KNOWN_SUMMARY_TYPES = new Set(ACTIVE_SUMMARY_TYPES);

const REQUIRED_FINDING_KEYS = ['gating', 'warnings', 'advisories', 'notes'];

const validateOverview = (overview, errors) => {
  if (overview == null) return;
  if (!isPlainObject(overview)) {
    errors.push('`overview` must be an object when provided.');
  }
};

const validateRuleSnapshots = (snapshots, errors) => {
  if (snapshots == null) return;
  if (!Array.isArray(snapshots)) {
    errors.push('`ruleSnapshots` must be an array when provided.');
    return;
  }
  snapshots.forEach((snapshot, index) => {
    if (!isPlainObject(snapshot)) {
      errors.push(`ruleSnapshots[${index}] must be an object.`);
      return;
    }
    if (!snapshot.rule) {
      errors.push(`ruleSnapshots[${index}].rule is required.`);
    }
    if (snapshot.pages && !Array.isArray(snapshot.pages)) {
      errors.push(`ruleSnapshots[${index}].pages must be an array when provided.`);
    }
    if (snapshot.viewports && !Array.isArray(snapshot.viewports)) {
      errors.push(`ruleSnapshots[${index}].viewports must be an array when provided.`);
    }
  });
};

const validateMetadata = (metadata, errors) => {
  if (metadata == null) return;
  if (!isPlainObject(metadata)) {
    errors.push('`metadata` must be an object when provided.');
    return;
  }

  const summaryType = metadata.summaryType;
  if (!summaryType) {
    errors.push('`metadata.summaryType` is required.');
    return;
  }

  if (!KNOWN_SUMMARY_TYPES.has(summaryType)) {
    errors.push(`Unsupported metadata.summaryType: ${normaliseKey(summaryType)}.`);
  }
};

const validateRunSummary = (payload, errors) => {
  if (!payload.baseName) {
    errors.push('`baseName` is required for run summary payloads.');
  }
  if (payload.htmlBody != null) {
    errors.push('`htmlBody` is no longer supported on report summary payloads.');
  }
  if (payload.markdownBody != null) {
    errors.push('`markdownBody` is no longer supported on report summary payloads.');
  }
  validateOverview(payload.overview, errors);
  validateRuleSnapshots(payload.ruleSnapshots, errors);
  validateMetadata(payload.metadata, errors);
};

const validatePageSummary = (payload, errors) => {
  if (!payload.baseName) {
    errors.push('`baseName` is required for page summary payloads.');
  }
  if (!payload.page) {
    errors.push('`page` is required for page summary payloads.');
  }
  if (!payload.viewport) {
    errors.push('`viewport` is required for page summary payloads.');
  }
  if (payload.summary != null && !isPlainObject(payload.summary)) {
    errors.push('`summary` must be an object when provided for page summaries.');
  }
  if (isPlainObject(payload.summary)) {
    if (payload.summary.cardHtml != null) {
      errors.push('`summary.cardHtml` is no longer supported.');
    }
    if (payload.summary.cardMarkdown != null) {
      errors.push('`summary.cardMarkdown` is no longer supported.');
    }
    const summaryType = payload.metadata && payload.metadata.summaryType;
    if (SUMMARY_TYPES_WITH_STANDARD_FINDINGS.has(summaryType)) {
      REQUIRED_FINDING_KEYS.forEach((key) => {
        if (!Array.isArray(payload.summary[key])) {
          errors.push(`summary.${key} must be an array for "${summaryType}" page summaries.`);
        }
      });
    }
  }
  validateMetadata(payload.metadata, errors);
};

const validateReportSummaryPayload = (payload) => {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { valid: false, errors: ['Payload must be an object.'] };
  }

  if (payload.schema !== SCHEMA_ID) {
    errors.push(`Expected schema "${SCHEMA_ID}" (received ${normaliseKey(payload.schema)}).`);
  }

  if (payload.version !== SCHEMA_VERSION) {
    errors.push(`Expected version ${SCHEMA_VERSION} (received ${normaliseKey(payload.version)}).`);
  }

  if (!payload.kind) {
    errors.push('`kind` is required.');
  }

  if (payload.kind === KIND_RUN_SUMMARY) {
    validateRunSummary(payload, errors);
  } else if (payload.kind === KIND_PAGE_SUMMARY) {
    validatePageSummary(payload, errors);
  } else {
    errors.push(`Unsupported payload kind: ${normaliseKey(payload.kind)}.`);
  }

  return { valid: errors.length === 0, errors };
};

const assertReportSummaryPayload = (payload) => {
  const { valid, errors } = validateReportSummaryPayload(payload);
  if (!valid) {
    const message = errors.join(' ');
    throw new Error(`Invalid report summary payload: ${message}`);
  }
};

module.exports = {
  validateReportSummaryPayload,
  assertReportSummaryPayload,
};
