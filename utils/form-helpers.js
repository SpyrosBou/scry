'use strict';

const FORM_ERROR_SELECTORS = [
  '[role="alert"]',
  '[aria-live]:not([aria-live="off"])',
  '.error',
  '.errors',
  '.form-error',
  '.field-error',
  '.validation-error',
  '.error-msg',
  '.wpcf7-not-valid-tip',
  '.nf-error',
  '.gfield_validation_message',
  '.notice-error',
  '.wpcf7-validation-errors',
  '.gform_validation_errors',
];

const FORM_FALLBACK_SELECTORS = 'form, .wpcf7-form, .gform_wrapper, .contact-form';

const getFormLocator = (page, formConfig = {}) => {
  if (formConfig.selector) {
    return page.locator(formConfig.selector).first();
  }

  return page.getByRole('form').first().or(page.locator(FORM_FALLBACK_SELECTORS).first());
};

const getFieldLocator = (page, fieldType, fallbackSelector = null) => {
  const semanticSelectors = {
    name: () => page.getByRole('textbox', { name: /name|your.name|full.name/i }),
    email: () => page.getByRole('textbox', { name: /email|e.mail|email.address/i }),
    message: () => page.getByRole('textbox', { name: /message|comment|inquiry|details/i }),
    phone: () => page.getByRole('textbox', { name: /phone|telephone|mobile/i }),
    subject: () => page.getByRole('textbox', { name: /subject|topic|regarding/i }),
  };

  const semanticSelector = semanticSelectors[fieldType];
  if (!semanticSelector) {
    return fallbackSelector ? page.locator(fallbackSelector).first() : null;
  }

  let locator = semanticSelector();
  if (fallbackSelector) {
    locator = locator.or(page.locator(fallbackSelector));
  }
  return locator.first();
};

const getSubmitLocator = (page, formConfig = {}) => {
  const submitSelector = formConfig.submitSelector || formConfig.submitButton;
  if (submitSelector) {
    return page.locator(submitSelector).first();
  }

  return page
    .getByRole('button', { name: /submit|send|contact|get.in.touch/i })
    .or(page.locator('input[type="submit"], button[type="submit"], .submit-button'))
    .first();
};

async function fillFormFields(page, formConfig, data) {
  const formLocator = getFormLocator(page, formConfig);
  await formLocator.waitFor({ state: 'visible', timeout: 10000 });

  const fieldMappings = {
    name: ['name', 'fullName', 'firstName'],
    email: ['email', 'emailAddress'],
    message: ['message', 'comment', 'inquiry'],
    phone: ['phone', 'telephone', 'mobile'],
    subject: ['subject', 'topic'],
  };

  for (const [fieldType, dataKeys] of Object.entries(fieldMappings)) {
    const dataKey = dataKeys.find((key) => data[key]);
    if (!dataKey) continue;

    try {
      const field = getFieldLocator(page, fieldType, formConfig?.fields?.[fieldType]);
      if (field && (await field.isVisible({ timeout: 2000 }))) {
        await field.fill(data[dataKey], { timeout: 2000 });
        await field.blur();
      }
    } catch (error) {
      console.log(`⚠️  Could not fill ${fieldType} field: ${error.message}`);
    }
  }

  return formLocator;
}

async function clearFormFields(formLocator) {
  const fields = await formLocator.locator('input, textarea, select').all();
  for (const field of fields) {
    try {
      const fieldType = (await field.getAttribute('type')) || '';
      if (!['submit', 'button', 'hidden'].includes(fieldType)) {
        await field.fill('');
      }
    } catch (_error) {
      // Continue with next field.
    }
  }
}

async function waitForFormValidationState(page, formLocator, options = {}) {
  const { timeout = 4000, errorSelectors = FORM_ERROR_SELECTORS } = options;

  const checks = [
    formLocator
      .locator('[aria-invalid="true"], input:invalid, textarea:invalid, select:invalid')
      .first()
      .waitFor({ state: 'attached', timeout }),
    formLocator.locator(errorSelectors.join(', ')).first().waitFor({ state: 'visible', timeout }),
    page.locator(errorSelectors.join(', ')).first().waitFor({ state: 'visible', timeout }),
  ].map((promise) => promise.then(() => true));

  try {
    await Promise.any(checks);
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = {
  FORM_ERROR_SELECTORS,
  clearFormFields,
  fillFormFields,
  getFieldLocator,
  getFormLocator,
  getSubmitLocator,
  waitForFormValidationState,
};
