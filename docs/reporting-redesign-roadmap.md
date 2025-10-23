# Reporting Redesign Roadmap

The mock HTML report is now approved and locked. All future work happens on the feature branch that carries the production reporter changes; keep this document updated alongside that branch.

## Phase 0 · Prep
- Take a fresh copy of `docs/mocks/full-run-report.html` and `docs/mocks/report-styles.scss` into the branch for quick comparison.
- Snapshot the current reporter output (`reports/run-*/report.html`) so we can diff structure and CSS after each phase.
- File tracking tickets for every spec panel so QA can sign off individually once they match the mock.

## Phase 1 · Schema + Data Audit
- Inventory every spec payload produced by the test runner (accessibility/a11y, responsive, functionality variants, visual).
- Ensure each payload exposes `gating`, `warnings`, `advisories`, `notes`, and artifact metadata (baseline/current/diff for visual).
- Document any gaps in `utils/test-helpers.js` or spec fixtures and patch them before template work starts.
- Add backstop unit coverage around `attachSchemaSummary` (and related helpers) for required fields and naming.
- Keep `docs/report-schema-inventory.md` current so engineering/QA can cross-check payload expectations while migrating the reporter.

## Phase 2 · Template Migration (in progress)
- ✅ Rebuilt the summary experience: the report now uses the sidebar + panel shell from the mock, complete with the summary hero, stat grid, and suite cards.
- ✅ WCAG panel migrated to the schema-driven layout with gating/advisory rule tables, pills, and per-page cards.
- ⏳ Port remaining panels (forms, keyboard, structure, functionality, responsive, visual) so each tab mirrors the approved wording, tables, and card stacks.
- ⏳ Surface visual regression deltas, previews, and notes inside the new visual panel once the panel migration lands.

## Phase 3 · Styling Integration
- ✅ Reporter now compiles `docs/mocks/report-styles.scss`; legacy inline styles (`SUMMARY_STYLES`) are gone, so every panel inherits the mock tokens without spec-specific CSS.
- Continue folding mock styling into `utils/report-templates.js` until all panels match the mock (Inter typography, pills, card shadows). Remaining work is tied to the outstanding suite panels above.
- Specs should emit structured data only—no inline HTML styling—so the shared renderer controls layout, spacing, and color.

## Phase 4 · Interaction & Accessibility Pass
- Re-check keyboard focus, tab order, and ARIA labelling for the new stacked layout and accordions.
- Ensure visual diff previews are accessible (alt text, focusable controls for toggling/magnifying).
- Confirm that “notes” cells read clearly with example production content, not placeholder authoring copy.

## Phase 5 · QA & Verification
- Run `node run-tests.js --site=<example>` for representative sites; capture `reports/run-*/data/run.json` for payload verification.
- Compare generated HTML against the mock using diff tooling and spot-check responsive breakpoints.
- Take full-page screenshots of each suite tab (desktop + mobile widths) and attach them to the implementation PR.
- Log any discrepancies in the tracking board; do not merge until the live report visually matches the mock.

Track progress in the reporting board and close this roadmap when production reports render identically to `docs/mocks/full-run-report.html`.
