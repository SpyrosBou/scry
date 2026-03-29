/* eslint-env node, browser */
/* global window */
/**
 * WordPress Page Object Model
 *
 * Industry-standard page objects for common WordPress elements using semantic testing patterns.
 * Follows @testing-library principles for accessible and maintainable tests.
 *
 * USAGE EXAMPLES:
 *
 * // Basic usage in test files:
 * const { WordPressPageObjects } = require('../utils/wordpress-page-objects');
 *
 * test.beforeEach(async ({ page }) => {
 *   wpPageObjects = new WordPressPageObjects(page, siteConfig);
 * });
 *
 * // Navigation with built-in WordPress error handling:
 * const response = await wpPageObjects.navigate('https://site.com/page');
 * const is404 = await wpPageObjects.is404Page();
 *
 * // Form testing with semantic queries and automatic fallbacks:
 * const form = wpPageObjects.createForm(siteConfig.forms[0]);
 * await form.fillForm({ name: 'Test User', email: 'test@example.com' });
 * const validationWorks = await form.testValidation();
 *
 * // WordPress page structure verification:
 * const elements = await wpPageObjects.verifyCriticalElements();
 * // Returns: { header: true, navigation: true, content: true, footer: true }
 *
 * @author Scry
 */

const { expect } = require('@playwright/test');

/**
 * Base WordPress Page Object
 * Provides common functionality for all WordPress pages
 */
class WordPressBasePage {
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to a page with error handling and validation
   * @param {string} url - Full URL to navigate to
   * @param {Object} options - Navigation options
   */
  async navigate(url, options = {}) {
    const defaultOptions = {
      timeout: 20000,
      waitUntil: 'domcontentloaded',
      ...options,
    };

    const response = await this.page.goto(url, defaultOptions);

    if (response?.status() >= 400) {
      throw new Error(`Page not found: ${url} (Status: ${response.status()})`);
    }

    // Wait for WordPress-specific indicators that page is ready
    await this.waitForWordPressReady();
    return response;
  }

  /**
   * Wait for WordPress page to be fully loaded
   * Includes checking for common WordPress loading indicators
   */
  async waitForWordPressReady() {
    try {
      // Wait for network idle
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });

      // Wait for jQuery if present (common in WordPress)
      await this.page
        .waitForFunction(
          () => {
            return typeof window.jQuery === 'undefined' || window.jQuery.active === 0;
          },
          { timeout: 5000 }
        )
        .catch(() => {
          // jQuery not present or still active, continue anyway
        });

      // Wait for common WordPress loading indicators to disappear
      await this.page
        .waitForSelector('.loading, .spinner, .wp-block-placeholder', {
          state: 'hidden',
          timeout: 3000,
        })
        .catch(() => {
          // Loading indicators not present, continue anyway
        });
    } catch (error) {
      console.log(`⚠️  WordPress ready check timeout: ${error.message}`);
      // Don't fail the test, just log the issue
    }
  }

  /**
   * Get page title using semantic approach
   */
  async getTitle() {
    return await this.page.title();
  }

  /**
   * Check if page is a 404 error page
   */
  async is404Page() {
    // Check for common 404 indicators
    const indicators = [
      'text=/404/i',
      'text=/not found/i',
      'text=/page not found/i',
      '.error-404',
      '.not-found',
      '[class*="404"]',
    ];

    for (const indicator of indicators) {
      try {
        const element = await this.page.locator(indicator).first();
        if (await element.isVisible({ timeout: 1000 })) {
          return true;
        }
      } catch (_error) {
        // Continue checking other indicators
      }
    }

    return false;
  }
}

/**
 * WordPress Navigation Component
 * Handles main navigation, mobile menus, and breadcrumbs
 */
class WordPressNavigation {
  constructor(page) {
    this.page = page;
  }

  /**
   * Get main navigation using semantic queries
   * Tries multiple approaches to find navigation
   */
  getMainNavigation() {
    const selectorCandidates = [
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
    ];

    const visibleSelectors = selectorCandidates.map((selector) => `${selector}:visible`);
    const visibleLocator = this.page.locator(visibleSelectors.join(', ')).first();
    const fallbackLocator = this.page.locator(selectorCandidates.join(', ')).first();
    return visibleLocator.or(fallbackLocator);
  }

  /**
   * Get navigation links using semantic approach
   */
  getNavigationLinks() {
    return this.getMainNavigation().getByRole('link');
  }

  /**
   * Click a navigation link by text (semantic approach)
   * @param {string} linkText - Text or regex pattern to match
   */
  async clickNavigationLink(linkText) {
    const nav = this.getMainNavigation();
    const link = nav.getByRole('link', { name: new RegExp(linkText, 'i') });
    await expect(link).toBeVisible({ timeout: 10000 });
    await link.click();
  }

  /**
   * Get mobile menu toggle button
   * Uses multiple selectors to handle different themes
   */
  getMobileMenuToggle() {
    return this.page
      .getByRole('button', { name: /menu|toggle|hamburger|navigation/i })
      .or(this.page.locator('.menu-toggle, .hamburger, .mobile-menu-toggle, [aria-label*="menu"]'))
      .first();
  }

  /**
   * Toggle mobile menu
   * @param {boolean} open - true to open, false to close, undefined to toggle
   */
  async toggleMobileMenu(open = undefined) {
    const toggle = this.getMobileMenuToggle();

    if (!(await toggle.isVisible())) {
      throw new Error('Mobile menu toggle not visible');
    }

    const isCurrentlyOpen = await this.isMobileMenuOpen();

    if (open === undefined || open !== isCurrentlyOpen) {
      await toggle.click();
      await this.page.waitForTimeout(500); // Wait for animation
    }
  }

  /**
   * Check if mobile menu is currently open
   */
  async isMobileMenuOpen() {
    // Check for common mobile menu open indicators
    const openIndicators = [
      '.menu-open',
      '.nav-open',
      '.mobile-menu-open',
      '[aria-expanded="true"]',
      '.is-active',
    ];

    for (const indicator of openIndicators) {
      try {
        const element = this.page.locator(indicator).first();
        if (await element.isVisible({ timeout: 1000 })) {
          return true;
        }
      } catch (_error) {
        // Continue checking
      }
    }

    return false;
  }

  /**
   * Verify navigation accessibility
   */
  async verifyAccessibility() {
    const nav = this.getMainNavigation();

    const navElement = nav.first();
    const role = (await navElement.getAttribute('role')) || '';
    if (!role) {
      console.warn('⚠️  Navigation missing explicit role attribute');
    } else if (!['navigation', 'menubar', 'menu'].includes(role)) {
      console.warn(`⚠️  Navigation role is '${role}', expected navigation/menubar/menu`);
    }

    // Check that navigation has accessible name
    const ariaLabel = await navElement.getAttribute('aria-label');
    const ariaLabelledBy = await navElement.getAttribute('aria-labelledby');

    if (!ariaLabel && !ariaLabelledBy) {
      console.warn('⚠️  Navigation missing aria-label or aria-labelledby');
    }
  }
}

/**
 * WordPress Form Component
 * Handles Contact Form 7, Gravity Forms, and custom forms
 */
class WordPressForm {
  constructor(page, formConfig) {
    this.page = page;
    this.config = formConfig;
  }

  /**
   * Get form element using multiple approaches
   */
  getForm() {
    if (this.config.selector) {
      return this.page.locator(this.config.selector).first();
    }

    // Try semantic approach first
    return this.page
      .getByRole('form')
      .first()
      .or(this.page.locator('form, .wpcf7-form, .gform_wrapper, .contact-form'))
      .first();
  }

  /**
   * Get form field using semantic queries with fallback
   * @param {string} fieldType - Type of field (name, email, message, etc.)
   * @param {string} fallbackSelector - CSS selector fallback
   */
  getField(fieldType, fallbackSelector = null) {
    const semanticSelectors = {
      name: () => this.page.getByRole('textbox', { name: /name|your.name|full.name/i }),
      email: () => this.page.getByRole('textbox', { name: /email|e.mail|email.address/i }),
      message: () => this.page.getByRole('textbox', { name: /message|comment|inquiry|details/i }),
      phone: () => this.page.getByRole('textbox', { name: /phone|telephone|mobile/i }),
      subject: () => this.page.getByRole('textbox', { name: /subject|topic|regarding/i }),
    };

    const semanticSelector = semanticSelectors[fieldType];

    if (semanticSelector) {
      let locator = semanticSelector();

      if (fallbackSelector) {
        locator = locator.or(this.page.locator(fallbackSelector));
      }

      return locator.first();
    }

    // If no semantic selector available, use fallback
    return fallbackSelector ? this.page.locator(fallbackSelector).first() : null;
  }

  /**
   * Get submit button using semantic queries
   */
  getSubmitButton() {
    return this.page
      .getByRole('button', { name: /submit|send|contact|get.in.touch/i })
      .or(this.page.locator('input[type="submit"], button[type="submit"], .submit-button'))
      .first();
  }

  /**
   * Fill form with test data
   * @param {Object} data - Form data to fill
   */
  async fillForm(data) {
    const form = this.getForm();
    await expect(form).toBeVisible({ timeout: 10000 });

    // Fill each field that has data and exists
    const fieldMappings = {
      name: ['name', 'fullName', 'firstName'],
      email: ['email', 'emailAddress'],
      message: ['message', 'comment', 'inquiry'],
      phone: ['phone', 'telephone', 'mobile'],
      subject: ['subject', 'topic'],
    };

    for (const [fieldType, dataKeys] of Object.entries(fieldMappings)) {
      const dataValue = dataKeys.find((key) => data[key]);

      if (dataValue && data[dataValue]) {
        try {
          const field = this.getField(fieldType, this.config.fields?.[fieldType]);
          if (field && (await field.isVisible({ timeout: 2000 }))) {
            await field.fill(data[dataValue]);
            await field.blur(); // Trigger validation
          }
        } catch (error) {
          console.log(`⚠️  Could not fill ${fieldType} field: ${error.message}`);
        }
      }
    }
  }

  /**
   * Submit form and handle various response scenarios
   */
  async submit() {
    const submitButton = this.getSubmitButton();
    await expect(submitButton).toBeVisible({ timeout: 10000 });
    await submitButton.click();

    // Wait for form submission to process
    await this.page.waitForLoadState('domcontentloaded');

    // Check for common form response indicators
    return await this.getSubmissionStatus();
  }

  /**
   * Determine form submission status
   */
  async getSubmissionStatus() {
    const successIndicators = [
      'text=/thank you/i',
      'text=/message sent/i',
      'text=/successfully submitted/i',
      '.wpcf7-mail-sent-ok',
      '.gform_confirmation_message',
      '.success-message',
    ];

    const errorIndicators = [
      'text=/error/i',
      'text=/failed/i',
      'text=/required/i',
      '.wpcf7-validation-errors',
      '.gform_validation_errors',
      '.error-message',
    ];

    // Check for success first
    for (const indicator of successIndicators) {
      try {
        const element = this.page.locator(indicator).first();
        if (await element.isVisible({ timeout: 3000 })) {
          return 'success';
        }
      } catch (_error) {
        // Continue checking
      }
    }

    // Check for errors
    for (const indicator of errorIndicators) {
      try {
        const element = this.page.locator(indicator).first();
        if (await element.isVisible({ timeout: 3000 })) {
          return 'error';
        }
      } catch (_error) {
        // Continue checking
      }
    }

    return 'unknown';
  }

  /**
   * Test form validation by submitting empty form
   */
  async testValidation() {
    const form = this.getForm();
    await expect(form).toBeVisible({ timeout: 10000 });

    // Clear all fields first
    const fields = await form.locator('input, textarea, select').all();
    for (const field of fields) {
      try {
        const fieldType = await field.getAttribute('type');
        if (!['submit', 'button', 'hidden'].includes(fieldType)) {
          await field.fill('');
        }
      } catch (_error) {
        // Continue with next field
      }
    }

    // Try to submit empty form
    const submitButton = this.getSubmitButton();
    await submitButton.click();
    await this.page.waitForTimeout(1000);

    // Form should still be visible (validation should prevent submission)
    await expect(form).toBeVisible();

    const status = await this.getSubmissionStatus();
    return status === 'error' || status === 'unknown'; // Validation working if error or no success
  }
}

/**
 * WordPress Header Component
 * Handles site header elements like logo, search, user menu
 */
class WordPressHeader {
  constructor(page) {
    this.page = page;
  }

  /**
   * Get header element
   */
  getHeader() {
    return this.page.locator('header, .site-header, .main-header, .page-header').first();
  }

  /**
   * Get site logo/title
   */
  getSiteLogo() {
    return this.page
      .getByRole('img', { name: /logo|site/i })
      .or(this.page.locator('.site-logo, .logo, .custom-logo'))
      .first();
  }

  /**
   * Get site title link
   */
  getSiteTitle() {
    return this.page
      .getByRole('link', { name: /home|site.title/i })
      .or(this.page.locator('.site-title, .site-name, h1 a'))
      .first();
  }

  /**
   * Get search form
   */
  getSearchForm() {
    return this.page
      .getByRole('search')
      .or(this.page.locator('.search-form, .searchform, form[role="search"]'))
      .first();
  }

  /**
   * Perform search
   * @param {string} query - Search query
   */
  async search(query) {
    const searchForm = this.getSearchForm();

    if (!(await searchForm.isVisible())) {
      throw new Error('Search form not found');
    }

    const searchInput = searchForm
      .getByRole('searchbox')
      .or(searchForm.locator('input[type="search"], input[name*="search"], input.search-field'))
      .first();

    await searchInput.fill(query);
    await searchInput.press('Enter');
  }
}

/**
 * WordPress Footer Component
 * Handles footer elements like copyright, links, widgets
 */
class WordPressFooter {
  constructor(page) {
    this.page = page;
  }

  /**
   * Get footer element
   */
  getFooter() {
    return this.page.locator('footer, .site-footer, .main-footer, .page-footer').first();
  }

  /**
   * Get footer links
   */
  getFooterLinks() {
    return this.getFooter().getByRole('link');
  }

  /**
   * Get copyright text
   */
  getCopyrightText() {
    return this.getFooter().locator('text=/copyright|©/i').first();
  }

  /**
   * Verify footer is visible and has expected content
   */
  async verifyFooterContent() {
    const footer = this.getFooter();
    await expect(footer).toBeVisible({ timeout: 10000 });

    const links = this.getFooterLinks();
    const linkCount = await links.count();

    if (linkCount === 0) {
      console.warn('⚠️  Footer has no links');
    }

    return {
      isVisible: true,
      linkCount: linkCount,
    };
  }
}

/**
 * WordPress Content Area Component
 * Handles main content, posts, pages
 */
class WordPressContent {
  constructor(page) {
    this.page = page;
  }

  /**
   * Get main content area
   */
  getMainContent() {
    const selectorCandidates = [
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
    ];

    let locator = this.page.getByRole('main').first();
    return locator.or(this.page.locator(selectorCandidates.join(', ')).first());
  }

  /**
   * Get page/post title
   */
  getContentTitle() {
    return this.getMainContent().locator('h1').first();
  }

  /**
   * Get content text
   */
  getContentText() {
    return this.getMainContent().locator('.entry-content, .page-content, .post-content').first();
  }

  /**
   * Check if page has sidebar
   */
  async hasSidebar() {
    const sidebar = this.page.locator('aside, .sidebar, .widget-area').first();
    return await sidebar.isVisible({ timeout: 3000 });
  }

  /**
   * Verify content structure
   */
  async verifyContentStructure() {
    const main = this.getMainContent();
    await expect(main).toBeVisible({ timeout: 10000 });

    const title = this.getContentTitle();
    const titleExists = await title.isVisible({ timeout: 3000 });

    return {
      hasMainContent: true,
      hasTitle: titleExists,
      hasSidebar: await this.hasSidebar(),
    };
  }
}

/**
 * Complete WordPress Page Object
 * Combines all components for comprehensive page testing
 */
class WordPressPage extends WordPressBasePage {
  constructor(page, siteConfig = {}) {
    super(page);
    this.config = siteConfig;
    this.navigation = new WordPressNavigation(page);
    this.header = new WordPressHeader(page);
    this.footer = new WordPressFooter(page);
    this.content = new WordPressContent(page);
  }

  /**
   * Create form instance with configuration
   * @param {Object} formConfig - Form configuration from site config
   */
  createForm(formConfig) {
    return new WordPressForm(this.page, formConfig);
  }

  /**
   * Verify all critical page elements are present
   */
  async verifyCriticalElements() {
    const results = {
      header: false,
      navigation: false,
      content: false,
      footer: false,
    };

    try {
      await expect(this.header.getHeader()).toBeVisible({ timeout: 10000 });
      results.header = true;
    } catch (_error) {
      console.log('⚠️  Header not found');
    }

    try {
      await expect(this.navigation.getMainNavigation()).toBeVisible({ timeout: 10000 });
      results.navigation = true;
    } catch (_error) {
      console.log('⚠️  Navigation not found');
    }

    try {
      await expect(this.content.getMainContent()).toBeVisible({ timeout: 10000 });
      results.content = true;
    } catch (_error) {
      console.log('⚠️  Main content not found');
    }

    try {
      await expect(this.footer.getFooter()).toBeVisible({ timeout: 10000 });
      results.footer = true;
    } catch (_error) {
      console.log('⚠️  Footer not found');
    }

    return results;
  }

  /**
   * Perform comprehensive accessibility check
   */
  async checkAccessibility() {
    const issues = [];

    // Check navigation accessibility
    try {
      await this.navigation.verifyAccessibility();
    } catch (error) {
      issues.push(`Navigation: ${error.message}`);
    }

    // Check for skip links
    const skipLink = this.page.getByRole('link', { name: /skip to content|skip to main/i });
    if (!(await skipLink.isVisible({ timeout: 1000 }))) {
      issues.push('Missing skip link for keyboard navigation');
    }

    // Check for heading hierarchy
    const headings = await this.page.locator('h1, h2, h3, h4, h5, h6').all();
    if (headings.length === 0) {
      issues.push('No heading elements found');
    }

    return issues;
  }
}

/**
 * WordPress Page Objects Facade
 * Factory class that provides access to all WordPress page object components
 * This class exists for backward compatibility with existing test imports
 */
class WordPressPageObjects {
  constructor(page, siteConfig = {}) {
    this.page = page;
    this.config = siteConfig;

    // Create all page object instances
    this.basePage = new WordPressBasePage(page);
    this.navigation = new WordPressNavigation(page);
    this.header = new WordPressHeader(page);
    this.footer = new WordPressFooter(page);
    this.content = new WordPressContent(page);
    this.wordPressPage = new WordPressPage(page, siteConfig);
  }

  /**
   * Create form instance with configuration
   * @param {Object} formConfig - Form configuration from site config
   */
  createForm(formConfig) {
    return new WordPressForm(this.page, formConfig);
  }

  /**
   * Navigate to a page with WordPress-specific handling
   * @param {string} url - URL to navigate to
   * @param {Object} options - Navigation options
   */
  async navigate(url, options = {}) {
    return await this.basePage.navigate(url, options);
  }

  /**
   * Check if current page is a 404 error page
   */
  async is404Page() {
    return await this.basePage.is404Page();
  }

  /**
   * Get page title
   */
  async getTitle() {
    return await this.basePage.getTitle();
  }

  /**
   * Verify all critical page elements are present
   */
  async verifyCriticalElements() {
    return await this.wordPressPage.verifyCriticalElements();
  }

  /**
   * Perform comprehensive accessibility check
   */
  async checkAccessibility() {
    return await this.wordPressPage.checkAccessibility();
  }
}

module.exports = {
  WordPressPage,
  WordPressPageObjects,
  WordPressNavigation,
  WordPressForm,
  WordPressHeader,
  WordPressFooter,
  WordPressContent,
  WordPressBasePage,
};
