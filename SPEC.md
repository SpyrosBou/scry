# Scry – Product & Architecture Specification

## Vision

- Provide a unified test launcher that powers both command-line and upcoming GUI workflows.
- Allow testers to compose runs step by step (select specs → site → page scope → browsers) with optional advanced flags.
- Keep configuration and execution deterministic regardless of entry-point (CLI, GUI, automation).

## User Experience Goals

- **Stepwise selection:** Users pick specs, sites, page caps, and browser projects in discrete steps; advanced execution options can layer in later without changing the base flow.
- **Manifest visibility:** Before launching, the tool can display a summary of the resolved manifest (pages, specs, browsers) so the user knows exactly what will run.
- **Progress feedback:** Execution emits structured events (start, per-site updates, summaries) consumable by CLI logs today and GUI progress views later.
- **Artifact discoverability:** Every run produces a run manifest and clear pointers to reports/test-results folders for post-run inspection.

## Architecture Direction

- **Core Engine:** A reusable module accepts a structured `RunConfig` and orchestrates Playwright execution. It handles site loading, validation, page-cap application, and manifest authoring.
- **Discovery Service:** Site manifest discovery is a separate mutating workflow. It owns sitemap refresh, canonical-host correction, and intentional `sites/*.json` writes.
- **Adapters:**
  - _CLI Adapter_ (`run-tests.js`) parses arguments, builds a `RunConfig`, invokes the core, and renders console output.
  - _GUI Adapter_ (future) presents step-wise selectors, serialises choices into a `RunConfig`, and streams progress via the same core API.
- **Manifests:** The engine emits a canonical run manifest containing resolved pages, specs, projects, limits, and a validated site-config snapshot. It is shared with workers via env vars or temp files and exposed to adapters for preview/logging.
- **Events API (future):** Core runner exposes hooks (e.g., `onProgress`, `onSummary`) so adapters render feedback without scraping stdout.

## Current Implementation Snapshot

- Manifest generation is centralised in `TestRunner.prepareRunManifest`. Small payloads are exported inline via `SITE_RUN_MANIFEST_INLINE`; larger ones persist under `reports/run-manifests/` and are referenced through `SITE_RUN_MANIFEST`.
- Specs and fixtures load site context from the run manifest, not from ad hoc env fallbacks.
- The CLI adapter listens to `onEvent` hooks (`manifest:ready`, `manifest:persisted`, `run:complete`) to print previews ahead of execution—mirroring the planned GUI stepper preview.
- `run-tests.js` is execution-only. Discovery and baseline refresh run through dedicated commands (`npm run discover`, `npm run baselines:update`) rather than through runner flags.
- `--output=<path>` lets callers capture manifest + run summaries as JSON for dashboards or other tooling without scraping stdout.
- `utils/run-manifest.js` provides shared helpers for loading/parsing manifests so specs, reporters, and future tooling avoid duplicating runtime-context parsing.
- Profile-specific env mutations are passed through structured overrides (`envOverrides`) rather than mutating `process.env`, keeping adapter state isolated.
- Reporter payloads follow a standard contract: suites that emit `codex.report.summary` attachments must supply `metadata.summaryType`, must not embed presentation HTML/Markdown, and must populate `summary.gating`, `summary.warnings`, `summary.advisories`, and `summary.notes` arrays for the standard finding suites. The validator in `utils/report-schema-validator.js` enforces this.

## Implementation Roadmap

1. **Finish reporting modularization**
   - Keep `utils/report-templates.js` as orchestration plus shared primitives only.
   - Continue moving suite-specific rendering into grouped modules and keep renderer coverage aligned with the active `summaryType` registry.
2. **Lock manifest discipline**
   - Keep the run manifest as the only supported execution context contract.
   - Reject invalid site configs before any browser work and keep discovery as the only mutating path.
3. **Adapter alignment** (future)
   - Surface manifest summaries in the CLI and GUI from the same helper layer.
   - Expose richer progress callbacks only through structured core events.

## Open Questions

- Should manifest files live under `reports/run-manifests/` or OS temp folders, and what retention policy should we adopt?
- How should we expose partial success/failure states to future GUI dashboards (per-spec vs per-site granularity)?
- Do we need manifest versioning to support backward compatibility between CLI and GUI releases?
