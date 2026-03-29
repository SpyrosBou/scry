'use strict';

const fs = require('fs');
const path = require('path');

const SITES_DIR = path.join(__dirname, '..', 'sites');

const sanitiseSiteKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || '';

const deriveDisplayNameFromKey = (key) =>
  String(key || 'New Site')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

const normaliseBaseUrlInput = (input) => {
  if (!input) return '';
  const trimmed = String(input).trim();
  if (!trimmed) return '';

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    return '';
  }

  parsed.hash = '';
  parsed.search = '';

  let result = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  if (result.endsWith('/') && result.length > `${parsed.protocol}//${parsed.host}`.length) {
    result = result.replace(/\/+$/, '');
  }

  return result;
};

const canonicaliseBaseUrl = (input) => normaliseBaseUrlInput(input).toLowerCase();

function loadSiteInventory(dir = SITES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const siteKey = file.replace(/\.json$/, '');
      const filePath = path.join(dir, file);
      let baseUrl = '';
      let displayName = '';

      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.baseUrl === 'string') {
          baseUrl = normaliseBaseUrlInput(parsed.baseUrl);
        }
        if (typeof parsed.name === 'string') {
          displayName = parsed.name;
        }
      } catch (_error) {
        // ignore malformed configs; the filename still carries the key
      }

      return {
        key: siteKey,
        path: filePath,
        baseUrl,
        displayName,
      };
    });
}

function findSitesByBaseUrl(baseUrl, inventory) {
  const canonical = canonicaliseBaseUrl(baseUrl);
  if (!canonical) return [];
  return inventory.filter((entry) => canonicaliseBaseUrl(entry.baseUrl) === canonical);
}

function getSiteConfigPath(siteKey, dir = SITES_DIR) {
  return path.join(dir, `${siteKey}.json`);
}

function siteConfigExists(siteKey, dir = SITES_DIR) {
  return fs.existsSync(getSiteConfigPath(siteKey, dir));
}

module.exports = {
  SITES_DIR,
  sanitiseSiteKey,
  deriveDisplayNameFromKey,
  normaliseBaseUrlInput,
  canonicaliseBaseUrl,
  loadSiteInventory,
  findSitesByBaseUrl,
  getSiteConfigPath,
  siteConfigExists,
};
