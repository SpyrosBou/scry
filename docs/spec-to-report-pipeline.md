# Spec → Reporter → Dashboard Pipeline

This note captures how Playwright specs feed data into the custom HTML reporter and how that output becomes the dashboard surfaced through `npm run reports:read`. File paths and line numbers are included so you can jump directly into the implementation if anything changes.

## 1. Entry Points and CLI Orchestration
- `run-tests.js:215-383` parses CLI flags such as `--site`, `--visual`, `--test`, and `--pages`, ensuring suite flags and explicit spec globs stay mutually exclusive.
- `run-tests.js:176-213` wraps options with an `onEvent` emitter so higher-level commands (e.g., `--output`) can record `manifest:*` and `run:complete` events.
- `utils/test-runner.js:297-775` (`TestRunner.runTestsForSite`) loads the requested site via `SiteLoader`, performs optional sitemap discovery, selects the spec files based on suite flags, and infers the Playwright projects/browsers to run.
- `utils/test-runner.js:194-228` builds the run manifest (pages, specs, projects, limits) and `utils/test-runner.js:165-191` persists it to `reports/run-manifests/` when the payload is large, otherwise inlines it via `SITE_RUN_MANIFEST_INLINE`. Environment variables `SITE_NAME`, `SITE_BASE_URL`, `SITE_TEST_PAGES`, etc., are injected into the Playwright process so specs know what to exercise.

## 2. Spec Responsibilities
- Tests import the shared fixtures from `utils/test-fixtures.js:4-24`, which expose `siteContext` / `siteConfig` / `siteName` so suites never read env vars directly, and wrap Playwright’s `test` with `errorContext` for consistent setup/teardown + `testInfo` access.
- Active site metadata is resolved once via `utils/test-context.js:1-21`, so every spec can call `getActiveSiteContext()` without touching `process.env`.
- Each suite (example: `tests/functionality.interactive.smoke.spec.js`) iterates the manifest’s `testPages`, runs its checks (console/resource errors, forms, WCAG, responsive, etc.), and aggregates per-page/per-run metrics before yielding control back to the reporter.
- When a suite needs to expose structured insights it uses the helpers from `utils/reporting-utils.js`:
  - `attachSummary()` (`utils/reporting-utils.js:143-196`) emits HTML/Markdown blocks (named `*.summary.*`).
  - `attachSchemaSummary()` (`utils/reporting-utils.js:198-214`) validates payloads produced by `createRunSummaryPayload()` / `createPageSummaryPayload()` (`utils/report-schema.js:6-40`) before attaching them as `*.summary.schema.json`.
- **Keyboard + WCAG specs**: `tests/a11y.audit.wcag.spec.js` streams each page’s Axe run into an aggregation store (`utils/report-aggregation-store.js`). Every worker writes its page report to `test-results/.a11y-aggregation/<run-token>/` so the serial “Aggregate results” test can rehydrate all 5 reports (it now waits up to two minutes to ensure every parallel page finishes), emit the run/page schema payloads, and clean up. During the scan we enrich each violation/advisory with culprits (target selector + screenshot) so `renderPerPageIssuesTable()` can show “View offending element”. The WCAG spec now iterates every Axe-provided selector, waits for the locator to become visible, captures an element screenshot with animations/caret disabled, and—if that fails—pads the element’s bounding box for a contextual clip or falls back to a cached full-page shot. Each node records whether we used an element, context, or page fallback so future reporter tweaks can surface that provenance.
- **Structural semantics spec**: `tests/a11y.structure.landmarks.spec.js` captures the site structure (H1 count, landmark presence, heading skips). When a landmark is missing we snapshot the page once, add it to the finding as a node, and attach both project- and per-page schema summaries so the reporter can render structural gating/advisory tables with clickable culprits.
- **Responsive + infrastructure specs** follow the same contract: gather per-page summaries, call `applyViewportMetadata()` so each entry records browser/viewport/site labels, then call `attachSchemaSummary()` for run + page payloads.
- All of these artifacts are standard Playwright attachments—no spec needs to understand the HTML reporter, it just supplies JSON + optional HTML/Markdown.

## 3. Reporter Internals
- `playwright.config.js:38-54` globally registers `./utils/custom-html-reporter` plus the default `list` reporter (and `blob` on CI), so every run triggers the custom reporter.
- `CustomHtmlReporter` (`utils/custom-html-reporter.js`) lifecycle:
  - `onBegin()` captures the config/suite metadata and total planned tests.
  - `onTestEnd()` (`utils/custom-html-reporter.js:141-206`) aggregates attempts, stdout/stderr, and calls `processAttachments()` (`utils/custom-html-reporter.js:243-402`) to separate inline text/binary assets from schema summaries/summary blocks.
  - `buildRunData()` (`utils/custom-html-reporter.js:404-518`) serialises tests, deduplicates summary blocks, tallies status counts, and enriches the run with site/profile/environment metadata sourced from env vars or `sites/<name>.json`.
- `writeOutputs()` (`utils/custom-html-reporter.js:576-684`) renders the HTML via `renderReportHtml()` (`utils/report-templates.js`), writes `data/run.json`, per-test JSON files under `reports/run-*/data/tests/`, Markdown summaries, and updates `reports/latest-run.json` plus `reports/manifest.json`.
- `utils/report-templates/helpers/render-primitives.js` now centralises the shared HTML primitives that every section uses (status badges, gating/advisory tables, per-page accordions, viewport normalisers, etc.) so section modules import a single API instead of duplicating `MISSING_DATA_LABEL` logic across the 7k-line file.
- `utils/report-templates/helpers/section-data.js` holds the data shapers (`collectIssueMessages`, `collectSchemaProjects`, `firstRunPayload`, and `summaryTypeFromGroup`) so both the orchestrator and upcoming section modules can reason about schema buckets without re-implementing those reducers.

## 4. Dashboard and Post-Run Surfacing
- `reports/latest-run.json` is re-read by `TestRunner.readLatestReportSummary()` (`utils/test-runner.js:777-804`) right after Playwright exits so the CLI can print a “Quick Summary” (pass/fail counts, flaky numbers, report location).
- The CLI prints `npm run reports:read` as the way to open the dashboard. That script (`scripts/reporting/read-reports.js`) loads `reports/manifest.json`, selects the newest run (or a specific historical run if requested), and opens the HTML in the user’s browser.
- Reporter styles originate from `styles/report/report-styles.scss`; whenever those change you run `npm run styles:build` to regenerate the CSS shipped with the HTML.

## 5. Data Flow Recap
1. **Runner** chooses sites/specs/projects, writes/exports the manifest, and spawns Playwright with the necessary env vars.
2. **Specs** consume those env vars to know which pages to hit, attach schema summaries and narrative summaries as artifacts, and rely on shared helpers for consistency.
3. **Reporter** ingests every test result, recognises the schema/summary attachments, and produces `report.html`, structured JSON, and Markdown sidecars without massaging the payloads (missing values simply surface as `DATA MISSING`).
4. **Dashboard consumers** (CLI quick summary, `npm run reports:read`, CI artifacts) read from `reports/latest-run.json`, `manifest.json`, and the generated HTML to present the final results.

Use this file when you need to trace a metric from a spec all the way to the dashboard or when onboarding teammates who need to understand why the reporter requires certain attachments or env variables.
