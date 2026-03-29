# Repository Guidelines

## Project Structure & Module Organization
`utils/` exposes the shared Node modules that drive manifests, runners, reporting, and custom fixtures. Key files include `test-runner.js`, `site-loader.js`, `sitemap-loader.js`, `reporting-utils.js`, `custom-html-reporter.js`, and supporting directories like `report-components/` and `report-templates/`. Treat this folder as the canonical API surface for scripts and specs—new helpers belong here once they need reuse.

## Build, Test, and Development Commands
Whenever you touch this folder, run `npm run test:unit` to execute the companion tests under `tests/unit/`. If you introduce fixtures or reporter changes, also run the targeted Playwright suites (`node run-tests.js --site=<name> --functionality` or `--visual`) to ensure runtime compatibility. For schema tweaks (`report-schema.js`, `report-schema-validator.js`), regenerate or validate sample runs via `node run-tests.js --site=<name> --dry-run --output tmp/run.json` and open the JSON with `reports/report-utils`. Always lint before committing (`npm run lint`) since these files act as dependencies for every suite.

## Coding Style & Naming Conventions
Modules remain CommonJS, 2-space indentation, semicolons, and single quotes. Export named helpers in camelCase (`attachSchemaSummary`), keep classes PascalCase, and colocate types or schemas beside their consumers. Prefer pure, testable functions; side effects should be wrapped in small orchestrators (`runManifest`). Document tricky flows with succinct comments and update `SPEC.md` if behavior changes. Follow Conventional Commits (`feat(utils): add axe summary serializer`) and reflect process changes in the README’s commit-hash note so downstream tooling knows which contract to expect.
