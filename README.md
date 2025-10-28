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
Verify the harness with a small responsive run (replace the site name with one from `sites/`):
```bash
node run-tests.js --site example-site --pages 5 --responsive
```

## Running Test Suites
- **General form:** `node run-tests.js --site <name> --pages <n> [suite flags]`
- **Suite flags:** `--functionality`, `--responsive`, `--accessibility`, `--visual` (choose one style: flags or `--test` globs).
- **Multiple sites:** repeat `--site` or append additional site names after the options.
- **Custom specs:** `node run-tests.js --site <name> --pages <n> --test tests/a11y.audit.wcag.spec.js`
- **Projects:** select Playwright projects with `--browsers=chrome,firefox` or `--browsers=all`.
- **Discovery:** append `--discover` to refresh sitemap-backed manifests before execution.
- **Debugging:** use `--debug` for Playwright trace mode or `--output <path>` to persist manifest JSON.

Helpful environment variables:
- `REPORT_BROWSER` and `REPORT_BROWSER_ARGS` force a specific viewer when opening reports.
- `A11Y_SAMPLE=<n>` caps accessibility sampling when the suite is large.

## Reports and Artifacts
- Run outputs live under `reports/run-*/` with HTML in `report.html` and structured data in `data/run.json`.
- Use `npm run reports:read [count]` to open the most recent report(s) without hunting filenames.
- Regenerate an interactive report from stored data via `npm run reports:regenerate`.
- Clean up old artifacts with `npm run clean:reports`, `npm run clean:manifests`, or `npm run clean:test-results`.

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
3. For WordPress instances served through DDEV, use `--local` to perform the preflight check automatically.
4. When visual differences are intentional, refresh baselines:
   ```bash
   npm run baselines:update -- <site-name>
   ```

## Linting and Tests
- Lint JavaScript with `npm run lint` (or `npm run lint:fix` to auto-format where possible).
- Execute Node unit tests with `npm run test:unit`.
- Use suite shortcuts such as `npm run test:visual -- --site=<name> --pages=<n>` to mirror reporter commands.

## Troubleshooting
- Ensure `--pages` is always provided; the runner enforces a positive integer to bound workloads.
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
