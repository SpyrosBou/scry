# Reporting Redesign Roadmap

The mock HTML report remains our source of truth. This roadmap captures what is already live in `reporting-redesign`, what still blocks parity with the mock, and the sign-off steps before we merge to `main`.

## What’s already done
- New shell (sidebar navigation, summary hero, suite cards) is in production templates.
- WCAG, keyboard, structure, forms, iframe, reduced-motion, reflow, internal links, infrastructure, and interactive panels now render with schema-driven layouts that mirror the mock copy and component structure.
- Reporter compiles `styles/report/report-styles.scss` at build time; all styling lives in Solarized theme tokens with light/dark support.
- Navigation scripts (`reports:read`, `reports:regenerate`) allow us to reopen past runs during development.
- Schema validator enforces required finding arrays (`gating`, `warnings`, `advisories`, `notes`) and is covered by unit tests.

### Spec migration status (2025-10-28)
| Spec | Template entry point | Status | Notes |
| --- | --- | --- | --- |
| `tests/a11y.audit.wcag.spec.js` | `renderAccessibilityGroupHtml` | Complete | Baseline for shared gating/advisory/per-page layout; tables produced via `renderAccessibilityRuleTable`, per-page accordion via `renderWcagPerPageSection`. |
| `tests/a11y.keyboard.navigation.spec.js` | `renderKeyboardGroupHtml` | Complete | Unified gating + execution failure tables via `renderUnifiedIssuesTable`; `renderKeyboardPageCard` maps focus metrics and advisories with `renderKeyboardPageIssuesTable`. |
| `tests/a11y.structure.landmarks.spec.js` | `renderStructureGroupHtml` | Complete | Combines `gatingIssues`, `headingSkips`, `warnings`, and `advisories` into shared tables, normalising copy with helper lambdas before dedupe; per-page accordion uses `renderStructurePageCard`. |
| `tests/functionality.links.internal.spec.js` | `renderInternalLinksGroupHtml` | Complete | Uses `collectIssueMessages` with default normalisation to collapse duplicate link failures; per-page cards (`renderInternalLinksPageCard`) surface meta counts and sample lists. |
| `tests/functionality.interactive.smoke.spec.js` | `renderInteractiveGroupHtml` | Complete | Console/API stability now relies on `normalizeInteractiveMessage` (trims ANSI, condenses retries, simplifies URLs) before passing data to `renderUnifiedIssuesTable` and `renderInteractivePageCard`. |
| `tests/functionality.infrastructure.health.spec.js` | `renderAvailabilityGroupHtml` | Complete | Gating/advisory tables use normalised availability messaging and page cards expose status tiles plus insight notes. |
| `renderHttpGroupHtml` (HTTP response validation) | — | Complete | Failed checks feed the gating table and page cards expose status/redirect metadata with deduped findings; no standalone run summary block. |
| `renderPerformanceGroupHtml` (performance budgets) | — | Complete | Budget breaches aggregate by metric and page cards combine timing tiles with normalised advisory tables. |
| Responsive suites (`renderResponsive*` helpers) | — | Complete | Responsive structure and WordPress features panels now use shared status summaries, responsive normaliser, and WCAG-style per-viewport accordions. |
| Visual regression (`renderVisualGroupHtml`) | — | Complete | Hero includes diff status pills/threshold notes; gating/advisory tables reference diff artifacts and page cards expose attachment badges with normalised messages. |

### Implementation playbook for future migrations
1. **Locate the renderer** in `utils/report-templates.js` for the target schema group (search for `render<Spec>GroupHtml`). Identify the existing data sources: `runPayload.overview`, `runPayload.details.pages`, and any custom fields.
2. **Layout helpers:** Reuse `assembleSuiteSections`, `renderProjectBlockSection`, and `renderSchemaGroupContainer` from `utils/report-components/layout.js` so the gating/advisory tables and per-page accordion slot into the same wrappers across specs.
3. **Gating/advisory tables:** Use `collectIssueMessages` with a spec-specific normaliser so messages dedupe across pages. Pipe the arrays into `renderUnifiedIssuesTable` with `variant: 'gating'` or `'advisory'`. Keep table headings aligned with WCAG (Impact, Issue, Viewport(s), Pages, Nodes, WCAG level) and include the Help column when rule guidance is available.
4. **Per-page accordion:** Transform the page array to include `_summaryClass` based on gating/warning/advisory presence, then feed it to `renderPerPageAccordion`. Extend or create `render<Spec>PageCard` to surface meta counts and call `renderWcagPageIssueTable` (or spec equivalents) for sub-sections.
5. **Message normalisation:** If raw findings contain noisy stack traces or long URLs, create a helper similar to `normalizeInteractiveMessage`. Strip ANSI escape codes, collapse whitespace, coerce `#123` IDs to `#n`, and shorten URLs via `simplifyUrlForDisplay`.
6. **Verification:** Regenerate the latest affected report (`npm run reports:regenerate -- run-<id>`) and confirm in DevTools that the DOM matches the WCAG panel’s ordering, classes, and accordion behaviour.
7. **Documentation:** After landing code, update this roadmap table and `plan.md` with status + concrete instructions so the next contributor follows the same pattern.

## Outstanding work

### 1. Panel parity
- Rebuild the Visual Regression panel to match the mock (hero summary, blocking/advisory tables, image preview deck, artifact links).
- Audit the newly migrated functionality/visual/responsive panels against the approved mock to confirm copy, status pills, and accordion structure match design expectations.
- Verify the shared layout utilities (`report-template-helpers.js`, `report-components/layout.js`) support any edge cases uncovered during QA and raise follow-up issues if additional hooks are required.

### 2. Styling & theming
- Finalise Solarized token values once all panels are migrated; ensure status colours, badges, and card shadows read correctly in both themes.
- Keep `styles/report/report-styles.scss` as the single source of design tokens—no inline style escapes in templates.
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
