# Repository Guidelines

## Project Structure & Module Organization
`scripts/` contains the Node utilities that power discovery, reporting, and local tooling (e.g., `discover-pages.js`, `read-reports.js`, `update-baselines.js`, `serve-report-dev.js`). Each script should stay self-contained, export a main function when reused programmatically, and clearly document required environment variables at the top of the file.

## Build, Test, and Development Commands
Run scripts directly with `node scripts/<name>.js` or wire them into npm tasks (`npm run discover -- --base-url=...`, `npm run reports:read`). Keep CLI flags consistent with the runner (for example, share `--site`, `--pages`, `--workers`). For watch-style tools (`serve-report-dev.js`, `static-server.js`), document default ports and guard against collisions with `process.env.PORT`. Before committing, run `npm run lint` plus any relevant dry run (`node scripts/cleanup.js --dry-run`) to confirm logging and exit codes behave as expected.

## Coding Style & Naming Conventions
Scripts follow CommonJS, 2-space indentation, and single quotes. Name files with verbs that describe their action (`regenerate-report.js`) and export helper functions in camelCase. Prefer the shared utilities in `utils/` rather than ad-hoc implementations; if a script needs logic that could benefit tests, upstream it to `utils/` and cover it in `tests/unit`. When logging, keep output single-line and prefix with the script name (`[discover-pages]`). Any script that mutates files must describe its scope in the README change log per root guidance, and major behavior shifts should update the README’s commit hash note.
