'use strict';

const ACTIVE_SUMMARY_TYPES = [
  'wcag',
  'forms',
  'keyboard',
  'structure',
  'reduced-motion',
  'reflow',
  'iframe-metadata',
  'internal-links',
  'interactive',
  'availability',
  'http',
  'performance',
  'responsive-structure',
  'responsive-consistency',
  'wp-features',
  'visual',
];

const STANDARD_FINDING_SUMMARY_TYPES = [
  'forms',
  'keyboard',
  'reduced-motion',
  'reflow',
  'iframe-metadata',
  'structure',
  'interactive',
  'internal-links',
  'availability',
  'http',
  'performance',
  'responsive-structure',
  'wp-features',
  'visual',
];

module.exports = {
  ACTIVE_SUMMARY_TYPES,
  STANDARD_FINDING_SUMMARY_TYPES,
};
