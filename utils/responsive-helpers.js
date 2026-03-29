/**
 * Responsive Testing Helpers for Scry
 *
 * Provides viewport-specific utilities, mobile interaction patterns,
 * and WordPress-responsive testing patterns following industry standards.
 *
 * @author Scry
 */

const { expect } = require('@playwright/test');

// Industry-standard viewport configurations
const VIEWPORTS = {
  mobile: {
    name: 'Mobile',
    width: 375,
    height: 667,
    deviceType: 'mobile',
    touchSupport: true,
    orientation: 'portrait',
  },
  tablet: {
    name: 'Tablet',
    width: 768,
    height: 1024,
    deviceType: 'tablet',
    touchSupport: true,
    orientation: 'portrait',
  },
  desktop: {
    name: 'Desktop',
    width: 1920,
    height: 1080,
    deviceType: 'desktop',
    touchSupport: false,
    orientation: 'landscape',
  },
};

// WordPress-specific responsive breakpoints (common theme patterns)
const WORDPRESS_BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  large: 1200,
  xlarge: 1400,
};

// Common WordPress mobile menu selectors across different themes
const MOBILE_MENU_SELECTORS = [
  '.menu-toggle', // Most WordPress themes
  '.hamburger', // Hamburger icon themes
  '.mobile-menu-toggle', // Custom mobile menus
  '.navbar-toggle', // Bootstrap-based themes
  '.mobile-nav-toggle', // Navigation-specific toggles
  '[data-toggle="mobile-menu"]', // Data attribute toggles
  '.js-mobile-menu-toggle', // JavaScript-based toggles
  '.menu-btn', // Generic menu button
  '#mobile-menu-button', // ID-based selectors
  '.responsive-menu-toggle', // Responsive menu plugins
];

// Critical responsive elements that should be visible/functional across viewports
const CRITICAL_RESPONSIVE_ELEMENTS = {
  navigation: [
    '.main-navigation',
    '#main-menu',
    'nav.navbar',
    '.primary-menu',
    '.navigation',
    '.nav-menu',
    '.site-navigation',
  ],
  header: ['header', '.site-header', '.main-header', '.header', '#header', '.top-header'],
  footer: ['footer', '.site-footer', '.main-footer', '.footer', '#footer', '.bottom-footer'],
  content: ['main', '.main-content', '.site-main', '.content', '#content', '.primary-content'],
};

/**
 * Get the current viewport information from page
 * @param {Page} page - Playwright page object
 * @returns {Object} Viewport information
 */
async function getViewportInfo(page) {
  const viewport = page.viewportSize();
  const deviceType = getDeviceType(viewport.width);

  return {
    ...viewport,
    deviceType,
    aspectRatio: (viewport.width / viewport.height).toFixed(2),
    isPortrait: viewport.height > viewport.width,
    isLandscape: viewport.width > viewport.height,
  };
}

/**
 * Determine device type based on viewport width
 * @param {number} width - Viewport width
 * @returns {string} Device type
 */
function getDeviceType(width) {
  if (width < WORDPRESS_BREAKPOINTS.tablet) return 'mobile';
  if (width < WORDPRESS_BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

/**
 * Check if element is visible in current viewport
 * @param {Locator} element - Playwright locator
 * @param {Object} options - Visibility options
 * @returns {boolean} Whether element is visible
 */
async function isElementVisibleInViewport(element, options = {}) {
  const { threshold = 0.1, waitForStable = true } = options;

  try {
    if (waitForStable) {
      await element.waitFor({ state: 'stable', timeout: 3000 });
    }

    const isVisible = await element.isVisible();
    if (!isVisible) return false;

    // Check if element is in viewport
    const boundingBox = await element.boundingBox();
    if (!boundingBox) return false;

    const viewport = await element.page().viewportSize();

    // Calculate intersection ratio
    const intersectionWidth = Math.max(
      0,
      Math.min(boundingBox.x + boundingBox.width, viewport.width) - Math.max(boundingBox.x, 0)
    );
    const intersectionHeight = Math.max(
      0,
      Math.min(boundingBox.y + boundingBox.height, viewport.height) - Math.max(boundingBox.y, 0)
    );
    const intersectionArea = intersectionWidth * intersectionHeight;
    const elementArea = boundingBox.width * boundingBox.height;

    return elementArea > 0 && intersectionArea / elementArea >= threshold;
  } catch (error) {
    console.log(`⚠️  Error checking element visibility: ${error.message}`);
    return false;
  }
}

/**
 * Find and interact with mobile menu toggle
 * @param {Page} page - Playwright page object
 * @param {Object} options - Interaction options
 * @returns {boolean} Whether mobile menu was successfully toggled
 */
async function toggleMobileMenu(page, options = {}) {
  const { timeout = 5000, expectMenuToOpen = true } = options;

  for (const selector of MOBILE_MENU_SELECTORS) {
    try {
      const menuToggle = page.locator(selector).first();

      // Check if toggle is visible and enabled
      const isVisible = await menuToggle.isVisible({ timeout: 1000 });
      if (!isVisible) continue;

      const isEnabled = await menuToggle.isEnabled({ timeout: 1000 });
      if (!isEnabled) continue;

      console.log(`📱 Found mobile menu toggle: ${selector}`);

      // Click the toggle
      await menuToggle.click({ timeout });

      if (expectMenuToOpen) {
        // Wait for menu to appear (look for common mobile menu containers)
        const mobileMenuSelectors = [
          '.mobile-menu',
          '.responsive-menu',
          '.mobile-navigation',
          '.nav-mobile',
          '.hamburger-menu',
          '.off-canvas-menu',
        ];

        let menuOpened = false;
        for (const menuSelector of mobileMenuSelectors) {
          try {
            await page.locator(menuSelector).waitFor({ state: 'visible', timeout: 2000 });
            console.log(`✅ Mobile menu opened: ${menuSelector}`);
            menuOpened = true;
            break;
          } catch (_error) {
            // Continue checking other selectors
          }
        }

        if (!menuOpened) {
          // Check if navigation menu became visible (some themes just show/hide nav)
          for (const navSelector of CRITICAL_RESPONSIVE_ELEMENTS.navigation) {
            try {
              const nav = page.locator(navSelector);
              const isVisible = await nav.isVisible({ timeout: 1000 });
              if (isVisible) {
                console.log(`✅ Navigation menu is visible: ${navSelector}`);
                menuOpened = true;
                break;
              }
            } catch (_error) {
              // Continue checking
            }
          }
        }

        return menuOpened;
      }

      return true;
    } catch (error) {
      console.log(`⚠️  Failed to interact with ${selector}: ${error.message}`);
      continue;
    }
  }

  console.log(`❌ No mobile menu toggle found among: ${MOBILE_MENU_SELECTORS.join(', ')}`);
  return false;
}

/**
 * Test responsive element visibility across viewports
 * @param {Page} page - Playwright page object
 * @param {string} elementType - Type of element (navigation, header, footer, content)
 * @param {Object} options - Testing options
 * @returns {Object} Test results
 */
async function testResponsiveElementVisibility(page, elementType, options = {}) {
  const { requireVisibility = true, customSelectors = [] } = options;
  const selectors =
    customSelectors.length > 0 ? customSelectors : CRITICAL_RESPONSIVE_ELEMENTS[elementType] || [];

  if (selectors.length === 0) {
    throw new Error(`No selectors defined for element type: ${elementType}`);
  }

  const viewportInfo = await getViewportInfo(page);
  const results = {
    elementType,
    viewport: viewportInfo,
    foundElements: [],
    visibleElements: [],
    errors: [],
  };

  for (const selector of selectors) {
    try {
      const elements = page.locator(selector);
      const count = await elements.count();

      if (count > 0) {
        results.foundElements.push({ selector, count });

        // Check visibility of first element
        const firstElement = elements.first();
        const isVisible = await isElementVisibleInViewport(firstElement);

        if (isVisible) {
          results.visibleElements.push({ selector, count });
          console.log(`✅ ${elementType} visible (${viewportInfo.deviceType}): ${selector}`);
        } else {
          console.log(
            `⚠️  ${elementType} found but not visible (${viewportInfo.deviceType}): ${selector}`
          );
        }
      }
    } catch (error) {
      results.errors.push({ selector, error: error.message });
      console.log(`❌ Error testing ${elementType} ${selector}: ${error.message}`);
    }
  }

  // Determine if test passes
  results.passed = results.visibleElements.length > 0 || !requireVisibility;

  if (requireVisibility && results.visibleElements.length === 0) {
    throw new Error(
      `No visible ${elementType} elements found in ${viewportInfo.deviceType} viewport. Tested selectors: ${selectors.join(', ')}`
    );
  }

  return results;
}

/**
 * Test form responsiveness
 * @param {Page} page - Playwright page object
 * @param {Object} formConfig - Form configuration from site config
 * @param {Object} options - Testing options
 * @returns {Object} Test results
 */
async function testFormResponsiveness(page, formConfig, options = {}) {
  const { testInteraction = true, fillTestData = true } = options;
  const viewportInfo = await getViewportInfo(page);

  const results = {
    formName: formConfig.name,
    viewport: viewportInfo,
    formVisible: false,
    fieldsAccessible: {},
    submitButtonAccessible: false,
    errors: [],
  };

  try {
    // Navigate to form page if specified
    if (formConfig.page && formConfig.page !== page.url()) {
      await page.goto(formConfig.page);
      await page.waitForLoadState('domcontentloaded');
    }

    // Check form container visibility
    const formContainer = page.locator(formConfig.selector).first();
    results.formVisible = await isElementVisibleInViewport(formContainer);

    if (!results.formVisible) {
      results.errors.push(`Form container not visible: ${formConfig.selector}`);
      return results;
    }

    console.log(`✅ Form container visible (${viewportInfo.deviceType}): ${formConfig.name}`);

    // Test form fields
    for (const [fieldName, fieldSelector] of Object.entries(formConfig.fields)) {
      try {
        const field = page.locator(fieldSelector).first();
        const isVisible = await isElementVisibleInViewport(field);
        const isEnabled = await field.isEnabled({ timeout: 2000 });

        results.fieldsAccessible[fieldName] = {
          visible: isVisible,
          enabled: isEnabled,
          accessible: isVisible && isEnabled,
        };

        if (isVisible && isEnabled) {
          console.log(`✅ Form field accessible (${viewportInfo.deviceType}): ${fieldName}`);

          // Test interaction on mobile/tablet (touch events)
          if (testInteraction && viewportInfo.deviceType !== 'desktop') {
            await field.focus({ timeout: 3000 });

            if (fillTestData) {
              const testValue =
                fieldName === 'email'
                  ? 'test@example.com'
                  : fieldName === 'name'
                    ? 'Test User'
                    : 'Test message for responsive testing';
              await field.fill(testValue, { timeout: 3000 });
            }
          }
        } else {
          console.log(
            `⚠️  Form field not accessible (${viewportInfo.deviceType}): ${fieldName} (visible: ${isVisible}, enabled: ${isEnabled})`
          );
        }
      } catch (error) {
        results.errors.push(`Field ${fieldName}: ${error.message}`);
        results.fieldsAccessible[fieldName] = { accessible: false, error: error.message };
      }
    }

    // Test submit button
    try {
      const submitButton = page.locator(formConfig.submitButton).first();
      const isVisible = await isElementVisibleInViewport(submitButton);
      const isEnabled = await submitButton.isEnabled({ timeout: 2000 });

      results.submitButtonAccessible = isVisible && isEnabled;

      if (results.submitButtonAccessible) {
        console.log(`✅ Submit button accessible (${viewportInfo.deviceType})`);
      } else {
        console.log(
          `⚠️  Submit button not accessible (${viewportInfo.deviceType}) (visible: ${isVisible}, enabled: ${isEnabled})`
        );
      }
    } catch (error) {
      results.errors.push(`Submit button: ${error.message}`);
    }
  } catch (error) {
    results.errors.push(`Form testing error: ${error.message}`);
  }

  return results;
}

/**
 * Capture responsive screenshot with intelligent naming
 * @param {Page} page - Playwright page object
 * @param {string} pageName - Name of the page being tested
 * @param {Object} options - Screenshot options
 * @returns {string} Screenshot filename
 */
async function captureResponsiveScreenshot(page, pageName, options = {}) {
  const {
    fullPage = true,
    element = null,
    threshold = { threshold: 0.3 }, // 30% difference threshold for responsive content
    siteName = 'unknown',
  } = options;

  const viewportInfo = await getViewportInfo(page);
  const browserName = page.context().browser().browserType().name();

  // Create descriptive filename
  const cleanPageName = pageName.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  const screenshotName = `${siteName}-${cleanPageName}-${viewportInfo.deviceType}-${browserName}`;

  const screenshotOptions = {
    fullPage: element ? false : fullPage,
    threshold,
    ...options,
  };

  try {
    if (element) {
      // Screenshot specific element
      const elementLocator = typeof element === 'string' ? page.locator(element).first() : element;
      await expect(elementLocator).toHaveScreenshot(
        `${screenshotName}-element.png`,
        screenshotOptions
      );
    } else {
      // Full page screenshot
      await expect(page).toHaveScreenshot(`${screenshotName}.png`, screenshotOptions);
    }

    console.log(`📸 Captured ${viewportInfo.deviceType} screenshot: ${screenshotName}`);
    return screenshotName;
  } catch (error) {
    console.log(`⚠️  Screenshot capture failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test WordPress responsive patterns (blocks, widgets, etc.)
 * @param {Page} page - Playwright page object
 * @param {Object} options - Testing options
 * @returns {Object} Test results
 */
async function testWordPressResponsivePatterns(page, options = {}) {
  const { testBlocks = true, testWidgets = true, testMenus = true } = options;
  const viewportInfo = await getViewportInfo(page);

  const results = {
    viewport: viewportInfo,
    blocks: {},
    widgets: {},
    menus: {},
    errors: [],
  };

  // Test Gutenberg blocks responsiveness
  if (testBlocks) {
    const blockSelectors = [
      '.wp-block',
      '.wp-block-group',
      '.wp-block-columns',
      '.wp-block-media-text',
      '.wp-block-gallery',
      '.wp-block-image',
      '.wp-block-cover',
    ];

    for (const selector of blockSelectors) {
      try {
        const blocks = page.locator(selector);
        const count = await blocks.count();

        if (count > 0) {
          const firstBlock = blocks.first();
          const isVisible = await isElementVisibleInViewport(firstBlock);

          results.blocks[selector] = {
            count,
            visible: isVisible,
            responsive: isVisible, // Simplified check - could be enhanced
          };

          console.log(
            `🧱 Block ${selector}: ${count} found, visible: ${isVisible} (${viewportInfo.deviceType})`
          );
        }
      } catch (error) {
        results.errors.push(`Block testing ${selector}: ${error.message}`);
      }
    }
  }

  // Test sidebar widgets responsiveness
  if (testWidgets) {
    const widgetSelectors = ['.widget', '.sidebar', '.widget-area', '.secondary', '#secondary'];

    for (const selector of widgetSelectors) {
      try {
        const widgets = page.locator(selector);
        const count = await widgets.count();

        if (count > 0) {
          const firstWidget = widgets.first();
          const isVisible = await isElementVisibleInViewport(firstWidget);

          results.widgets[selector] = {
            count,
            visible: isVisible,
            responsive: isVisible,
          };

          console.log(
            `🔧 Widget ${selector}: ${count} found, visible: ${isVisible} (${viewportInfo.deviceType})`
          );
        }
      } catch (error) {
        results.errors.push(`Widget testing ${selector}: ${error.message}`);
      }
    }
  }

  // Test menu responsiveness
  if (testMenus && viewportInfo.deviceType === 'mobile') {
    try {
      const mobileMenuWorking = await toggleMobileMenu(page, { expectMenuToOpen: true });
      results.menus.mobileMenuFunctional = mobileMenuWorking;
      console.log(`📱 Mobile menu functional: ${mobileMenuWorking}`);
    } catch (error) {
      results.errors.push(`Mobile menu testing: ${error.message}`);
      results.menus.mobileMenuFunctional = false;
    }
  }

  return results;
}

/**
 * Get responsive test configuration based on viewport
 * @param {string} deviceType - Device type (mobile, tablet, desktop)
 * @returns {Object} Test configuration
 */
function getResponsiveTestConfig(deviceType) {
  const baseConfig = {
    mobile: {
      testMobileMenu: true,
      testTouchInteractions: true,
      testFormUsability: true,
      screenshotFullPage: true,
      performanceThreshold: 3000, // 3 seconds for mobile
      criticalElementsRequired: ['header', 'content', 'footer'],
      optionalElements: ['navigation'], // Navigation might be hidden on mobile
    },
    tablet: {
      testMobileMenu: false,
      testTouchInteractions: true,
      testFormUsability: true,
      screenshotFullPage: true,
      performanceThreshold: 2500,
      criticalElementsRequired: ['header', 'navigation', 'content', 'footer'],
      optionalElements: [],
    },
    desktop: {
      testMobileMenu: false,
      testTouchInteractions: false,
      testFormUsability: true,
      screenshotFullPage: true,
      performanceThreshold: 2000,
      criticalElementsRequired: ['header', 'navigation', 'content', 'footer'],
      optionalElements: [],
    },
  };

  return baseConfig[deviceType] || baseConfig.desktop;
}

module.exports = {
  // Core responsive utilities
  VIEWPORTS,
  WORDPRESS_BREAKPOINTS,
  MOBILE_MENU_SELECTORS,
  CRITICAL_RESPONSIVE_ELEMENTS,

  // Viewport information
  getViewportInfo,
  getDeviceType,

  // Element testing
  isElementVisibleInViewport,
  testResponsiveElementVisibility,

  // Mobile interactions
  toggleMobileMenu,

  // Form testing
  testFormResponsiveness,

  // Screenshot utilities
  captureResponsiveScreenshot,

  // WordPress-specific testing
  testWordPressResponsivePatterns,

  // Configuration
  getResponsiveTestConfig,
};
