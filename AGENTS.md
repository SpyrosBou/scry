# Repository Guidelines

Whilst working on this repo you can assume we are concerned with the functionality and performance of the testing suite itself as well as test accuracy and legitimacy - and not whether the sites we run tests on currently pass or fail the tests.

## Project Structure & Module Organization

- `tests/` holds Playwright specs. Suites follow the naming convention `responsive.*.spec.js`, `functionality.*.spec.js`, `a11y.*.spec.js`, and `visual.*.spec.js`; baselines live under `tests/baseline-snapshots/`.
- `utils/` contains shared helpers (`test-runner.js`, `test-helpers.js`, `reporting-utils.js`, site loaders, and schema utilities).
- `sites/` stores JSON configs per environment (`example-site.json`, `*-local.json`, `*-live.json`). Keep `testPages` current with production URLs.
- `reports/` and `test-results/` hold generated artifacts; each run lands in `reports/run-*/report.html` with detailed data in `reports/run-*/data/run.json`.

## Build, Test, and Development Commands

- `npm run setup` installs all dependencies and Playwright browsers; use `npm run install-browsers` if you only need to refresh the browser binaries.
- Run `npm run styles:build` whenever you edit `docs/mocks/report-styles.scss` so the precompiled CSS that powers the HTML reporter stays in sync (runtime modules now only read the generated CSS).
- `node run-tests.js --site=<name> --functionality` executes the default Chrome desktop run (append `--pages=<n|all>` to override the 5-page default). Layer `--responsive`, `--functionality`, `--accessibility`, or `--visual` to target suite families (you can combine multiple suite flags), or pass one or more spec paths/Globs via `--test` / trailing arguments (for example `node run-tests.js --site=createarts-live --pages all tests/a11y.audit.wcag.spec.js`).
- `--pages <n|all>` (optional, default 5) caps the resolved manifest to the first _n_ pages or removes the cap entirely (e.g. `node run-tests.js --site=createarts-live --pages all --functionality`); `A11Y_SAMPLE=<n>` remains available as an environment override for accessibility runs.
- `--project=<name>` (or comma-separated list) lets you choose Playwright projects; omit for the Chrome desktop default.
- `--workers=<count|auto>` sets the Playwright worker pool (`PWTEST_WORKERS`) so you can dial concurrency up or down when diagnosing flaky runs.
- `npm run reports:read [count]` opens the latest HTML report(s); set `REPORT_BROWSER`/`REPORT_BROWSER_ARGS` to force a specific viewer.
- `npm run clean:reports` keeps the 10 newest `reports/run-*` directories (append `-- --all` or `-- -a` to purge everything) and `npm run clean:manifests` prunes cached manifest files.
- `npm run clean:test-results` resets Playwright's `test-results/` folder.
- `npm run test:unit` runs the Node test suite in `tests/unit/`.
- `--update-baselines` regenerates visual baselines for the supplied `--site` values and exits once Playwright finishes (same behaviour as `npm run baselines:update` but without leaving the runner).
- `--output <path>` captures per-site manifest metadata and run summaries in JSON so you can archive or export results after each invocation.
- Suite shortcuts: `npm run test:visual -- --site=<name> [--pages=<n|all>]`, `npm run test:responsive -- --site=<name> [--pages=<n|all>]`, `npm run test:functionality -- --site=<name> [--pages=<n|all>]`, `npm run test:accessibility -- --site=<name> [--pages=<n|all>]`.
  - Convenience: use `--all-suites` to select all suites, pair with `--exclude <list>` to omit any (e.g. `--exclude visual`).
  - Use `--dry-run` to preview the manifest/spec selection without executing tests.
- Suite flags and `--test` patterns are mutually exclusive—choose one style per invocation.
- `npm run discover -- <site|https://base.url>` updates sitemap-backed pages and can scaffold new configs. The base URL must include `http://` or `https://`. Examples:
  - Interactive from URL: `npm run discover -- https://woodworking.ddev.site --local`
  - Non-interactive flags: `npm run discover -- --base-url=https://example.com --yes --site-name=example-live [--name "Example Live"] [--allow-duplicate] [--local]`
  - Reuse existing by name: `npm run discover -- example-live`
- When a site lacks a `discover` block, the runner seeds a sitemap strategy pointing at `<baseUrl>/sitemap.xml` so new pages can be persisted back into `sites/<name>.json`.
- `npm run baselines:update -- <site>` refreshes visual regression snapshots for any configured site.
- Prefer `ddev exec` when interacting with containerized WordPress instances in `/home/warui/sites`.

## Coding Style & Naming Conventions

- JavaScript uses CommonJS modules, 2-space indentation, semicolons, and single quotes.
- Reference helpers instead of duplicating logic; add rare inline comments only for complex flows.
- Run `npm run lint` (ESLint + Prettier) before submitting; avoid introducing non-ASCII characters unless already present.

## Testing Guidelines

- Tests rely on `@playwright/test` with custom fixtures in `utils/test-fixtures.js` and Axe accessibility helpers.
- Use `node run-tests.js --list-sites` to discover configs; `--functionality`, `--visual`, `--responsive`, and `--accessibility` let you target specific suites.
- The runner honours an optional `--pages <n|all>` override to cap page selection from the manifest (defaults to 5 when omitted).
- Update visual baselines with `npx playwright test tests/visual.regression.snapshots.spec.js --update-snapshots` when UI changes are intentional.
- Accessibility sampling honors `A11Y_SAMPLE` env vars and `a11yResponsiveSampleSize` config entries.
- Large manifests are persisted under `reports/run-manifests/`; prune stale entries with `npm run clean:manifests [days]` (default 15 days).
- Accessibility specs now attach schema-backed run and page summaries via `attachSchemaSummary` with helpers in `utils/reporting-utils.js` / `utils/report-schema.js`; extend those utilities instead of hand-rolled HTML so run-level cards stay consistent.
- Reporter behavior: if a suite executes but emits no summaries (e.g., all pages 4xx), the HTML report force‑renders a placeholder panel for that suite. This keeps the UI consistent with the selected flags; check the “Test details” panel for logs.
- WCAG column only appears in accessibility suites (WCAG audit, keyboard, structure, reflow, reduced‑motion, iframe). Non‑a11y suites never display a WCAG column.

## Commit & Pull Request Guidelines

- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.), e.g., `fix: harden wcag report filtering`.
- Stage related changes only; run pertinent suites (`node run-tests.js --site=<name> --functionality` with `--pages=<n|all>` if you need a different cap) and mention report paths or artifacts in the PR description.
- PRs should describe scope, reproduction steps, linked issues, and highlight any failing tests or required follow-ups.

## Security & Configuration Tips

- Never commit secrets or `.env` files. Use `*-local.json` for non-production endpoints.
- Keep `SITE_BASE_URL` accurate; accessibility and infrastructure suites treat 4xx/5xx responses as failures.
- When enabling sitemap discovery, run `npm run discover -- <name>` and validate the generated `testPages` list before committing.
- For DDEV (Docker-based development environment) sites, combine `--local` with `ENABLE_DDEV=true` and `DDEV_PROJECT_PATH=/absolute/path` so the runner can start the container automatically; it will fall back to inferring the project directory from the site name and base URL if you omit the path.
