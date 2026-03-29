/* global window, document */

'use strict';

const LANDMARK_SELECTORS = {
  header: ['header', '.site-header', '.main-header', '.page-header'],
  navigation: [
    '[role="navigation"]',
    '[role="menubar"]',
    '[role="menu"]',
    'nav',
    '#main-nav',
    '#site-navigation',
    '.main-navigation',
    '.primary-navigation',
    '.primary-menu',
    '.top-bar .menu',
    '.top-bar-right .menu',
    'header .menu',
  ],
  content: [
    '[role="main"]',
    'main',
    '#main',
    '#primary',
    '#content',
    '.main-content',
    '.site-content',
    '.site-main',
    '.content-area',
    '.page-content',
    '.entry-content',
    'section[role="region"]',
    '.block',
    'body',
  ],
  footer: ['footer', '.site-footer', '.main-footer', '.page-footer'],
};

const MOBILE_MENU_SELECTORS = [
  '#mobile-burger',
  '.menu-toggle',
  '[aria-controls]',
  '.hamburger',
  '.navbar-toggler',
  '.menu-button',
  '[aria-label*="menu" i]',
];

const ERROR_PAGE_SELECTORS = [
  'text=/404/i',
  'text=/not found/i',
  'text=/page not found/i',
  '.error-404',
  '.not-found',
  '[class*="404"]',
];

const WP_LOADING_SELECTORS = '.loading, .spinner, .wp-block-placeholder';
const MOBILE_MENU_OPEN_SELECTORS = [
  '.menu-open',
  '.nav-open',
  '.mobile-menu-open',
  '[aria-expanded="true"]',
  '.is-active',
];

const isLocatorVisible = async (locator, timeout = 1000) => {
  try {
    return await locator.first().isVisible({ timeout });
  } catch (_error) {
    return false;
  }
};

const getFirstVisibleLocator = async (page, selectors, timeout = 1000) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await isLocatorVisible(locator, timeout)) {
      return { locator, selector };
    }
  }
  return null;
};

async function waitForWordPressReady(page) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (_error) {
    // Some pages continuously poll; continue with softer checks.
  }

  await page
    .waitForFunction(() => typeof window.jQuery === 'undefined' || window.jQuery.active === 0, {
      timeout: 5000,
    })
    .catch(() => {});

  await page
    .locator(WP_LOADING_SELECTORS)
    .first()
    .waitFor({ state: 'hidden', timeout: 3000 })
    .catch(() => {});
}

async function detect404LikePage(page) {
  for (const selector of ERROR_PAGE_SELECTORS) {
    if (await isLocatorVisible(page.locator(selector), 1000)) {
      return true;
    }
  }
  return false;
}

async function getPageTitle(page) {
  try {
    return await page.title();
  } catch (_error) {
    return '';
  }
}

async function collectCriticalElements(page) {
  const [header, navigation, content, footer] = await Promise.all([
    getFirstVisibleLocator(page, LANDMARK_SELECTORS.header, 2000),
    getFirstVisibleLocator(page, LANDMARK_SELECTORS.navigation, 2000),
    getFirstVisibleLocator(page, LANDMARK_SELECTORS.content, 2000),
    getFirstVisibleLocator(page, LANDMARK_SELECTORS.footer, 2000),
  ]);

  return {
    header: Boolean(header),
    navigation: Boolean(navigation),
    content: Boolean(content),
    footer: Boolean(footer),
  };
}

async function openMobileNavigation(page, options = {}) {
  const { timeout = 3000 } = options;
  const match = await getFirstVisibleLocator(page, MOBILE_MENU_SELECTORS, 1000);
  if (!match) {
    return { found: false, opened: false, selector: null };
  }

  const { locator, selector } = match;
  const navVisibleBefore = Boolean(
    await getFirstVisibleLocator(page, LANDMARK_SELECTORS.navigation, 1000)
  );

  try {
    await locator.click({ timeout });
    await page
      .waitForFunction(
        ({ toggleSelector, openSelectors, navSelectors }) => {
          const toggle = document.querySelector(toggleSelector);
          if (toggle && toggle.getAttribute('aria-expanded') === 'true') return true;

          const isVisible = (element) => {
            if (!element) return false;
            const styles = window.getComputedStyle(element);
            if (styles.visibility === 'hidden' || styles.display === 'none') return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };

          if (
            openSelectors.some((openSelector) => isVisible(document.querySelector(openSelector)))
          ) {
            return true;
          }

          return navSelectors.some((navSelector) => isVisible(document.querySelector(navSelector)));
        },
        {
          toggleSelector: selector,
          openSelectors: MOBILE_MENU_OPEN_SELECTORS,
          navSelectors: LANDMARK_SELECTORS.navigation,
        },
        { timeout }
      )
      .catch(() => {});
  } catch (_error) {
    return { found: true, opened: false, selector };
  }

  const navVisibleAfter = Boolean(
    await getFirstVisibleLocator(page, LANDMARK_SELECTORS.navigation, 1000)
  );
  return {
    found: true,
    opened: navVisibleAfter || navVisibleBefore,
    selector,
  };
}

module.exports = {
  MOBILE_MENU_SELECTORS,
  collectCriticalElements,
  detect404LikePage,
  getPageTitle,
  openMobileNavigation,
  waitForWordPressReady,
};
