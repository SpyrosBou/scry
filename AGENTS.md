# Repository Guidelines

## Project Structure & Module Organization
- `run-tests.js` is the main CLI entrypoint.
- `tests/` holds Playwright specs (`responsive.*.spec.js`, `functionality.*.spec.js`, `a11y.*.spec.js`, `visual.*.spec.js`) and `tests/unit/` contains Node unit tests.
- `utils/` contains shared runner, fixtures, reporting, schemas, and site helpers (treat this as the reusable "API").
- `sites/` stores per-environment JSON manifests (`<site>-live.json`, `<site>-local.json`, `<site>-ddev.json`).
- `scripts/` contains supporting automation (discovery, reporting, maintenance, runtime).
- Generated artifacts (`reports/`, `test-results/`, screenshots) are gitignored; don't hand-edit them.

## Build, Test, and Development Commands
- Setup: `npm run setup` (installs deps, browsers, and builds report CSS).
- List configs: `node run-tests.js --list-sites`
- Run suites: `node run-tests.js --site <name> --pages <n|all> --functionality|--responsive|--accessibility|--visual`
- Combine suites: `node run-tests.js --site <name> --all-suites --exclude visual`
- Refresh page manifests: `npm run discover -- <site|https://base.url> [--local]`
- Unit tests: `npm run test:unit`
- Lint/format: `npm run lint`, `npm run prettier:check`
- Reporter styling: `npm run styles:build` (after editing `styles/report/report-styles.scss`)
- Cleanup: `npm run clean:reports`, `npm run clean:test-results`, `npm run clean:manifests`

## Coding Style & Naming Conventions
Use CommonJS, 2-space indentation, semicolons, and single quotes. Prefer small, testable helpers in `utils/` over duplicating logic in specs or scripts. Keep manifest filenames kebab-case and environment-suffixed (`example-site-live.json`).

## Testing Guidelines
Default to running via `run-tests.js` so manifests, reporting, and fixtures stay aligned. Visual baselines live in `tests/baseline-snapshots/`; update intentionally via `node run-tests.js --site <name> --update-baselines` (or targeted `npx playwright test ... --update-snapshots`).

## Commit & Pull Request Guidelines
Prefer Conventional Commits (seen in history): `fix(a11y): ...`, `style(report): ...`, `docs: ...`. Keep commits single-purpose and run `npm run lint` plus the smallest relevant suite(s) and/or `npm run test:unit`.

In PRs, include: affected site(s), suites run, `--pages` cap, and whether manifests or baselines changed. Avoid screenshots in git; link to the generated `reports/run-*` output or CI artifacts instead.

## Security & Configuration Tips
Do not commit credentials; use environment variables. For local `.ddev.site` targets, pass `--local` and optionally set `ENABLE_DDEV=true` and `DDEV_PROJECT_PATH=/absolute/path/to/project`.
