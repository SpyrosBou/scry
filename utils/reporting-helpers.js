'use strict';
const slugifyIdentifier = (value, { fallback = 'root' } = {}) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;

const createSummaryBaseName = (...parts) =>
  parts
    .filter((part) => part !== undefined && part !== null && String(part).trim().length > 0)
    .map((part, index) =>
      slugifyIdentifier(part, {
        fallback: index === 0 ? 'summary' : 'section',
      })
    )
    .join('-');

module.exports = {
  slugifyIdentifier,
  createSummaryBaseName,
};
