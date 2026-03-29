/* eslint-env node, browser */
/* global window */
/**
 * Enhanced Test Helpers for Scry
 *
 * This module provides comprehensive utilities for better error reporting,
 * debugging, browser lifecycle management, and industry-standard retry strategies
 * following Playwright and testing-library best practices.
 */

const { createBrowserDisconnectMonitor } = require('./browser-disconnect-monitor');

const browserDisconnectMonitor = createBrowserDisconnectMonitor();
const pageMonitorRegistrations = new WeakMap();

function resolveBrowser(context) {
  if (!context || typeof context.browser !== 'function') {
    return null;
  }
  try {
    return context.browser();
  } catch (_error) {
    return null;
  }
}

// Error types for better error handling
const ErrorTypes = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  ELEMENT_NOT_FOUND: 'element_not_found',
  BROWSER_CRASH: 'browser_crash',
  NAVIGATION: 'navigation',
  ASSERTION: 'assertion',
  UNKNOWN: 'unknown',
};

// Retry configurations for different operation types
const RetryConfig = {
  NETWORK_OPERATION: { maxRetries: 3, baseDelay: 1000, backoffMultiplier: 2 },
  ELEMENT_INTERACTION: { maxRetries: 2, baseDelay: 500, backoffMultiplier: 1.5 },
  NAVIGATION: { maxRetries: 2, baseDelay: 2000, backoffMultiplier: 2 },
  ASSERTION: { maxRetries: 1, baseDelay: 1000, backoffMultiplier: 1 },
};

/**
 * Classify error type for appropriate retry strategy
 * @param {Error} error - The error to classify
 * @returns {string} Error type constant
 */
function classifyError(_err) {
  const message = String(_err?.message || '').toLowerCase();

  if (message.includes('net::') || message.includes('network') || message.includes('connection')) {
    return ErrorTypes.NETWORK;
  }
  if (message.includes('timeout') || message.includes('waiting for')) {
    return ErrorTypes.TIMEOUT;
  }
  if (message.includes('element') || message.includes('locator') || message.includes('selector')) {
    return ErrorTypes.ELEMENT_NOT_FOUND;
  }
  if (
    message.includes('target closed') ||
    message.includes('browser') ||
    message.includes('context')
  ) {
    return ErrorTypes.BROWSER_CRASH;
  }
  if (message.includes('navigation') || message.includes('goto') || message.includes('page.goto')) {
    return ErrorTypes.NAVIGATION;
  }
  if (message.includes('expect') || message.includes('assertion')) {
    return ErrorTypes.ASSERTION;
  }

  return ErrorTypes.UNKNOWN;
}

/**
 * Determine if error is retryable based on error type and context
 * @param {Error} error - The error to check
 * @param {number} attemptNumber - Current attempt number
 * @param {Object} context - Additional context for retry decision
 * @returns {boolean} Whether the error should be retried
 */
function isRetryableError(error, attemptNumber, context = {}) {
  const errorType = classifyError(error);
  const { maxRetries = 3, operation = 'generic' } = context;

  // Don't retry if we've exceeded max attempts
  if (attemptNumber >= maxRetries) {
    return false;
  }

  // Don't retry assertion errors (they indicate actual test failures)
  if (errorType === ErrorTypes.ASSERTION) {
    return false;
  }

  // Don't retry browser crashes (need fresh context)
  if (errorType === ErrorTypes.BROWSER_CRASH) {
    return false;
  }

  // Network and timeout errors are usually retryable
  if ([ErrorTypes.NETWORK, ErrorTypes.TIMEOUT, ErrorTypes.NAVIGATION].includes(errorType)) {
    return true;
  }

  // Element interaction errors may be retryable if page is still responsive
  if (errorType === ErrorTypes.ELEMENT_NOT_FOUND && operation === 'element_interaction') {
    return true;
  }

  return false;
}

// Enhanced debugging utility for browser/page lifecycle issues
async function debugBrowserState(page, context, testName) {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    testName,
    pageState: {
      isClosed: page.isClosed(),
      url: 'unknown',
      title: 'unknown',
    },
    browserState: {
      isConnected: false,
      version: 'unknown',
    },
    memoryUsage: process.memoryUsage(),
    environmentInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      userAgent: context ? await context.userAgent().catch(() => 'unknown') : 'unknown',
    },
  };

  try {
    if (!page.isClosed()) {
      debugInfo.pageState.url = page.url();
      debugInfo.pageState.title = await page.title();
    }
  } catch (error) {
    debugInfo.pageState.error = error.message;
  }

  try {
    if (context) {
      const browser = context.browser();
      if (browser) {
        debugInfo.browserState.isConnected = browser.isConnected();
        debugInfo.browserState.version = browser.version();
      }
    }
  } catch (error) {
    debugInfo.browserState.error = error.message;
  }

  console.log('🔍 Browser State Debug Info:', JSON.stringify(debugInfo, null, 2));
  return debugInfo;
}

/**
 * Enhanced retry mechanism with intelligent error handling
 * @param {Function} operation - Async operation to retry
 * @param {string} operationName - Human-readable operation name
 * @param {Object} options - Retry configuration options
 */
async function retryOperation(operation, operationName, options = {}) {
  // Support legacy signature (operation, name, maxRetries, baseDelay)
  if (typeof options === 'number') {
    options = {
      maxRetries: options,
      baseDelay: arguments[3] || 1000,
      operation: 'generic',
    };
  }

  const {
    maxRetries = 3,
    baseDelay = 1000,
    backoffMultiplier = 2,
    operation: operationType = 'generic',
    context = {},
  } = options;

  let lastError;
  let errorHistory = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        console.log(
          `✅ ${operationName} succeeded on attempt ${attempt} (error types: ${errorHistory.map((e) => classifyError(e)).join(', ')})`
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      errorHistory.push(error);
      const errorType = classifyError(error);
      const isLastAttempt = attempt === maxRetries;

      console.log(
        `⚠️  ${operationName} attempt ${attempt}/${maxRetries} failed [${errorType}]: ${error.message.substring(0, 100)}...`
      );

      // Check if error is retryable
      if (!isRetryableError(error, attempt, { maxRetries, operation: operationType, ...context })) {
        console.error(`💥 ${operationName} failed with non-retryable error: ${errorType}`);
        throw error;
      }

      if (isLastAttempt) {
        console.error(`💥 ${operationName} failed after ${maxRetries} attempts`);
        console.error(
          `Error types encountered: ${errorHistory.map((e) => classifyError(e)).join(', ')}`
        );
        console.error(`Final error: ${error.message}`);
        break;
      }

      // Calculate delay with jitter to prevent thundering herd
      const baseDelayForAttempt = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
      const jitter = Math.random() * 0.1 * baseDelayForAttempt; // 10% jitter
      const delay = Math.round(baseDelayForAttempt + jitter);

      console.log(`   Waiting ${delay}ms before retry (error type: ${errorType})...`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Additional recovery actions based on error type
      await performErrorRecovery(error, errorType, context);
    }
  }

  throw lastError;
}

/**
 * Perform recovery actions based on error type
 * @param {Error} error - The error that occurred
 * @param {string} errorType - Classified error type
 * @param {Object} context - Additional context including page, etc.
 */
async function performErrorRecovery(error, errorType, context = {}) {
  const { page } = context;

  if (!page) return;

  try {
    switch (errorType) {
      case ErrorTypes.TIMEOUT:
        // Clear any pending operations
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        break;

      case ErrorTypes.ELEMENT_NOT_FOUND:
        // Wait for potential animations to complete
        await page.waitForTimeout(500);
        break;

      case ErrorTypes.NAVIGATION:
        // Ensure page is in a good state for navigation
        if (!page.isClosed()) {
          await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        }
        break;

      case ErrorTypes.NETWORK:
        // Wait for network to stabilize
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        break;

      default:
        // Generic recovery - just wait a bit
        await page.waitForTimeout(200);
        break;
    }
  } catch (recoveryError) {
    console.log(`⚠️  Error recovery failed: ${recoveryError.message}`);
  }
}

/**
 * Enhanced navigation with comprehensive error handling and smart retries
 * @param {Page} page - Playwright page object
 * @param {string} url - URL to navigate to
 * @param {Object} options - Navigation options
 */
async function safeNavigate(page, url, options = {}) {
  const defaultOptions = {
    timeout: 20000,
    waitUntil: 'domcontentloaded',
    ...options,
  };

  if (page.isClosed()) {
    throw new Error(`Cannot navigate to ${url}: page is closed`);
  }

  return await retryOperation(
    async () => {
      console.log(`🧭 Navigating to: ${url}`);
      const response = await page.goto(url, defaultOptions);

      if (!response) {
        throw new Error(`Navigation to ${url} returned null response`);
      }

      // Check for common error pages
      if (response.status() >= 400) {
        const errorType =
          response.status() === 404
            ? 'Page not found'
            : response.status() >= 500
              ? 'Server error'
              : 'Client error';
        throw new Error(`${errorType}: ${url} (Status: ${response.status()})`);
      }

      return response;
    },
    `Navigate to ${url}`,
    {
      ...RetryConfig.NAVIGATION,
      operation: 'navigation',
      context: { page, url },
    }
  );
}

// Wait for page stability with multiple strategies
async function waitForPageStability(page, options = {}) {
  const {
    timeout = 10000,
    strategies = ['domcontentloaded', 'load', 'networkidle'],
    softFail = true,
  } = options;

  if (page.isClosed()) {
    throw new Error('Cannot wait for page stability: page is closed');
  }

  const attempts = [];
  let totalElapsed = 0;

  for (const strategy of strategies) {
    const start = Date.now();
    try {
      await page.waitForLoadState(strategy, { timeout });
      const duration = Date.now() - start;
      totalElapsed += duration;
      console.log(`✅ Page stability achieved using ${strategy} (${duration}ms)`);
      return {
        ok: true,
        successfulStrategy: strategy,
        duration,
        totalElapsed,
        attempts,
      };
    } catch (error) {
      const duration = Date.now() - start;
      totalElapsed += duration;
      const detail = {
        strategy,
        duration,
        errorMessage: error.message,
      };
      attempts.push(detail);
      console.log(
        `⚠️  ${strategy} strategy failed after ${duration}ms: ${error.message.substring(0, 80)}...`
      );
    }
  }

  const summaryMessage = `All stability strategies failed (timeout ${timeout}ms per strategy).`;
  console.log(
    `⚠️  ${summaryMessage} Details: ${attempts
      .map((attempt) => `${attempt.strategy}: ${attempt.errorMessage}`)
      .join('; ')}`
  );

  const result = {
    ok: false,
    successfulStrategy: null,
    duration: 0,
    totalElapsed,
    attempts,
    message: summaryMessage,
  };

  if (!softFail) {
    const aggregatedErrors = attempts
      .map((attempt) => `${attempt.strategy}: ${attempt.errorMessage}`)
      .join('; ');
    throw new Error(`${summaryMessage} ${aggregatedErrors}`);
  }

  return result; // Soft-fail so callers can decide how to report
}

/**
 * Enhanced element interaction with comprehensive safety checks and retries
 * @param {Locator} element - Playwright locator
 * @param {string} action - Action to perform (click, fill, hover, etc.)
 * @param {Object} options - Action options including retry configuration
 */
async function safeElementInteraction(element, action, options = {}) {
  const { timeout = 5000, retries = true, text, force = false, ...actionOptions } = options;

  const interactionFunction = async () => {
    // Enhanced pre-interaction checks
    const checks = await Promise.allSettled([
      element.count(),
      element.isVisible(),
      element.isEnabled(),
    ]);

    const isAttached = checks[0].status === 'fulfilled' ? checks[0].value > 0 : false;
    const isVisible = checks[1].status === 'fulfilled' ? checks[1].value : false;
    const isEnabled = checks[2].status === 'fulfilled' ? checks[2].value : false;

    if (!isAttached) {
      throw new Error('Element is not attached to DOM');
    }

    if (!isVisible && !force) {
      throw new Error('Element is not visible');
    }

    if (!isEnabled && !force && ['click', 'fill'].includes(action)) {
      throw new Error('Element is not enabled for interaction');
    }

    // Scroll element into view if needed
    try {
      await element.scrollIntoViewIfNeeded({ timeout: 2000 });
    } catch (scrollError) {
      console.log(`⚠️  Could not scroll element into view: ${scrollError.message}`);
    }

    // Perform the action with enhanced options
    const actionOptionsWithTimeout = { timeout, ...actionOptions };

    switch (action) {
      case 'click':
        await element.click(actionOptionsWithTimeout);
        break;
      case 'fill':
        if (!text) throw new Error('Text is required for fill action');
        await element.fill(text, actionOptionsWithTimeout);
        break;
      case 'hover':
        await element.hover(actionOptionsWithTimeout);
        break;
      case 'focus':
        await element.focus(actionOptionsWithTimeout);
        break;
      case 'blur':
        await element.blur(actionOptionsWithTimeout);
        break;
      case 'check':
        await element.check(actionOptionsWithTimeout);
        break;
      case 'uncheck':
        await element.uncheck(actionOptionsWithTimeout);
        break;
      case 'selectOption':
        if (!options.value) throw new Error('Value is required for selectOption action');
        await element.selectOption(options.value, actionOptionsWithTimeout);
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    return true;
  };

  if (retries) {
    return await retryOperation(interactionFunction, `Element ${action} interaction`, {
      ...RetryConfig.ELEMENT_INTERACTION,
      operation: 'element_interaction',
      context: { element, action },
    });
  } else {
    try {
      return await interactionFunction();
    } catch (error) {
      console.log(`⚠️  Element ${action} failed: ${error.message}`);
      return false;
    }
  }
}

// Page cleanup utility
async function cleanupPage(page) {
  if (page.isClosed()) {
    return;
  }

  try {
    await page.evaluate(() => {
      // Stop any running timers or animations
      if (typeof window !== 'undefined') {
        // Clear all intervals and timeouts
        const highestId = setTimeout(() => {}, 0);
        for (let i = 0; i < highestId; i++) {
          clearTimeout(i);
          clearInterval(i);
        }

        // Cancel any ongoing network requests if possible
        if (window.stop) {
          window.stop();
        }
      }
    });
  } catch (error) {
    console.log(`⚠️  Page cleanup warning: ${error.message}`);
  }
}

// Error context tracking
class ErrorContext {
  constructor() {
    this.context = {
      currentTest: null,
      currentPage: null,
      currentAction: 'initialization',
      startTime: Date.now(),
      actions: [],
    };
  }

  setTest(testName) {
    this.context.currentTest = testName;
    this.context.startTime = Date.now();
  }

  setPage(pageName) {
    this.context.currentPage = pageName;
  }

  setAction(actionName) {
    this.context.currentAction = actionName;
    this.context.actions.push({
      action: actionName,
      timestamp: Date.now(),
      duration: Date.now() - this.context.startTime,
    });
  }

  getContextInfo() {
    return {
      ...this.context,
      totalDuration: Date.now() - this.context.startTime,
    };
  }

  logError(error, additionalInfo = {}) {
    console.error('❌ Test Error Context:', {
      error: error.message,
      stack: error.stack?.substring(0, 300),
      context: this.getContextInfo(),
      additional: additionalInfo,
      timestamp: new Date().toISOString(),
    });
  }
}

// Test setup and teardown helpers
async function setupTestPage(page, context, testInfo) {
  const browser = resolveBrowser(context);
  const registration = browserDisconnectMonitor.registerTestStart(browser, testInfo);
  if (registration) {
    pageMonitorRegistrations.set(page, registration);
  }

  try {
    page.on('crash', async () => {
      console.error('💥 Page crashed - this indicates a serious browser issue');
      await debugBrowserState(page, context, 'page-crash');
    });

    page.on('close', () => {
      console.log('📝 Page closed event triggered');
    });

    // Set generous timeouts for stability
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(20000);

    return new ErrorContext();
  } catch (error) {
    if (registration) {
      browserDisconnectMonitor.registerTestEnd(registration, {
        reason: 'setup-failure',
        testInfo,
      });
      pageMonitorRegistrations.delete(page);
    }
    throw error;
  }
}

async function teardownTestPage(page, context, errorContext, testInfo) {
  try {
    if (!page.isClosed()) {
      const currentUrl = await page.url();
      console.log(`🧹 Cleaning up page: ${currentUrl}`);
      await cleanupPage(page);
    }
  } catch (error) {
    console.log(`⚠️  Teardown warning: ${error.message}`);
    if (errorContext) {
      errorContext.logError(error, { phase: 'teardown' });
    }
    await debugBrowserState(page, context, 'teardown-error');
  } finally {
    const registration = pageMonitorRegistrations.get(page);
    if (registration) {
      browserDisconnectMonitor.registerTestEnd(registration, {
        reason: 'teardown-complete',
        testInfo,
      });
      pageMonitorRegistrations.delete(page);
    }
  }
}

module.exports = {
  // Enhanced error handling and retry strategies
  ErrorTypes,
  RetryConfig,
  classifyError,
  isRetryableError,
  performErrorRecovery,
  // Existing functionality with enhancements
  debugBrowserState,
  retryOperation,
  safeNavigate,
  waitForPageStability,
  safeElementInteraction,
  cleanupPage,
  ErrorContext,
  setupTestPage,
  teardownTestPage,
};
