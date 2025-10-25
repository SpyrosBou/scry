# Visual Regression: Next Steps

This note captures the remaining tasks to harden our Playwright-based visual regression testing and keep it stable across sites and CI.

## High‑Priority
- Pin environment for deterministic screenshots
  - Force timezone (e.g., `TZ=UTC`) and stable locale for runs.
  - Ensure a consistent font set is available in CI (fallbacks can shift layout).
- Expand dynamic masking
  - Add per‑site `dynamicMasks` and per‑page masks where animated, rotating, or time‑based UI causes diffs.
  - Document common dynamic selectors (carousels, tickers, dates) and add them to site configs.
- Tighten thresholds
  - Keep stricter thresholds for static pages (content/UI), relax on homepages or dynamic areas via `visualOverrides`.
  - Audit current thresholds in `sites/*` and lower where stable.
- Surface diff artifacts in the custom report
  - Link the Playwright diff/actual/expected files from our HTML summary in the custom report so reviewers can jump directly to images.

## Nice‑to‑Have
- Baseline management guidance
  - Checklist for intentional UI changes: run locally, inspect diffs, update baselines via `npm run baselines:update -- <name>`.
  - Encourage small, scoped UI changes to keep diffs readable.
- CI profile tuning
  - Run visual tests only on Chrome in CI; keep Firefox/WebKit for functional coverage.
  - Make `--project=Chrome` the default for visuals in pipelines.
- Stability helpers
  - Expand the global “disable animations” CSS (already injected) where needed.
  - Consider waiting for web fonts to load or preloading local test fonts to avoid reflows.

## Implementation Hints
- Snapshot path template is set in `playwright.config.js` (baseline under `tests/baseline-snapshots/`).
- Visual test lives at `tests/visual.regression.snapshots.spec.js`. It already supports:
  - Per‑site thresholds (`visualThresholds`), per‑page overrides (`visualOverrides`), and masks (`dynamicMasks`).
  - Per‑viewport report summaries (HTML + Markdown) with inline baseline/local/diff previews for quick scanning.
- Add diff links by mapping the test name + project to artifact paths inside `test-results/` and attaching `<a>` elements in the summary table.

## Docs to Keep Current
- README: how to update baselines, how thresholds/masks/overrides work, reminder about keeping `testPages` current.
- tests/CLAUDE.md: note that visual regression and responsive structure specs also attach report summaries.

## Quick Commands
- Update visual baselines for a site (visuals only):
  - `npm run baselines:update -- <name>`
- Run visual regression only (defaults to Chrome desktop):
  - `node run-tests.js --site=<name> --pages=5 --visual`
