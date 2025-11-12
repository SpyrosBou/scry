# Report Templates Overhaul

## Problem Statement
- `utils/report-templates.js` is ~7k lines and mixes unrelated responsibilities: shared HTML primitives, WCAG-specific layouts, availability/responsive/visual cards, markdown renderers, and utility logic (e.g., slugification and default labels).
- The size and entanglement make changes risky: Every tweak to a section requires scrolling through thousands of lines and increases the chance of conflicting changes when multiple people touch the file.
- Unit coverage is thin, so splitting responsibilities without a plan could regress the custom HTML reporter.

## Goals
1. **Modularize sections.** Extract self-contained sections (WCAG, availability/uptime, responsive/site quality, visual/performance, HTTP) into files under `utils/report-templates/sections/`. Each module exports explicit `render…` functions.
2. **Shared rendering primitives.** Add a helper layer (e.g., `utils/report-templates/helpers/`) for repeated patterns: rule snapshot tables, status tiles, summary cards, metrics lists. Sections import these primitives instead of duplicating HTML.
3. **Clear entry point.** Keep `utils/report-templates.js` as a thin orchestrator that pulls the `render…` functions together, wires them into the reporter, and exposes a stable API for `custom-html-reporter.js`.
4. **Improved testability.** Once sections are isolated, add focused unit tests for each module (e.g., verifying WCAG run summaries or availability cards render the correct chips). This also makes future design tweaks easier.

## Implementation Outline
1. **Scaffold structure**
   - `utils/report-templates/sections/availability.js`
   - `utils/report-templates/sections/wcag.js`
   - `utils/report-templates/sections/responsive.js`
   - `utils/report-templates/helpers/render-primitives.js` (status chips, code lists, metrics, etc.)
2. **Move shared helpers**
   - Anything currently duplicated in the main file (e.g., `renderCodeList`, `ensureDisplayValue`, summary card HTML) moves into `helpers/`.
3. **Extract sections iteratively**
   - Start with WCAG (largest block) → update imports/exports.
   - Follow with availability + responsive, then visual/performance, etc.
4. **Update documentation**
   - Record the module layout in `docs/spec-to-report-pipeline.md` so contributors know where to add new sections.
5. **Add/adjust tests**
   - Introduce or update unit tests to cover each extracted module.

By following these steps, we reduce the cognitive load of `utils/report-templates.js`, enforce separation of concerns, and make the custom reporter resilient to future design iterations.
