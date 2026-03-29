const { test, expect } = require('../utils/test-fixtures');
const SiteLoader = require('../utils/site-loader');

test.use({ trace: 'off', video: 'off' });
const {
  safeNavigate,
  waitForPageStability,
} = require('../utils/test-helpers');
const { attachSchemaSummary } = require('../utils/reporting-utils');
const { createRunSummaryPayload, createPageSummaryPayload } = require('../utils/report-schema');

const ERROR_SELECTORS = [
  '[role="alert"]',
  '[aria-live]:not([aria-live="off"])',
  '.error',
  '.errors',
  '.form-error',
  '.field-error',
  '.validation-error',
  '.wpcf7-not-valid-tip',
  '.nf-error',
  '.gfield_validation_message',
  '.notice-error',
];

const parseSelectorList = (selectorString = '') =>
  String(selectorString)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

const FORMS_WCAG_REFERENCES = [
  { id: '1.3.1', name: 'Info and Relationships' },
  { id: '3.3.1', name: 'Error Identification' },
  { id: '3.3.2', name: 'Labels or Instructions' },
  { id: '3.3.3', name: 'Error Suggestion' },
  { id: '4.1.2', name: 'Name, Role, Value' },
];

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'form';

const getAccessibleNameDetails = async (fieldLocator) => {
  return fieldLocator.evaluate((el) => {
    const collectText = (nodes) =>
      Array.from(nodes || [])
        .map((node) => node.textContent || '')
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' ')
        .trim();

    const labelText = collectText(el.labels || []);
    const ariaLabel = (el.getAttribute('aria-label') || '').trim();
    const labelledbyIds = (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const labelledbyText = labelledbyIds
      .map((id) => {
        const target = document.getElementById(id);
        return target ? target.textContent || '' : '';
      })
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
    const title = (el.getAttribute('title') || '').trim();
    const placeholder = (el.getAttribute('placeholder') || '').trim();

    const controlType = el.tagName.toLowerCase();
    const inputType = (el.getAttribute('type') || '').toLowerCase();
    const valueText =
      controlType === 'button' || inputType === 'submit' || inputType === 'button'
        ? (el.value || '').trim()
        : '';

    const accessibleName = [labelText, ariaLabel, labelledbyText, title, valueText]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    const describedByIds = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const describedText = describedByIds
      .map((id) => {
        const target = document.getElementById(id);
        return target ? target.textContent || '' : '';
      })
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      accessibleName,
      hasAccessibleName: accessibleName.length > 0,
      required: el.required || el.getAttribute('aria-required') === 'true',
      placeholder,
      describedText,
    };
  });
};

const evaluatePostSubmitState = async (formLocator, fieldSelectors) => {
  return formLocator.evaluate(
    (form, { fieldSelectors: selectorsMap, errorSelectors }) => {
      const visible = (el) => {
        if (!el) return false;
        const styles = window.getComputedStyle(el);
        if (styles.visibility === 'hidden' || styles.display === 'none') return false;
        return el.getClientRects().length > 0;
      };

      const aggregateErrors = Array.from(
        new Set(
          errorSelectors.flatMap((selector) =>
            Array.from(form.querySelectorAll(selector)).filter((node) => visible(node))
          )
        )
      )
        .filter((node) => node.textContent)
        .map((node) => node.textContent.trim())
        .filter(Boolean);

      const fieldResults = {};
      for (const [fieldName, selectorString] of Object.entries(selectorsMap)) {
        const selectors = String(selectorString)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
        let field = null;
        let selectorUsed = null;
        for (const selector of selectors) {
          const candidate = form.querySelector(selector);
          if (candidate) {
            field = candidate;
            selectorUsed = selector;
            break;
          }
        }
        if (!field) {
          fieldResults[fieldName] = null;
          continue;
        }

        const describedByIds = (field.getAttribute('aria-describedby') || '')
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean);
        const describedText = describedByIds
          .map((id) => {
            const target = document.getElementById(id);
            return target ? target.textContent || '' : '';
          })
          .map((value) => value.trim())
          .filter(Boolean);

        const inlineErrors = Array.from(
          new Set(
            errorSelectors.flatMap((selector) => {
              const nodes = Array.from(
                field.closest('label, .form-field, .field, .gfield, .nf-field, .wpcf7-form-control-wrap')?.querySelectorAll(selector) || []
              );
              if (nodes.length) return nodes;
              return [];
            })
          )
        )
          .filter((node) => visible(node) && node !== field)
          .map((node) => node.textContent.trim())
          .filter(Boolean);

        fieldResults[fieldName] = {
          ariaInvalid: field.getAttribute('aria-invalid') === 'true',
          describedText,
          inlineErrors,
          selectorUsed,
          required: field.required || field.getAttribute('aria-required') === 'true',
        };
      }

      return {
        aggregateErrors,
        fields: fieldResults,
      };
    },
    { fieldSelectors, errorSelectors: ERROR_SELECTORS }
  );
};

test.describe('Accessibility: Forms', () => {
  let siteConfig;
  let errorContext;

  test.beforeEach(async ({ page, context, errorContext: sharedErrorContext }, testInfo) => {
    const siteName = process.env.SITE_NAME;
    if (!siteName) throw new Error('SITE_NAME environment variable is required');

    siteConfig = SiteLoader.loadSite(siteName);
    SiteLoader.validateSiteConfig(siteConfig);
    errorContext = sharedErrorContext;
  });

  test('Forms provide accessible labelling and validation feedback', async ({ page }, testInfo) => {
    test.setTimeout(7200000);

    const formConfigs = Array.isArray(siteConfig.forms) ? siteConfig.forms : [];
    if (formConfigs.length === 0) {
      test.skip('Site config defines no forms to audit.');
    }

    const reports = [];

    for (const formConfig of formConfigs) {
      const report = {
        formName: formConfig.name || 'Unnamed form',
        page: formConfig.page || '/',
        gating: [],
        warnings: [],
        advisories: [],
        fields: [],
        selectorUsed: null,
        notes: [],
      };
      reports.push(report);

      await test.step(`Form audit: ${report.formName} (${report.page})`, async () => {
        const response = await safeNavigate(page, `${siteConfig.baseUrl}${report.page}`);
        if (!response || response.status() >= 400) {
          report.gating.push(
            `Failed to load page (status ${response ? response.status() : 'unknown'})`
          );
          return;
        }

        const stability = await waitForPageStability(page);
        if (!stability.ok) {
          report.gating.push(`Page did not reach a stable state: ${stability.message}`);
          return;
        }

        const formLocators = parseSelectorList(formConfig.selector || 'form');
        let formLocator = null;
        for (const selector of formLocators) {
          const locator = page.locator(selector).first();
          if (await locator.count()) {
            formLocator = locator;
            report.selectorUsed = selector;
            break;
          }
        }

        if (!formLocator) {
          report.gating.push('Unable to locate form using configured selector.');
          return;
        }

        const submitLocator = formLocator.locator(formConfig.submitButton || '[type="submit"]').first();
        if (!(await submitLocator.count())) {
          report.gating.push('Submit button not found inside the form.');
          return;
        }

        const fieldsConfig = formConfig.fields || {};
        const fieldDetails = {};

        for (const [fieldName, selectorString] of Object.entries(fieldsConfig)) {
          const selectors = parseSelectorList(selectorString);
          let fieldLocator = null;
          let selectorUsed = null;
          for (const selector of selectors) {
            const candidate = formLocator.locator(selector).first();
            if (await candidate.count()) {
              fieldLocator = candidate;
              selectorUsed = selector;
              break;
            }
          }

          const fieldReport = {
            name: fieldName,
            selectorUsed,
            accessibleName: null,
            required: false,
            issues: [],
          };
          report.fields.push(fieldReport);

          if (!fieldLocator) {
            report.gating.push(`Field "${fieldName}" not found using configured selector.`);
            fieldReport.issues.push('Field missing from DOM.');
            continue;
          }

          const accessibleInfo = await getAccessibleNameDetails(fieldLocator);
          fieldReport.accessibleName = accessibleInfo.accessibleName;
          fieldReport.required = accessibleInfo.required;

          if (!accessibleInfo.hasAccessibleName) {
            report.gating.push(`Field "${fieldName}" is missing an accessible name.`);
            fieldReport.issues.push('Accessible name not detected (no label/aria-label/aria-labelledby).');
          }

          if (accessibleInfo.placeholder && !accessibleInfo.hasAccessibleName) {
            report.advisories.push(
              `Field "${fieldName}" appears to rely on placeholder text for labelling. Add a visible label or aria-label.`
            );
          }

          fieldDetails[fieldName] = selectorString;
        }

        const submitInfo = await getAccessibleNameDetails(submitLocator);
        if (!submitInfo.hasAccessibleName) {
          report.gating.push('Submit button lacks an accessible name (text, aria-label, or labelled-by).');
        }

        await submitLocator.dispatchEvent('click');
        await page.waitForTimeout(1200);

        const postSubmitState = await evaluatePostSubmitState(formLocator, fieldDetails);

        if (!postSubmitState.aggregateErrors.length) {
          report.advisories.push('No global error messaging detected after blank submission.');
        }

        for (const fieldReport of report.fields) {
          const postField = postSubmitState.fields[fieldReport.name];
          if (!postField) continue;

          if (fieldReport.required && !postField.ariaInvalid && !postField.inlineErrors.length && !postField.describedText.length) {
            report.gating.push(
              `Field "${fieldReport.name}" did not expose aria-invalid or inline error messaging after submitting empty.`
            );
            fieldReport.issues.push('No aria-invalid or inline error detected after invalid submit.');
          }

          if (!postField.inlineErrors.length && postField.describedText.length) {
            fieldReport.issues.push('Validation message relies on aria-describedby only; ensure the referenced node stays visible.');
          }

          if (postField.inlineErrors.length) {
            fieldReport.issues.push(`Inline errors: ${postField.inlineErrors.join('; ')}`);
          }
        }

        report.notes.push(`Validated ${report.fields.length} configured fields on this form.`);
        if (report.selectorUsed) {
          report.notes.push(`Resolved form using selector "${report.selectorUsed}".`);
        }
      });
    }

    const gatingTotal = reports.reduce((sum, report) => sum + report.gating.length, 0);

    const projectName = siteConfig.name || process.env.SITE_NAME || 'default';

    const runPayload = createRunSummaryPayload({
      baseName: `a11y-forms-summary-${slugify(projectName)}`,
      title: 'Forms accessibility summary',
      overview: {
        totalFormsAudited: reports.length,
        formsWithGatingIssues: reports.filter((report) => report.gating.length > 0).length,
        formsWithAdvisories: reports.filter((report) => report.advisories.length > 0).length,
        totalFieldsAudited: reports.reduce((sum, report) => sum + report.fields.length, 0),
        totalGatingFindings: reports.reduce((sum, report) => sum + report.gating.length, 0),
        totalAdvisoryFindings: reports.reduce((sum, report) => sum + report.advisories.length, 0),
      },
      metadata: {
        spec: 'a11y.forms.validation',
        summaryType: 'forms',
        projectName,
        suppressPageEntries: true,
        scope: 'project',
      },
    });
  runPayload.details = {
    forms: reports.map((report) => ({
      formName: report.formName,
      page: report.page,
      selectorUsed: report.selectorUsed,
      gating: report.gating,
      warnings: report.warnings,
      advisories: report.advisories,
      fields: report.fields,
      notes: report.notes,
    })),
    wcagReferences: FORMS_WCAG_REFERENCES,
  };
    await attachSchemaSummary(testInfo, runPayload);

    for (const report of reports) {
      const pagePayload = createPageSummaryPayload({
        baseName: `a11y-forms-${slugify(projectName)}-${slugify(report.formName)}-${slugify(report.page)}`,
        title: `${report.formName} — ${report.page}`,
        page: report.page,
        viewport: 'forms',
        summary: {
          formName: report.formName,
          selectorUsed: report.selectorUsed,
          gatingIssues: report.gating,
          gating: report.gating,
          warnings: report.warnings,
          advisories: report.advisories,
          fields: report.fields,
          notes: report.notes,
        },
        metadata: {
          spec: 'a11y.forms.validation',
          summaryType: 'forms',
          projectName,
        },
      });
      await attachSchemaSummary(testInfo, pagePayload);
    }

    expect(gatingTotal, 'Form accessibility gating issues detected').toBe(0);
  });
});
