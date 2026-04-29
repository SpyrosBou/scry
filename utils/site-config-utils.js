'use strict';

const trimTrailingSlash = (value) =>
  typeof value === 'string' ? value.replace(/\/+$/, '') : value;

const normaliseBaseUrlString = (value) => {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    if (parsed.pathname === '/') {
      parsed.pathname = '';
    }
    return trimTrailingSlash(parsed.toString());
  } catch (_error) {
    return trimTrailingSlash(String(value));
  }
};

const resolveUrl = (input, base) => {
  if (!input) return null;
  try {
    return new URL(input);
  } catch (_error) {
    if (!base) return null;
    try {
      return new URL(input, base);
    } catch (_error2) {
      return null;
    }
  }
};

const normaliseHost = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const stripWww = (host) => normaliseHost(host).replace(/^www\./, '');

const hostsShareBaseLabel = (a, b) => {
  if (!a || !b) return false;
  return stripWww(a) === stripWww(b);
};

function ensureHomepagePresence(
  pages,
  siteName,
  contextLabel = 'runtime',
  includeHomepage = true,
  logger = console
) {
  const sourceList = Array.isArray(pages) ? pages.filter((item) => typeof item === 'string') : [];
  const unique = Array.from(new Set(sourceList));

  if (unique.length === 0) {
    logger.log(
      `⚠️  ${contextLabel}: ${siteName} has no testPages configured; injecting '/' to keep coverage aligned.`
    );
    return ['/'];
  }

  if (includeHomepage === false) {
    return unique;
  }

  const hasRoot = unique.includes('/');
  if (!hasRoot) {
    logger.log(
      `⚠️  ${contextLabel}: ${siteName} testPages missing homepage '/'; injecting for this run.`
    );
    unique.unshift('/');
  } else if (unique[0] !== '/') {
    unique.splice(unique.indexOf('/'), 1);
    unique.unshift('/');
  }

  return unique;
}

module.exports = {
  ensureHomepagePresence,
  hostsShareBaseLabel,
  normaliseBaseUrlString,
  resolveUrl,
};
