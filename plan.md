# Reporter Layout Migration Plan (2025-10-28)

This plan tracks the four-section report layout rollout and documents the exact steps required to extend the pattern to remaining specs. Use it alongside `docs/reporting-redesign-roadmap.md`.

## Completed conversions
- **WCAG audit (`tests/a11y.audit.wcag.spec.js`)**  
  *Template:* `renderAccessibilityGroupHtml` in `utils/report-templates.js`.  
  *Notes:* Serves as the canonical implementation — run summary + three rule tables + `renderWcagPerPageSection`. Reference this markup when validating other panels.
- **Keyboard navigation (`tests/a11y.keyboard.navigation.spec.js`)**  
  *Template:* `renderKeyboardGroupHtml`.  
  *Implementation highlights:*  
  1. Run summary aggregates focus coverage and skip-link metrics before calling `renderUnifiedIssuesTable`.  
  2. Per-page accordion delegates to `renderKeyboardPageCard`, which in turn calls `renderKeyboardPageIssuesTable` for gating/execution/advisory lists.
- **Structural semantics (`tests/a11y.structure.landmarks.spec.js`)**  
  *Template:* `renderStructureGroupHtml`.  
  *Implementation highlights:*  
  1. Created normalisers for `gatingIssues`, `headingSkips`, and `warnings` prior to `collectIssueMessages` so duplicate copy collapses.  
  2. Per-page cards map `gating`, `warnings`, and `advisories` into WCAG-style tables, with `_summaryClass` controlling accordion pill colours.
- **Internal link integrity (`tests/functionality.links.internal.spec.js`)**  
  *Template:* `renderInternalLinksGroupHtml`.  
  *Implementation highlights:*  
  1. Run summary pulls `totalLinksFound`, `uniqueLinksChecked`, and `brokenCount` details into `<p class="details">` rows.  
  2. Dedupe broken-link messages via `collectIssueMessages` and route samples through `renderInternalLinksPageCard`.
- **Console & API stability (`tests/functionality.interactive.smoke.spec.js`)**  
  *Template:* `renderInteractiveGroupHtml`.  
  *Implementation highlights:*  
  1. Introduced `normalizeInteractiveMessage` (strips ANSI codes, trims Playwright call logs, simplifies URLs) so gating/advisory tables show one row per unique failure.  
  2. Extended `renderInteractivePageCard` to reuse `renderWcagPageIssueTable` for console/resource errors and to summarise counts in the page meta block.
- **Service endpoint health (`tests/functionality.infrastructure.health.spec.js`)**  
  *Template:* `renderAvailabilityGroupHtml`.  
  *Implementation highlights:*  
  1. Added uptime-focused status summaries and availability normaliser so HTTP errors, missing landmarks, and notes dedupe cleanly across pages.  
  2. Reworked `renderAvailabilityPageCard` to surface a canonical “Status:” line, insight tiles, and grouped issue sections mirroring the four-column layout.
- **HTTP response validation (`renderHttpGroupHtml`)**  
  *Template:* `renderHttpGroupHtml`.  
  *Implementation highlights:*  
  1. Promoted success/error/redirect counts into the run summary and normalised failed checks into the gating table.  
  2. `renderHttpPageCard` now shows status/redirect metadata, failed-check detail lists, and deduped issue tables powered by `normalizeHttpMessage`.
- **Performance monitoring (`renderPerformanceGroupHtml`)**  
  *Template:* `renderPerformanceGroupHtml`.  
  *Implementation highlights:*  
  1. Added status pills for pages over budget alongside summary metrics and breach detail notes.  
  2. Normalised budget breaches so run-level tables group by metric, with page cards combining timing tiles and aggregated advisory lists.
- **Responsive layout suites (`renderResponsiveStructureGroupHtml`, `renderResponsiveWpGroupHtml`)**  
  *Implementation highlights:*  
  1. Introduced responsive normaliser to collapse duplicate breakpoint copy and converted per-page cards to shared accordion sections with viewport metadata.  
  2. Status summaries and badge-styled artifact links align the responsive panels with the WCAG layout conventions.
- **Visual regression (`renderVisualGroupHtml`)**  
  *Implementation highlights:*  
  1. Run summary now calls out diff counts with status pills plus threshold detail notes, while gating/advisory tables include normalised diff samples.  
  2. Per-page cards expose artifact badges, diff samples, and deduped issues via `normalizeVisualMessage`.

## Remaining conversions
None — backlog clear after accessibility + functionality panel parity work (2025-10-28).

## Checklist for future contributors
1. **Update templates:** Modify the relevant `render<Spec>GroupHtml` function to emit the four sections in order: run summary, gating table, advisory table, per-page accordion.
2. **Normalise findings:** Create or reuse a `normalize<Spec>Message` helper that trims noise, standardises IDs (`#n`), and shortens URLs with `simplifyUrlForDisplay`. Pass it to `collectIssueMessages`.
3. **Reuse shared helpers:** Pull formatting and layout utilities from `utils/report-template-helpers.js` and `utils/report-components/layout.js` instead of inlining summary cards, project wrappers, or count helpers.
4. **Tag accordion items:** When building the per-page array, set `_summaryClass` to one of `summary-page--fail|--warn|--advisory|--ok` so the shared CSS (Cascading Style Sheets) applies the correct background.
5. **Regenerate reports:** Use `npm run reports:regenerate -- run-<id>` for the latest affected run(s) and verify the DOM matches the WCAG panel (classes, headings, badge legend).
6. **Document the change:** After code lands, mark the spec as “Complete” in the table above and summarise the migration details in `docs/reporting-redesign-roadmap.md`.
