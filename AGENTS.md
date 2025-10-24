# Repository Guidelines

Whilst working on this repo you can assume we are concerned with the functionality and performance of the testing suite itself as well as test accuracy and legitimacy - and not whether the sites we run tests on currently pass or fail the tests.

## Project Structure & Module Organization

- `tests/` holds Playwright specs. Suites follow the naming convention `responsive.*.spec.js`, `functionality.*.spec.js`, `a11y.*.spec.js`, and `visual.*.spec.js`; baselines live under `tests/baseline-snapshots/`.
- `utils/` contains shared helpers (`test-runner.js`, `test-helpers.js`, `reporting-utils.js`, site loaders, and schema utilities).
- `sites/` stores JSON configs per environment (`example-site.json`, `*-local.json`, `*-live.json`). Keep `testPages` current with production URLs.
- `reports/` and `test-results/` hold generated artifacts; each run lands in `reports/run-*/report.html` with detailed data in `reports/run-*/data/run.json`.

## Build, Test, and Development Commands

- `npm run setup` installs all dependencies and Playwright browsers; use `npm run install-browsers` if you only need to refresh the browser binaries.
- `node run-tests.js --site=<name>` executes the default Chrome desktop run. Layer `--responsive`, `--functionality`, `--accessibility`, or `--visual` to target suite families, or pass one or more spec paths/Globs via `--spec` / trailing arguments (for example `node run-tests.js --site=createarts-live --spec tests/a11y.audit.wcag.spec.js`).
- `--pages <n>` caps the resolved manifest to the first _n_ pages (e.g. `node run-tests.js --site=createarts-live --spec tests/a11y.audit.wcag.spec.js --pages 5`); `A11Y_SAMPLE=<n>` remains available as an environment override for accessibility runs.
- `--project=<name>` (or comma-separated list) lets you choose Playwright projects; omit for the Chrome desktop default.
- `npm run reports:read [count]` opens the latest HTML report(s); set `REPORT_BROWSER`/`REPORT_BROWSER_ARGS` to force a specific viewer.
- `npm run clean-reports` keeps the 10 newest `reports/run-*` directories (append `-- --all` or `-- -a` to purge everything) and `npm run clean-manifests` prunes cached manifest files.
- `npm run clean-test-results` resets Playwright's `test-results/` folder.
- `npm run test:unit` runs the Node test suite in `tests/unit/`.
- `npm run discover -- <site>` hits sitemap discovery and updates the matching config; review the diff before committing.
- `npm run update-baselines` refreshes visual regression snapshots for `example-site`.
- Prefer `ddev exec` when interacting with containerized WordPress instances in `/home/warui/sites`.

## Coding Style & Naming Conventions

- JavaScript uses CommonJS modules, 2-space indentation, semicolons, and single quotes.
- Reference helpers instead of duplicating logic; add rare inline comments only for complex flows.
- Run `npm run lint` (ESLint + Prettier) before submitting; avoid introducing non-ASCII characters unless already present.

## Testing Guidelines

- Tests rely on `@playwright/test` with custom fixtures in `utils/test-fixtures.js` and Axe accessibility helpers.
- Use `node run-tests.js --list-sites` to discover configs; `--functionality`, `--visual`, `--responsive`, and `--accessibility` let you target specific suites.
- The runner honours `--pages <n>` to cap page selection from the manifest when you need a quick smoke or partial audit.
- Update visual baselines with `npx playwright test tests/visual.regression.snapshots.spec.js --update-snapshots` when UI changes are intentional.
- Accessibility sampling honors `A11Y_SAMPLE` env vars and `a11yResponsiveSampleSize` config entries.
- Accessibility specs now attach schema-backed run and page summaries via `attachSchemaSummary` with helpers in `utils/reporting-utils.js` / `utils/report-schema.js`; extend those utilities instead of hand-rolled HTML so run-level cards stay consistent.

## Commit & Pull Request Guidelines

- Follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.), e.g., `fix: harden wcag report filtering`.
- Stage related changes only; run pertinent suites (`node run-tests.js --site=<name>`) and mention report paths or artifacts in the PR description.
- PRs should describe scope, reproduction steps, linked issues, and highlight any failing tests or required follow-ups.

## Security & Configuration Tips

- Never commit secrets or `.env` files. Use `*-local.json` for non-production endpoints.
- Keep `SITE_BASE_URL` accurate; accessibility and infrastructure suites treat 4xx/5xx responses as failures.
- When enabling sitemap discovery, run `node run-tests.js --site=<name> --discover` and validate the generated `testPages` list before committing.
