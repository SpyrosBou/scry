# Spec → Reporter → Dashboard Pipeline

This note captures how Playwright specs feed data into the custom HTML reporter and how that output becomes the dashboard surfaced through `npm run reports:read`. File paths and line numbers are included so you can jump directly into the implementation if anything changes.

## 1. Entry Points and CLI Orchestration
- `run-tests.js:215-383` parses CLI flags such as `--site`, `--visual`, `--test`, and `--pages`, ensuring suite flags and explicit spec globs stay mutually exclusive.
- `run-tests.js:176-213` wraps options with an `onEvent` emitter so higher-level commands (e.g., `--output`) can record `manifest:*` and `run:complete` events.
- `utils/test-runner.js:297-775` (`TestRunner.runTestsForSite`) loads the requested site via `SiteLoader`, performs optional sitemap discovery, selects the spec files based on suite flags, and infers the Playwright projects/browsers to run.
- `utils/test-runner.js:194-228` builds the run manifest (pages, specs, projects, limits) and `utils/test-runner.js:165-191` persists it to `reports/run-manifests/` when the payload is large, otherwise inlines it via `SITE_RUN_MANIFEST_INLINE`. Environment variables `SITE_NAME`, `SITE_BASE_URL`, `SITE_TEST_PAGES`, etc., are injected into the Playwright process so specs know what to exercise.

## 2. Spec Responsibilities
- Tests import the shared fixtures from `utils/test-fixtures.js:4-15`, which wrap `@playwright/test` to provide automatic setup/teardown and expose `test.info()` for attachments.
- Active site metadata is resolved once via `utils/test-context.js:1-21` so specs can grab `{ siteName, siteConfig }` without re-reading `process.env`.
- Each suite (example: `tests/functionality.interactive.smoke.spec.js`) iterates the manifest’s `testPages`, executes the checks (console/resource errors, form submissions, accessibility sweeps, etc.), and aggregates per-page/per-run metrics.
- When a suite needs to expose structured insights on the dashboard it uses helpers from `utils/reporting-utils.js`:
  - `attachSummary()` (`utils/reporting-utils.js:143-196`) emits HTML/Markdown descriptions as attachments named `*.summary.*`.
  - `attachSchemaSummary()` (`utils/reporting-utils.js:198-214`) validates JSON payloads produced by `createRunSummaryPayload()` / `createPageSummaryPayload()` (`utils/report-schema.js:6-40`) and attaches them as `*.summary.schema.json`.
- Accessibility-heavy suites (e.g., `tests/a11y.audit.wcag.spec.js`) keep per-page reports in memory (see the `projectReportStore` block around lines 300-360) and attach project/run summaries once all page scans finish—no intermediate files or polling required.
- These attachments are standard Playwright artifacts, so no spec code needs to know about the reporter internals beyond supplying the schema payloads and summary blocks.

## 3. Reporter Internals
- `playwright.config.js:38-54` globally registers `./utils/custom-html-reporter` plus the default `list` reporter (and `blob` on CI), so every run triggers the custom reporter.
- `CustomHtmlReporter` (`utils/custom-html-reporter.js`) lifecycle:
  - `onBegin()` captures the config/suite metadata and total planned tests.
  - `onTestEnd()` (`utils/custom-html-reporter.js:141-206`) aggregates attempts, stdout/stderr, and calls `processAttachments()` (`utils/custom-html-reporter.js:243-402`) to separate inline text/binary assets from schema summaries/summary blocks.
  - `buildRunData()` (`utils/custom-html-reporter.js:404-518`) serialises tests, deduplicates summary blocks, tallies status counts, and enriches the run with site/profile/environment metadata sourced from env vars or `sites/<name>.json`.
  - `writeOutputs()` (`utils/custom-html-reporter.js:576-684`) renders the HTML via `renderReportHtml()` (`utils/report-templates.js`), writes `data/run.json`, per-test JSON files under `reports/run-*/data/tests/`, Markdown summaries, and updates `reports/latest-run.json` plus `reports/manifest.json`.

## 4. Dashboard and Post-Run Surfacing
- `reports/latest-run.json` is re-read by `TestRunner.readLatestReportSummary()` (`utils/test-runner.js:777-804`) right after Playwright exits so the CLI can print a “Quick Summary” (pass/fail counts, flaky numbers, report location).
- The CLI prints `npm run reports:read` as the way to open the dashboard. That script (`scripts/read-reports.js`) loads `reports/manifest.json`, selects the newest run (or a specific historical run if requested), and opens the HTML in the user’s browser.
- Reporter styles originate from `styles/report/report-styles.scss`; whenever those change you run `npm run styles:build` to regenerate the CSS shipped with the HTML.

## 5. Data Flow Recap
1. **Runner** chooses sites/specs/projects, writes/exports the manifest, and spawns Playwright with the necessary env vars.
2. **Specs** consume those env vars to know which pages to hit, attach schema summaries and narrative summaries as artifacts, and rely on shared helpers for consistency.
3. **Reporter** ingests every test result, recognises the schema/summary attachments, and produces `report.html`, structured JSON, and Markdown sidecars without massaging the payloads (missing values simply surface as `DATA MISSING`).
4. **Dashboard consumers** (CLI quick summary, `npm run reports:read`, CI artifacts) read from `reports/latest-run.json`, `manifest.json`, and the generated HTML to present the final results.

Use this file when you need to trace a metric from a spec all the way to the dashboard or when onboarding teammates who need to understand why the reporter requires certain attachments or env variables.
