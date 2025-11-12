# Repository Guidelines

## Project Structure & Module Organization
This directory houses every Playwright spec plus supporting assets. Suite naming signals intent: `responsive.*.spec.js`, `functionality.*.spec.js`, `a11y.*.spec.js`, and `visual.*.spec.js`. Baselines for visual snapshots live under `tests/baseline-snapshots/`, and `tests/unit/` contains Node-level tests for helpers.

## Build, Test, and Development Commands
Use the runner for most workflows: `node run-tests.js --site=<name> --functionality` (or `--responsive`, `--visual`, `--accessibility`). Combine flags or use `--all-suites --exclude visual` to mix coverage. Override selection with `--pages <n|all>` or pass specific spec globs (`node run-tests.js --test tests/a11y.audit.wcag.spec.js`). For plain Playwright, `npx playwright test tests/visual.regression.snapshots.spec.js --update-snapshots` refreshes baselines. Run `npm run test:unit` when editing fixtures or helpers referenced from this folder. Keep generated output under `test-results/` and clean via `npm run clean:test-results` rather than manual deletion.

## Coding Style & Naming Conventions
Specs use Playwright’s test API with CommonJS imports, 2-space indentation, and single quotes. Keep describe blocks scoped to a suite (`test.describe('functionality: infrastructure health', ...)`) and reference shared logic from `utils/test-helpers.js` or `utils/test-fixtures.js` instead of duplicating setup. When adding baselines, note the suite and site in the PR description so reviewers know visual diffs are intentional. Commit messages should follow Conventional Commits (`test(responsive): extend hero breakpoint coverage`), and after renaming or adding suites, update README tables plus the commit-hash note per the root guidelines.
