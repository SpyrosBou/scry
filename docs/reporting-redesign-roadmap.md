# Reporting Redesign Roadmap

The mock HTML report remains our source of truth. This roadmap captures what is already live in `reporting-redesign`, what still blocks parity with the mock, and the sign-off steps before we merge to `main`.

## What’s already done
- New shell (sidebar navigation, summary hero, suite cards) is in production templates.
- WCAG, keyboard, structure, forms, iframe, reduced-motion, reflow, internal links, infrastructure, and interactive panels now render with schema-driven layouts that mirror the mock copy and component structure.
- Reporter compiles `docs/mocks/report-styles.scss` at build time; all styling lives in Solarized theme tokens with light/dark support.
- Navigation scripts (`reports:read`, `reports:regenerate`) allow us to reopen past runs during development.
- Schema validator enforces required finding arrays (`gating`, `warnings`, `advisories`, `notes`) and is covered by unit tests.

### Spec migration status (2025-10-28)
| Spec | Template entry point | Status | Notes |
| --- | --- | --- | --- |
| `tests/a11y.audit.wcag.spec.js` | `renderAccessibilityGroupHtml` | Complete | Baseline for four-section layout; tables produced via `renderAccessibilityRuleTable`, per-page accordion via `renderWcagPerPageSection`. |
| `tests/a11y.keyboard.navigation.spec.js` | `renderKeyboardGroupHtml` | Complete | Run summary pulls metrics from `overview`, issues funneled through `renderUnifiedIssuesTable`; `renderKeyboardPageCard` maps `gating`, execution failures (warnings), and advisories with `renderKeyboardPageIssuesTable`. |
| `tests/a11y.structure.landmarks.spec.js` | `renderStructureGroupHtml` | Complete | Combines `gatingIssues`, `headingSkips`, `warnings`, and `advisories` into shared tables, normalising copy with helper lambdas before dedupe; per-page accordion uses `renderStructurePageCard`. |
| `tests/functionality.links.internal.spec.js` | `renderInternalLinksGroupHtml` | Complete | Uses `collectIssueMessages` with default normalisation to collapse duplicate link failures; per-page cards (`renderInternalLinksPageCard`) surface meta counts and sample lists. |
| `tests/functionality.interactive.smoke.spec.js` | `renderInteractiveGroupHtml` | Complete | Console/API stability now relies on `normalizeInteractiveMessage` (trims ANSI, condenses retries, simplifies URLs) before passing data to `renderUnifiedIssuesTable` and `renderInteractivePageCard`. |
| `tests/functionality.infrastructure.health.spec.js` | `renderAvailabilityGroupHtml` | In progress | Per-page cards now use insight tiles and grouped findings; run summary still needs shared four-section layout. |
| `renderHttpGroupHtml` (HTTP response validation) | — | Pending | Convert to run summary + deduped gating/advisory tables; create per-page card. |
| `renderPerformanceGroupHtml` (performance budgets) | — | In progress | Per-page cards now surface insight tiles plus grouped findings; run summary/per-page accordion still needs shared layout. |
| Responsive suites (`renderResponsive*` helpers) | — | Pending | Reflow/reduced-motion done; layout/WordPress feature panels still need four-section conversion. |
| Visual regression (`renderVisualGroupHtml`) | — | Pending | Must match mock hero, gating/advisory tables, and per-page diff deck. |

### Implementation playbook for future migrations
1. **Locate the renderer** in `utils/report-templates.js` for the target schema group (search for `render<Spec>GroupHtml`). Identify the existing data sources: `runPayload.overview`, `runPayload.details.pages`, and any custom fields.
2. **Run summary:** Compose a `summary-report summary-a11y summary-a11y--run-summary` section. Always include the standard intro sentence (`Audited <strong>n</strong> page(s)...`) and feed status pills through `renderStatusSummaryList`. Add per-metric paragraphs with `<p class="details">`.
3. **Gating/advisory tables:** Use `collectIssueMessages` with a spec-specific normaliser so messages dedupe across pages. Pipe the arrays into `renderUnifiedIssuesTable` with `variant: 'gating'` or `'advisory'`. Keep table headings aligned with WCAG (Impact, Issue, Viewport(s), Pages, Nodes, WCAG level) and include the Help column when rule guidance is available.
4. **Per-page accordion:** Transform the page array to include `_summaryClass` based on gating/warning/advisory presence, then feed it to `renderPerPageAccordion`. Extend or create `render<Spec>PageCard` to surface meta counts and call `renderWcagPageIssueTable` (or spec equivalents) for sub-sections.
5. **Message normalisation:** If raw findings contain noisy stack traces or long URLs, create a helper similar to `normalizeInteractiveMessage`. Strip ANSI escape codes, collapse whitespace, coerce `#123` IDs to `#n`, and shorten URLs via `simplifyUrlForDisplay`.
6. **Verification:** Regenerate the latest affected report (`npm run reports:regenerate -- run-<id>`) and confirm in DevTools that the DOM matches the WCAG panel’s ordering, classes, and accordion behaviour.
7. **Documentation:** After landing code, update this roadmap table and `plan.md` with status + concrete instructions so the next contributor follows the same pattern.

## Outstanding work

### 1. Panel parity
- Rebuild the Visual Regression panel to match the mock (hero summary, blocking/advisory tables, image preview deck, artifact links).
- Rework responsive panels (responsive structure + WordPress features) so copy, status pills, and per-page accordions match the approved mock instead of the interim tables.
- Finish migrating infrastructure/HTTP/performance functionality panels to the shared four-section layout and align copy with the mock.

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
