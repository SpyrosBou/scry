# Repository Guidelines

## Project Structure & Module Organization
The `.github/` tree is reserved for CI/CD (Continuous Integration/Continuous Deployment) automation. Workflows in `.github/workflows/` lint the repo, run targeted Playwright suites, and publish artifacts. Keep per-workflow responsibilities narrow (e.g., `tests.yml` for suites, `reports.yml` for artifact handling) and document any new secrets or required environment variables in the workflow file header.

## Build, Test, and Development Commands
Use the same project-level commands locally that workflows execute remotely: `npm run lint`, `npm run test:unit`, and the relevant `node run-tests.js --site=<name> --functionality|--responsive|--visual|--accessibility` combinations. Favor matrix strategies over ad-hoc shell loops and add `--workers=<count>` when throttling cloud runners. When editing workflows, run `act -j <job>` or a minimal `codex exec --full-auto "npm run lint"` dry run before pushing so CI surprises stay low.

## Coding Style & Naming Conventions
Workflow files stay in YAML with two-space indentation and lowercase IDs (`name: run_tests`). Secrets use uppercase snake case (`SITE_AUTH_TOKEN`), and job names mirror their suite (`responsive_suite`). Prefer reusable workflow calls or composite actions for repeated logic instead of duplicating shell steps. Every workflow edit should mention the triggering branch filters and artifacts it writes to (`reports/run-*`, `test-results/`). Reference the root `AGENTS.md` for general repository rules, including Conventional Commits and README hash tracking, and keep CI docs aligned with those expectations.
