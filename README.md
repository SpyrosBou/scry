# WordPress Testing Suite

Automated Playwright-powered testing harness for auditing WordPress websites across functionality, responsiveness, accessibility, and visual regression criteria. The suite standardises how sites are exercised, captures rich HTML (HyperText Markup Language) reports, and keeps a historical record of findings for ongoing quality assurance.

## Key Capabilities
- Generates Solarized-themed HTML reports with parity to the approved reporting mocks.
- Supports functionality, responsive, accessibility, and visual regression suites with per-page manifest control.
- Ships helper utilities for schema validation, reporting payloads, and Playwright fixtures.
- Discovers site pages from sitemaps and manages baseline snapshots for intentional UI (User Interface) changes.
- Provides cleanup and regeneration scripts to keep artifacts tidy during development.

## Getting Started

### Prerequisites
- Node.js 18+ and npm (Node Package Manager).
- Playwright browsers (installed during setup).
- macOS, Linux, or Windows environment with access to target WordPress sites.

### Installation
1. Install dependencies and browsers:
   ```bash
   npm run setup
   ```
2. (Optional) Refresh Playwright binaries without reinstalling packages:
   ```bash
   npm run install-browsers
   ```

### Quick Smoke Test
Verify the harness with a small responsive run (replace the site name with one from `sites/`). The runner defaults to 5 pages; use a higher number or `--pages all` when you need full coverage:
```bash
node run-tests.js --site example-site --pages 5 --responsive
```

## Running Test Suites
- **General form:** `node run-tests.js --site <name> [--pages <n|all>] [suite flags]`
- **Suite flags:** `--functionality`, `--responsive`, `--accessibility`, `--visual` (you can combine multiple suite flags; or use `--all-suites` with `--exclude`).
- **Convenience flags:** `--all-suites` selects all suites; pair with `--exclude <list>` to omit specific ones (e.g. `--exclude visual`).
- **Plan-only:** `--dry-run` prints the planned manifest and selected specs, without executing Playwright.
- **Multiple sites:** repeat `--site` or append additional site names after the options.
- **Custom specs:** `node run-tests.js --site <name> --pages <n|all> --test tests/a11y.audit.wcag.spec.js`
- **Projects:** select Playwright projects with `--browsers=chrome,firefox` or `--browsers=all`.
- **Worker pool:** tune concurrency with `--workers=<count|auto>` (defaults to `auto`, which exposes all logical cores via `PWTEST_WORKERS`).
- **Discovery:** append `--discover` to refresh sitemap-backed manifests before execution. You can also run the standalone discovery command to scaffold or refresh a site config.
  - Requirement: the base URL must include the protocol (http:// or https://).
  - Interactive (positional URL): `npm run discover -- https://woodworking.ddev.site [--local]`
  - Non-interactive (flags): `npm run discover -- --base-url=https://woodworking.ddev.site --yes --site-name=woodworking-ddev [--name "Woodworking Ddev"] [--allow-duplicate] [--local]`
  - Reuse by name (refresh sitemap-backed pages only): `npm run discover -- woodworking-ddev`
  - Flags supported: `--base-url|--baseUrl`, `--site-name|--config-name`, `--name|--display`, `--yes|-y`, `--no|-n`, `--allow-duplicate`, `--local`, `--help`.
  - Behavior: if a config for the base URL already exists, it will be reused unless `--allow-duplicate` is passed. In interactive mode you’ll be prompted; in non-interactive mode pair `--yes` with the necessary flags. When a sitemap strategy is missing, `--discover` seeds one that points to `<baseUrl>/sitemap.xml` and persists new pages back to `sites/<name>.json`.
- **Debugging:** use `--debug` for Playwright trace mode or `--output <path>` to persist manifest JSON.
- **Baseline refresh:** append `--update-baselines` alongside `--site` to regenerate visual baselines (skips functional runs and exits after Playwright completes).
- **Page cap:** omit `--pages` to use the default of 5, pass a positive integer to override, or use `--pages all` to test every available page.

### Examples
- All suites except visual on all pages:
  ```bash
  node run-tests.js --site nfsmediation-live --pages all --all-suites --exclude visual
  ```
- Equivalent using explicit flags (no visuals):
  ```bash
  node run-tests.js --site nfsmediation-live --pages all --responsive --functionality --accessibility
  ```
- Preview selection without running tests:
  ```bash
  node run-tests.js --site nfsmediation-live --pages all --responsive --functionality --accessibility --dry-run
  ```

Helpful environment variables:
- `REPORT_BROWSER` and `REPORT_BROWSER_ARGS` force a specific viewer when opening reports.
- `A11Y_SAMPLE=<n>` caps accessibility sampling when the suite is large.

## Reports and Artifacts
- Run outputs live under `reports/run-*/` with HTML in `report.html` and structured data in `data/run.json`.
- Large manifests are written to `reports/run-manifests/`; trim that folder with `npm run clean:manifests [days]` (default 15 days) when it grows.
- Capture run manifests and summaries programmatically with `--output ./reports/run-summary.json` — the file contains one entry per site with manifest metadata and report status.
- Use `npm run reports:dev` to start a preview server with live reload at http://127.0.0.1:4173/ (default). It watches `reports/run-*`, `reports/latest-run.json`, plus the template and SCSS sources in `utils/` and `docs/mocks/`, auto-refreshing immediately when report data, styling, or helper code changes.
- Override the preview port with `--port` or `REPORT_PORT`, and lock the viewer to a specific run via `--run run-YYYYMMDD-HHMMSS`.
- Use `npm run reports:read [count]` to open the most recent report(s) without hunting filenames.
- Regenerate an interactive report from stored data via `npm run reports:regenerate`.
- Clean up old artifacts with `npm run clean:reports`, `npm run clean:manifests`, or `npm run clean:test-results`.
- If a suite ran but didn’t emit schema summaries (for example, all pages returned non‑200), the report now force‑renders a placeholder panel for that suite so it’s still visible in the sidebar and “Suites at a glance”. The “Test details” panel will contain logs to diagnose why the suite produced no data.
- WCAG column scoping: the “WCAG level” column appears only in accessibility tables (WCAG audit, keyboard, reflow, reduced‑motion, iframe, and structural a11y). Other suites (links, interactive, availability, performance, responsive) don’t render this column.
- Per‑page a11y tables now include “Screenshot”, “Culprit”, and “Details”.
  - Screenshot: one or more “View” links open a modal with the image.
  - Culprit: the element(s) where the violation occurs (e.g., `h2: "Section title"`).
  - Details: a concise explanation (e.g., `Jumps H1 → H4`).
  - Keyboard audit continues to attach focused‑element screenshots when focus indicators are missing.

## Reporter Layout Migration Guide
- **Layout blueprint:** Every spec panel now targets the four-block structure used by the WCAG (Web Content Accessibility Guidelines) audit — run summary, gating violations, best-practice advisories, and per-page findings. Reuse `renderUnifiedIssuesTable` for the first two tables and `renderPerPageAccordion` plus a spec-specific page card renderer for the accordion.
- **Specs completed (four-section layout + deduped tables):**
  - `tests/a11y.audit.wcag.spec.js` (reference implementation).
  - `tests/a11y.keyboard.navigation.spec.js` — keyboard run summary funnels `gating`, `warnings` (execution failures), and `advisories` through `renderUnifiedIssuesTable`, and the per-page card maps focus metrics + issues via `renderKeyboardPageIssuesTable`.
  - `tests/a11y.structure.landmarks.spec.js` — structural semantics summary collapses `gatingIssues`, `headingSkips`, `warnings`, and `advisories` into the shared tables and per-page card generated by `renderStructurePageCard`.
  - `tests/functionality.links.internal.spec.js` — internal link integrity uses `renderInternalLinksPageCard`, with `collectIssueMessages` deduping link failures before they hit the run-level tables.
  - `tests/functionality.interactive.smoke.spec.js` — console and API (Application Programming Interface) stability normalises console/resource messages through `normalizeInteractiveMessage`, feeding `renderUnifiedIssuesTable` and the per-page card so repeated Playwright retries collapse into one row.
- **Remaining specs to migrate:** Functionality infrastructure panels (`renderAvailabilityGroupHtml`, `renderHttpGroupHtml`, `renderPerformanceGroupHtml`), responsive layout suites, and visual regression reports still use bespoke markup; track progress in `docs/reporting-redesign-roadmap.md`.
- **Porting checklist for new specs:**
  1. Update the group renderer in `utils/report-templates.js` to compose the four sections in order. Always call `collectIssueMessages` (with a spec-specific normaliser) so gating/advisory tables show unique rows.
  2. Ensure the per-page data passed to `renderPerPageAccordion` includes `_summaryClass` so status pills match gating severity. Extend or create a `render<SpecName>PageCard` helper instead of inlining markup.
  3. If raw findings contain noisy output (for example Playwright call logs), add a normaliser beside `normalizeInteractiveMessage` to trim ANSI (American National Standards Institute) codes, collapse whitespace, and simplify URLs via `simplifyUrlForDisplay`.
  4. Regenerate the target report with `npm run reports:regenerate -- run-<id>` and validate in the browser that the new layout matches the WCAG panel (run summary copy, table headings, badge classes, accordion controls).
  5. Document the migration in `docs/reporting-redesign-roadmap.md` and append the spec status entry in `plan.md` so future contributors follow the exact same steps.

## Project Structure
- `sites/` – JSON configs describing environments and page manifests.
- `tests/` – Playwright specs grouped by suite family (responsive, functionality, accessibility, visual) plus `unit/` tests.
- `utils/` – shared helpers including `test-runner.js`, fixtures, reporting utilities, and schema logic.
- `scripts/` – Node scripts backing CLI commands (`discover`, `install-browsers`, `cleanup`, report tools).
- `docs/` – reference material, reporting mocks, and the redesign roadmap.
- `reports/` & `test-results/` – generated artifacts (safe to delete; regenerated on demand).

## Configuration Workflow
1. Run `node run-tests.js --list-sites` to see available configurations.
2. Update or add site manifests in `sites/*.json`; keep `testPages` current with the production sitemap.
3. For WordPress instances served through DDEV (Docker-based development environment), pass `--local` so the runner attempts a preflight. Set `ENABLE_DDEV=true` and `DDEV_PROJECT_PATH=/absolute/path/to/project` if you want the suite to auto-run `ddev start`; when unset, the runner tries to infer the project directory from the site name and base URL.
4. When visual differences are intentional, refresh baselines:
  ```bash
  npm run baselines:update -- <site-name>
  ```

## Linting and Tests
- Lint JavaScript with `npm run lint` (or `npm run lint:fix` to auto-format where possible).
- Execute Node unit tests with `npm run test:unit`.
- Use suite shortcuts such as `npm run test:visual -- --site=<name> [--pages=<n|all>]` to mirror reporter commands.

## Troubleshooting
- If `--pages` is omitted, the runner defaults to 5 pages; supply a positive integer to widen or narrow the run, or `--pages all` to remove the cap.
- If reports fail to open, check `REPORT_BROWSER` settings or inspect the generated `reports/run-*/data/run.json`.
- For stubborn Playwright issues, clear cached browsers with `npx playwright install --force`.
- Use `npm run clean:reports -- --all` when old artifacts clutter comparisons.

## Contributing
- Follow the repository guidance in `AGENTS.md`, `SPEC.md`, and `regression_testing.md`.
- Stick to the established coding style (CommonJS modules, 2-space indentation, semicolons, single quotes).
- Re-use helpers from `utils/` instead of duplicating logic; extend schema utilities when report payloads evolve.
- Update documentation (`README.md`, `docs/`) alongside any user-facing changes or new workflows.
- Adhere to Conventional Commits, one logical change per commit, and keep commit messages under 72 characters.

## Roadmap and References
- Reporting parity progress: `docs/reporting-redesign-roadmap.md`
- Design tokens and styling: `docs/mocks/report-styles.scss`
- Full mock report reference: `docs/mocks/full-run-report.html`
- Schema inventory (planned): tracked in `docs/reporting-redesign-roadmap.md` until `docs/report-schema-inventory.md` lands.

## License
MIT © Web Dev Agency
