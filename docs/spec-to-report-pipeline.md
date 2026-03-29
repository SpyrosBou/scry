# Spec -> Reporter -> Dashboard Pipeline

This note captures the current execution and reporting flow after the runner split and the schema-only reporting cleanup.

## 1. Entry Points and CLI Orchestration

- `run-tests.js` is execution-only. It parses run flags, rejects legacy mutating flags such as `--discover` and `--update-baselines`, builds a run context, and forwards it into `TestRunner.runTestsForSite()`.
- `utils/run-cli.js` owns CLI parsing, validation, manifest-preview rendering, and output-writer creation for `--output`.
- `scripts/discovery/discover-pages.js` is the only workflow that scaffolds or updates `sites/*.json`.
- `scripts/discovery/update-baselines.js` is the only CLI entry point that updates visual baselines.
- `utils/test-runner.js` loads the requested site, validates it, applies page-cap rules, builds the run manifest, and spawns Playwright with an explicit env payload.
- Large manifests persist under `reports/run-manifests/`; small manifests are inlined via `SITE_RUN_MANIFEST_INLINE`.

## 2. Spec Contract

- Specs consume site context from the shared fixture/runtime context, which is loaded from the run manifest snapshot rather than from site-file/env fallbacks.
- `attachSchemaSummary()` is the only reporting attachment API used by active specs.
- Specs are responsible for evidence capture and machine-readable findings, not HTML or Markdown presentation.
- Run summaries and page summaries are created with the helpers in `utils/report-schema.js`.
- Summary type names and metadata meanings are documented in `docs/report-schema-inventory.md`.

## 3. Reporter Internals

- `playwright.config.js` registers the custom HTML reporter alongside Playwright's console reporter.
- `utils/custom-html-reporter.js` aggregates test attempts, attachments, stdout/stderr, and schema summaries into one normalized run payload and reads site metadata back from the run manifest.
- The reporter writes `report.html`, `data/run.json`, per-test JSON payloads, Markdown summaries, and `reports/latest-run.json`.
- `utils/report-templates.js` and its helper modules render the dashboard entirely from normalized schema data.
- The report viewer no longer depends on spec-authored HTML summary attachments.

## 4. Dashboard and Post-Run Surfacing

- `TestRunner.readLatestReportSummary()` reads `reports/latest-run.json` after Playwright exits so the CLI can print a short run summary.
- `npm run reports:read` opens the latest generated report.
- `npm run reports:dev` serves the generated report UI with live reload for report-template work.

## 5. Data Flow Recap

1. The execution CLI resolves sites, specs, limits, and projects.
2. The runner builds a manifest and spawns Playwright with explicit run context.
3. Specs attach normalized schema payloads.
4. The custom reporter materializes HTML, JSON, and Markdown from those payloads.
5. CLI summary and report-viewer commands read the generated artifacts.
