'use strict';

const slugifyIdentifier = (value, { fallback = 'root' } = {}) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  fallback;

module.exports = {
  slugifyIdentifier,
};
