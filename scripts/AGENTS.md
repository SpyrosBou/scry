# Repository Guidelines

## Project Structure & Module Organization
`scripts/` now groups Node utilities by concern:

- `discovery/` (site manifest workflows such as `discover-pages.js`, `update-baselines.js`)
- `reporting/` (report generation + preview helpers, including `run-utils.js` and the dev server)
- `maintenance/` (cleanup, browser install, fixture servers, teardown guards)
- `runtime/` (Playwright hooks and other bootstrapping pieces)

Each script should stay self-contained, keep its filename action-oriented, and document required environment variables at the top of the file. Shared logic belongs in `utils/` so that unit tests can cover it.

## Build, Test, and Development Commands
Run scripts directly with `node scripts/<area>/<name>.js` or via the npm tasks (`npm run discover -- --base-url=...`, `npm run reports:read`). Keep CLI flags consistent with the runner (for example, share `--site`, `--pages`, `--workers`). For watch-style tools (`reporting/serve-report-dev.js`, `maintenance/static-server.js`), document default ports and guard against collisions with `process.env.PORT`. Before committing, run `npm run lint` plus any relevant maintenance helpers (for example `node scripts/maintenance/cleanup.js clean-reports --all`) to confirm logging and exit codes behave as expected.

## Coding Style & Naming Conventions
Scripts follow CommonJS, 2-space indentation, and single quotes. Add a short header comment that explains the script’s purpose plus any side effects, keep logging single-line with a consistent prefix, and export helper functions in camelCase when sharing logic. Prefer utilities under `utils/` instead of re-implementing behaviors; cover those helpers with tests in `tests/unit`. Any script that mutates files must describe its scope in the README change log per root guidance, and major behavior shifts should update the README’s commit-hash note.
