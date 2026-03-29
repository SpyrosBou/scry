# Website Testing Runner – Product & Architecture Specification

## Vision

- Provide a unified test launcher that powers both command-line and upcoming GUI workflows.
- Allow testers to compose runs step by step (select specs → site → page scope → browsers) with optional advanced flags.
- Keep configuration and execution deterministic regardless of entry-point (CLI, GUI, automation).

## User Experience Goals

- **Stepwise selection:** Users pick specs, sites, page caps, and browser projects in discrete steps; advanced options can layer in later (discovery hooks, tagging, etc.).
- **Manifest visibility:** Before launching, the tool can display a summary of the resolved manifest (pages, specs, browsers) so the user knows exactly what will run.
- **Progress feedback:** Execution emits structured events (start, per-site updates, summaries) consumable by CLI logs today and GUI progress views later.
- **Artifact discoverability:** Every run produces a run manifest and clear pointers to reports/test-results folders for post-run inspection.

## Architecture Direction

- **Core Engine:** A reusable module accepts a structured `RunConfig` and orchestrates Playwright execution. It handles site loading, discovery, homepage guarantees, sampling, and manifest authoring.
- **Adapters:**
  - _CLI Adapter_ (`run-tests.js`) parses arguments, builds a `RunConfig`, invokes the core, and renders console output.
  - _GUI Adapter_ (future) presents step-wise selectors, serialises choices into a `RunConfig`, and streams progress via the same core API.
- **Manifests:** The engine emits a canonical run manifest containing resolved pages, specs, projects, limits, and metadata. It is shared with workers via env vars or temp files and exposed to adapters for preview/logging.
- **Events API (future):** Core runner exposes hooks (e.g., `onProgress`, `onSummary`) so adapters render feedback without scraping stdout.

## Current Implementation Snapshot

- Manifest generation is centralised in `TestRunner.prepareRunManifest`. Small payloads are exported inline via `SITE_RUN_MANIFEST_INLINE`; larger ones persist under `reports/run-manifests/` and are referenced through `SITE_RUN_MANIFEST`.
- `SITE_TEST_PAGES` (and optional `SITE_TEST_PAGES_LIMIT`) remain for backward compatibility, but specs now primarily read from the manifest via `utils/run-manifest.js` or through `SiteLoader` overrides.
- The CLI adapter listens to `onEvent` hooks (`manifest:ready`, `manifest:persisted`, `run:complete`) to print previews ahead of execution—mirroring the planned GUI stepper preview.
- `--output=<path>` lets callers capture manifest + run summaries as JSON for dashboards or other tooling without scraping stdout.
- `utils/run-manifest.js` provides shared helpers for loading/parsing manifests so specs and future tooling avoid duplicating env parsing.
- Profile-specific env mutations are passed through structured overrides (`envOverrides`) rather than mutating `process.env`, keeping adapter state isolated.
- Reporter payloads follow a standard contract: suites that emit `codex.report.summary` attachments must populate `summary.gating`, `summary.warnings`, `summary.advisories`, and `summary.notes` arrays (plus any spec-specific metrics). The validator in `utils/report-schema-validator.js` enforces this to keep the refreshed UI consistent, and the current inventory lives in `docs/report-schema-inventory.md`.

## Implementation Roadmap

1. **Config Helpers**
   - Introduce helpers that convert adapter input into a normalised `RunConfig` object.
   - Encapsulate page selection (discovery, homepage insertion, cap application) in one place.
2. **Manifest Generation**
   - Produce a structured manifest (`site`, `pages`, `specs`, `projects`, `limits`, timestamps).
   - Use env overrides for small manifests; fall back to persisted temp files for larger payloads.
   - Keep `SITE_TEST_PAGES` for backward compatibility while signalling the manifest path to workers.
3. **Runner Integration**
   - Refactor `TestRunner.runTestsForSite` to rely on the new helpers and manifest data when spawning Playwright.
   - Avoid mutating global `process.env`; provide env payloads explicitly.
4. **Adapter Alignment** (future)
   - Update CLI output to optionally surface manifest summaries.
   - Design the GUI stepper around the same helper functions and manifest preview.
5. **Events & Telemetry** (future)
   - Add optional progress callbacks and richer status objects so GUIs can display live feedback.

## Open Questions

- Should manifest files live under `reports/run-manifests/` or OS temp folders, and what retention policy should we adopt?
- How should we expose partial success/failure states to future GUI dashboards (per-spec vs per-site granularity)?
- Do we need manifest versioning to support backward compatibility between CLI and GUI releases?
