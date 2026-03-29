# Repository Guidelines

## Project Structure & Module Organization
Each file in `sites/` is a JSON manifest describing an environment the runner can target (e.g., `createarts-live.json`, `woodworking-ddev.json`). Required keys typically include `name`, `baseUrl`, `pages`/`testPages`, optional `discover` settings, and suite toggles. Keep one file per environment (`*-local`, `*-live`, `*-ddev`) and store secrets outside the repo—use environment variables for credentials.

## Build, Test, and Development Commands
List available sites with `node run-tests.js --list-sites`. To refresh manifests, run `npm run discover -- <site|https://base.url>`; the discover script updates `testPages` and scaffolds new files when needed. When validating large manifests, pair `node run-tests.js --site=<name> --dry-run` with `--pages <n>` to preview the resolved set without executing suites. CI uses these files verbatim, so commit only verified URLs. If you need to test local WordPress instances, set `ENABLE_DDEV=true` and provide `DDEV_PROJECT_PATH` before invoking the runner.

## Coding Style & Naming Conventions
Maintain kebab-case filenames and suffix them with the environment (`agilitas-live.json`). Sort top-level keys logically (`name`, `baseUrl`, `testPages`, `discover`) and keep arrays alphabetized for diff readability. URLs should be fully qualified (include `https://`) and trimmed—no trailing slashes unless the endpoint requires one. Document any nonstandard fields in the README’s site section or inline comments (JSON supports `//` via tooling? no—use descriptive field names instead). After changing manifests, run the appropriate suite locally to confirm the pages load, then adjust the README’s “Last updated” commit hash to reflect the change.
