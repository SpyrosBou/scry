# Scry

Automated Playwright-powered auditing platform for WordPress websites across functionality, responsiveness, accessibility, and visual regression criteria. Scry standardises how sites are exercised, captures rich HTML reports, and keeps a historical record of findings for ongoing quality assurance.

> Last updated for ref `4fe151f`.

## Key Capabilities

- Generates Solarized-themed HTML reports with parity to the approved reporting mocks.
- Supports functionality, responsive, accessibility, and visual regression suites with per-page manifest control.
- Ships helper utilities for schema validation, reporting payloads, and Playwright fixtures.
- Discovers site pages from sitemaps and manages baseline snapshots for intentional UI (User Interface) changes.
- Provides cleanup and regeneration scripts to keep artifacts tidy during development.

## Getting Started

### Prerequisites

- Node.js 18+ and npm (Node Package Manager).
- Playwright browsers (installed during bootstrap).
- macOS, Linux, or Windows environment with access to target WordPress sites.

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```
2. Bootstrap Playwright browsers and report styles:
   ```bash
   npm run setup
   ```
3. (Optional) Refresh Playwright binaries without reinstalling packages:
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
- **Debugging:** use `--debug` for Playwright trace mode or `--output <path>` to persist manifest JSON.
- **Page cap:** omit `--pages` to use the default of 5, pass a positive integer to override, or use `--pages all` to test every available page.

### Discovery

- Use `npm run discover` to scaffold or refresh sitemap-backed site configs. `run-tests.js` no longer mutates `sites/*.json`.
  - Requirement: the base URL must include the protocol (http:// or https://).
  - Interactive (positional URL): `npm run discover -- https://woodworking.ddev.site [--local]`
  - Non-interactive (flags): `npm run discover -- --base-url=https://woodworking.ddev.site --yes --site-name=woodworking-ddev [--name "Woodworking Ddev"] [--allow-duplicate] [--local]`
  - Reuse by name (refresh sitemap-backed pages only): `npm run discover -- woodworking-ddev`
  - Flags supported: `--base-url|--baseUrl`, `--site-name|--config-name`, `--name|--display`, `--yes|-y`, `--no|-n`, `--allow-duplicate`, `--local`, `--help`.
  - Behavior: if a config for the base URL already exists, it will be reused unless `--allow-duplicate` is passed. In interactive mode you’ll be prompted; in non-interactive mode pair `--yes` with the necessary flags. When a sitemap strategy is missing, the discovery command seeds one that points to `<baseUrl>/sitemap.xml` and persists new pages back to `sites/<name>.json`.
  - Host guard rails: when sitemap URLs resolve to a different host (for example `example.com` vs `www.example.com`), discovery now warns, temporarily follows the alternate host so `testPages` stay populated, and automatically rewrites `baseUrl` and `discover.sitemapUrl` in the site config to that canonical host.

### Baseline Refresh

- Use `npm run baselines:update -- <site-name>` to regenerate visual baselines. `run-tests.js` no longer handles baseline updates directly.

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
- `A11Y_PARALLEL_PAGES`, `A11Y_STRUCTURE_CONCURRENCY`, `A11Y_KEYBOARD_CONCURRENCY`, `A11Y_MOTION_CONCURRENCY`, `A11Y_REFLOW_CONCURRENCY`, and `A11Y_IFRAME_CONCURRENCY` tune how many accessibility pages audit simultaneously (defaults auto-scale based on CPU count).
- `A11Y_PARALLEL_PAGES`, `A11Y_STRUCTURE_CONCURRENCY`, and `A11Y_KEYBOARD_CONCURRENCY` control how many accessibility audits run concurrently (defaults to a small CPU-aware limit so we stay performant without hammering target sites).

## Reports and Artifacts

- Run outputs live under `reports/run-*/` with HTML in `report.html` and structured data in `data/run.json`.
- The custom HTML reporter is always enabled (even on CI) so every run includes `report.html` plus `data/run.json`; CI simply layers Playwright's `blob` reporter on top for merges.
- Binary attachments (screenshots, diffs, and other large blobs) are saved beside the run as files under `reports/run-*/data/attachments/` and the HTML references them relatively so even extremely large accessibility runs do not try to inline hundreds of megabytes of base64 data (which previously caused the reporter to crash before writing `report.html`). The reporter retains the first 20 Playwright screenshots per test (`REPORT_IMAGE_LIMIT=<n>` raises the cap or `0`/`infinity` disables it).
- Large manifests are written to `reports/run-manifests/`; trim that folder with `npm run clean:manifests [days]` (default 15 days) when it grows.
- Capture run manifests and summaries programmatically with `--output ./reports/run-summary.json` — the file contains one entry per site with manifest metadata and report status.
- Use `npm run reports:dev` to start a preview server with live reload at http://127.0.0.1:4173/ (default). It watches `reports/run-*`, `reports/latest-run.json`, plus the template and SCSS sources in `utils/` and `docs/mocks/`, auto-refreshing immediately when report data, styling, or helper code changes.
- Override the preview port with `--port` or `REPORT_PORT`, and lock the viewer to a specific run via `--run run-YYYYMMDD-HHMMSS`.
- Use `npm run reports:read [count]` to open the most recent report(s) without hunting filenames.
- Regenerate an interactive report from stored data via `npm run reports:regenerate`.
- Status summary pills in the HTML report now display zero counts (e.g., “0 blockers”) so stakeholders can distinguish a clean run from missing data.
- When tweaking `styles/report/report-styles.scss`, run `npm run styles:build` to refresh the precompiled CSS that the runtime embeds—Sass no longer compiles on import.
- Clean up old artifacts with `npm run clean:reports`, `npm run clean:manifests`, or `npm run clean:test-results`.
- If a suite ran but didn’t emit schema summaries (for example, all pages returned non‑200), the report now force‑renders a placeholder panel for that suite so it’s still visible in the sidebar and “Suites at a glance”. The “Test details” panel will contain logs to diagnose why the suite produced no data.
- WCAG column scoping: the “WCAG level” column appears only in accessibility tables (WCAG audit, keyboard, reflow, reduced‑motion, iframe, and structural a11y). Other suites (links, interactive, availability, performance, responsive) don’t render this column.
- Per‑page a11y tables now include “Screenshot”, “Culprit”, and “Details”.
  - Screenshot: one or more “View” links open a modal with the image.
  - Culprit: the element(s) where the violation occurs (e.g., `h2: "Section title"`).
  - Details: a concise explanation (e.g., `Jumps H1 → H4`).
  - Keyboard audit continues to attach focused‑element screenshots when focus indicators are missing.

## Reporting Architecture

- Specs attach schema payloads only. They do not attach HTML or Markdown presentation fragments.
- The custom reporter aggregates those payloads into `data/run.json`, `report.html`, and Markdown summaries.
- Active summary types and metadata meanings are documented in `docs/report-schema-inventory.md`.
- Suite-specific renderers live under `utils/report-templates/groups/`; `utils/report-templates.js` is the shared orchestration layer.

## Project Structure

- `sites/` – JSON configs describing environments and page manifests.
- `tests/` – Playwright specs grouped by suite family (responsive, functionality, accessibility, visual) plus `unit/` tests.
- `utils/` – shared helpers including `test-runner.js`, fixtures, reporting utilities, and schema logic.
- `scripts/` – Node scripts grouped by concern (`discovery/`, `reporting/`, `maintenance/`, `runtime/`). See `scripts/README.md` for the current tree.
- `docs/` – reference material, reporting mocks, and the redesign roadmap.
- `reports/` & `test-results/` – generated artifacts (safe to delete; regenerated on demand).

## Configuration Workflow

1. Run `node run-tests.js --list-sites` to see available configurations.
2. Update or add site manifests in `sites/*.json`; use `npm run discover -- <site-name|https://base.url>` to refresh `testPages` from a sitemap.
3. For WordPress instances served through DDEV (Docker-based development environment), pass `--local` to `npm run discover` or `node run-tests.js` when you want a local preflight. Set `ENABLE_DDEV=true` and `DDEV_PROJECT_PATH=/absolute/path/to/project` if you want the tooling to auto-run `ddev start`; when unset, it tries to infer the project directory from the site name and base URL.
4. When visual differences are intentional, refresh baselines:

```bash
npm run baselines:update -- <site-name>
```
5. For a deterministic local smoke target, start the bundled landing page with `npm run site:dev` and run the suite against `scry-site-local`.

## Linting and Tests

- Lint all JavaScript sources with `npm run lint` (or `npm run lint:fix` to auto-format where possible). The flat config now warns on unused `eslint-disable` directives so lingering suppressions can be cleaned up quickly and includes Playwright spec overrides with browser globals.
- Enforce shared helper/config formatting with `npm run prettier:check` (or `npm run prettier:write`) so the scriptable JS modules tracked by `.prettierrc` stay aligned.
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

> README last updated for commit `8c3c2d5aa2f85ba5084881575846702212686305`.

## Roadmap and References

- Reporting parity progress: `docs/reporting-redesign-roadmap.md`
- Design tokens and styling: `styles/report/report-styles.scss`
- Full mock report reference: `docs/mocks/full-run-report.html`
- Active schema inventory: `docs/report-schema-inventory.md`

## License

MIT © Scry
