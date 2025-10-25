# Reporting Redesign Roadmap

The mock HTML report remains our source of truth. This roadmap captures what is already live in `reporting-redesign`, what still blocks parity with the mock, and the sign-off steps before we merge to `main`.

## What’s already done
- New shell (sidebar navigation, summary hero, suite cards) is in production templates.
- WCAG, keyboard, structure, forms, iframe, reduced-motion, reflow, internal links, infrastructure, and interactive panels now render with schema-driven layouts that mirror the mock copy and component structure.
- Reporter compiles `docs/mocks/report-styles.scss` at build time; all styling lives in Solarized theme tokens with light/dark support.
- Navigation scripts (`reports:read`, `reports:regenerate`) allow us to reopen past runs during development.
- Schema validator enforces required finding arrays (`gating`, `warnings`, `advisories`, `notes`) and is covered by unit tests.

## Outstanding work

### 1. Panel parity
- Rebuild the Visual Regression panel to match the mock (hero summary, blocking/advisory tables, image preview deck, artifact links).
- Rework responsive panels (responsive structure + WordPress features) so copy, status pills, and per-page accordions match the approved mock instead of the interim tables.
- Audit functionality panels (interactive, availability, HTTP, performance) for any remaining mock deltas and tighten wording accordingly.

### 2. Styling & theming
- Finalise Solarized token values once all panels are migrated; ensure status colours, badges, and card shadows read correctly in both themes.
- Keep `docs/mocks/report-styles.scss` as the single source of design tokens—no inline style escapes in templates.
- Clean out legacy selector aliases once responsive/visual parity lands (several `.summary-*` fallbacks remain for the old markup).

### 3. Schema & data documentation
- Produce `docs/report-schema-inventory.md` outlining every suite payload (run + page summaries, required fields, optional metadata, artifact keys).
- Confirm visual payloads always expose artifact URLs and delta metrics; update fixtures/helpers where the data is missing.

### 4. Interaction & accessibility
- Validate accordion behaviour and keyboard focus across every panel, including the new theme toggle.
- Add alt text and focusable controls for visual diff previews and any new responsive imagery.
- Check ARIA labels/roles on navigation, toggle buttons, and status pills so screen readers surface the same severity cues.

### 5. QA sign-off
- Run representative sites (`--functionality`, `--responsive`, `--accessibility`, `--visual`) and archive `run.json` payloads alongside regenerated reports.
- Diff each panel against `docs/mocks/full-run-report.html` (desktop and narrow breakpoints) and take annotated screenshots for the QA board.
- Record discrepancies or known gaps before the merge PR; nothing ships until the live report is visually indistinguishable from the mock.

## Ongoing hygiene
- Snapshot a current report each time we land significant template/styling changes so regressions are obvious (`npm run reports:regenerate`).
- Keep this roadmap and the schema inventory in sync with the feature branch; update statuses as panels cross the finish line.
