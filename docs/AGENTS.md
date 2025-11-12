# Repository Guidelines

## Project Structure & Module Organization
The `docs/` directory stores contributor-facing documentation and HTML reporter assets. `layout.md` and `reporting-redesign-roadmap.md` explain UX goals, while `mocks/` contains SCSS, SVGs, and sample HTML fragments that feed the generated reporter styles. Treat these files as the single source of truth for documentation referenced in the README and AGENTS layers.

## Build, Test, and Development Commands
Whenever you edit `docs/mocks/report-styles.scss` or related assets, run `npm run styles:build` from the repo root to regenerate the CSS the runtime reporter consumes. Use `npm run docs:lint` if added, or fall back to `npm run lint` to catch Markdown or frontmatter issues (the configuration already includes remark-lint rules). For visual checks, open the latest report via `npm run reports:read` and confirm the regenerated styles render as expected. Keep screenshots or GIFs out of version control; link to generated reports instead.

## Coding Style & Naming Conventions
Documentation sticks to Markdown with heading levels capped at `###`, sentence-case titles, and short paragraphs. Code samples should prefer fenced blocks with language hints (` ```bash `, ` ```json `) and mirror the commands used elsewhere (`node run-tests.js --site=<name>`). Asset filenames follow kebab-case and should describe their role (`summary-card.scss`, `a11y-preview.png`). When you update process docs, also refresh the README’s “Last updated” commit hash line from the root instructions so readers know which revision they’re seeing. Avoid duplicating guidance already in `README.md`; link to it or the relevant AGENTS layer instead.
