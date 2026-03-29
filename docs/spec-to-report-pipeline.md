# Spec -> Reporter -> Dashboard Pipeline

This note captures the current execution and reporting flow after the Phase 1-2 runner split. It intentionally avoids stale line-number references.

## 1. Entry Points and CLI Orchestration

- `run-tests.js` is execution-only. It parses run flags, rejects legacy mutating flags such as `--discover` and `--update-baselines`, builds a run context, and forwards it into `TestRunner.runTestsForSite()`.
- `utils/run-cli.js` owns CLI parsing, validation, manifest-preview rendering, and output-writer creation for `--output`.
- `scripts/discovery/discover-pages.js` is the only workflow that scaffolds or updates `sites/*.json`. It now routes through `utils/discovery-service.js` instead of tunneling through the test runner.
- `scripts/discovery/update-baselines.js` is the only CLI entry point that updates visual baselines.
- `utils/test-runner.js` loads the requested site, applies homepage and page-cap rules, builds the run manifest, and spawns Playwright with an explicit env payload.
- Large manifests persist under `reports/run-manifests/`; small manifests are inlined via `SITE_RUN_MANIFEST_INLINE`.

## 2. Spec Responsibilities

- Specs still run against site context derived from the runner manifest and env payload. The fixture layer in `utils/test-fixtures.js` and `utils/test-context.js` exists, but the suite is not yet uniformly migrated to fixture-only site context.
- Suites iterate the selected `testPages`, run checks, and attach structured artifacts through `utils/reporting-utils.js`.
- `attachSummary()` emits HTML or Markdown summaries for narrative sections.
- `attachSchemaSummary()` validates and attaches normalized JSON payloads produced by the report-schema helpers.
- Accessibility, responsive, and functionality suites all follow the same broad contract: emit page-level findings plus run-level summaries, then leave rendering decisions to the reporter.

## 3. Reporter Internals

- `playwright.config.js` registers the custom HTML reporter alongside Playwright's standard console reporter.
- `utils/custom-html-reporter.js` aggregates test attempts, attachments, stdout/stderr, and schema summaries into one normalized run payload.
- The reporter writes `report.html`, `data/run.json`, per-test JSON payloads, Markdown summaries, and `reports/latest-run.json`.
- `utils/report-templates.js` and its helper modules render the HTML dashboard from normalized run data rather than from spec-specific logic.

## 4. Dashboard and Post-Run Surfacing

- `TestRunner.readLatestReportSummary()` reads `reports/latest-run.json` after Playwright exits so the CLI can print a short run summary.
- `npm run reports:read` opens the latest generated report.
- `npm run reports:dev` serves the generated report UI with live reload for report-template work.

## 5. Data Flow Recap

1. The execution CLI resolves sites, specs, limits, and projects.
2. The runner builds a manifest and spawns Playwright with explicit run context.
3. Specs attach normalized artifacts and summaries.
4. The custom reporter materializes HTML, JSON, and summary metadata.
5. CLI summary and report-viewer commands read the generated artifacts.

Use this note when you need to trace how execution data reaches the HTML report without relying on stale implementation offsets.
