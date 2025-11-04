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

## Remaining conversions
- **Service endpoint health (`renderAvailabilityGroupHtml`)**  
  *Goal:* Replace bespoke availability table with four-section layout.  
  *Steps:*  
  1. Build run summary using uptime metrics (`overview` fields).  
  2. Group failures via `collectIssueMessages` (create a normaliser that canonicalises status text).  
  3. Author `renderAvailabilityPageCard` to surface status + failed checks inside the accordion.
- **HTTP response validation (`renderHttpGroupHtml`)**  
  *Goal:* Align status tables with WCAG layout.  
  *Steps:*  
  1. Promote status counts into `summary-report ... --run-summary`.  
  2. Funnel failed checks into gating/advisory tables (`collectIssueMessages` across `failedChecks`).  
  3. Craft per-page cards that list status, redirect, and failed checks via `renderWcagPageIssueTable`.
- **Performance monitoring (`renderPerformanceGroupHtml`)**  
  *Goal:* Treat budget breaches as gating/advisories while keeping timing metrics visible.  
  *Steps:*  
  1. Run summary: highlight pages over budget, average load times, and threshold copy.  
  2. Aggregate breaches by label (normalise measurement keys) before calling `renderUnifiedIssuesTable`.  
  3. Create `renderPerformancePageCard` with timing metrics + gating/advisory tables per page.
- **Responsive layout suites (`renderResponsiveStructureGroupHtml`, `renderResponsiveFeaturesGroupHtml`)**  
  *Goal:* Move away from interim tables.  
  *Steps:*  
  1. Determine gating vs advisory issue arrays in payloads; normalise text before aggregation.  
  2. Build per-page cards mirroring WCAG structure with responsive-specific metadata (breakpoints, component notes).
- **Visual regression (`renderVisualGroupHtml`)**  
  *Goal:* Implement hero summary + gating/advisory tables + per-page diff deck per the mock.  
  *Steps:*  
  1. Run summary should call out gating diffs, advisory diffs, and artifact locations.  
  2. Tables should point to diff image artifacts (use `<a>` with badge styling).  
  3. Per-page card needs accordion with thumbnails and download links.

## Checklist for future contributors
1. **Update templates:** Modify the relevant `render<Spec>GroupHtml` function to emit the four sections in order: run summary, gating table, advisory table, per-page accordion.
2. **Normalise findings:** Create or reuse a `normalize<Spec>Message` helper that trims noise, standardises IDs (`#n`), and shortens URLs with `simplifyUrlForDisplay`. Pass it to `collectIssueMessages`.
3. **Reuse shared helpers:** Pull formatting and layout utilities from `utils/report-template-helpers.js` and `utils/report-components/layout.js` instead of inlining summary cards, project wrappers, or count helpers.
4. **Tag accordion items:** When building the per-page array, set `_summaryClass` to one of `summary-page--fail|--warn|--advisory|--ok` so the shared CSS (Cascading Style Sheets) applies the correct background.
5. **Regenerate reports:** Use `npm run reports:regenerate -- run-<id>` for the latest affected run(s) and verify the DOM matches the WCAG panel (classes, headings, badge legend).
6. **Document the change:** After code lands, mark the spec as “Complete” in the table above and summarise the migration details in `docs/reporting-redesign-roadmap.md`.
