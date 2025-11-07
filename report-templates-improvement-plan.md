# Report Templates Improvement Plan

This document breaks the follow-up work into four discrete steps, each with a concrete plan of attack. Completing the steps in order will improve maintainability, keep the codebase DRY (Do not Repeat Yourself), and remove hidden side effects from the report generator.

---

## Step 1 – Split `utils/report-templates.js` into focused modules

**Status:** ✅ Completed – site-quality renderers now live in `utils/report-templates/groups/site-quality.js`, leaving `utils/report-templates.js` as the orchestrator facade.

- **Goal:** Reduce the 8.7k-line “god module” into cohesive, suite-specific modules plus a thin orchestrator, echoing the component-based structure guidance from Node.js Best Practices.
- **Preparation:**
  - Inventory the major concern areas (general helpers, WCAG rendering, HTTP summaries, interactive, internal links, availability/responsive, performance, visual, Markdown/export, inline scripts, style compilation).
  - Decide on target module structure (e.g., `report-templates/summary-builder.js`, `report-templates/wcag.js`, etc.).
- **Execution:**
  1. Create a `utils/report-templates/` directory and migrate shared primitives (normalisers, formatters, constants) into smaller files, re-exported via an index.
  2. For each suite group, move its renderer into its own module, exporting a single `render<Group>Section(...)`.
  3. Keep `utils/report-templates.js` as a facade that composes the specialised modules.
- **Verification:** Run the existing report-generation flow (or targeted unit tests if available) after each migration to ensure no regressions.
- **Deliverable:** Modularised files with unchanged external API (`module.exports` from `utils/report-templates.js` stays the same).

---

## Step 2 – DRY the suite rendering pipeline

**Status:** ✅ Completed – `renderBucketedSuite` now powers every site-quality group, the WCAG per-page cards live in `utils/report-templates/groups/accessibility.js`, and the helper itself moved into `utils/report-templates/groups/helpers/bucketed-suite.js` with dedicated unit tests under `tests/unit/report-templates.bucketed-suite.test.js`.

- **Goal:** Remove the copy/pasted pipelines that collect issues, derive per-page cards, and call `renderSuiteFindingsBlock`.
- **Preparation:**
  - Document the shared workflow across Internal Links, Interactive, Availability/Responsive, HTTP, Performance, and Visual suites.
  - Catalogue per-suite differences (normalisers, labels, card renderers, WCAG column flags).
- **Execution:**
  1. Introduce a reusable helper (e.g., `buildSuiteSection({collectors, labels, cardRenderer})`) that accepts strategy callbacks for normalisation and card rendering. ✅
  2. Refactor each suite module to supply its strategy object instead of duplicating control-flow. ✅
  3. Add regression/unit tests for the helper to lock behaviour (e.g., verifying dedupe rules, empty-state handling). ✅
- **Verification:** Compare generated HTML snippets before and after refactors (snapshot tests or targeted fixtures).
- **Deliverable:** A single shared pipeline with suite-specific configuration objects, significantly shrinking each suite module.

---

## Step 3 – Remove runtime Sass compilation side effects

**Status:** ✅ Completed – Sass now compiles via `npm run styles:build` (powered by `scripts/build-report-styles.js`), `utils/report-templates.js` just reads `docs/mocks/report-styles.css`, and the README documents the workflow.

- **Goal:** Decouple template rendering from build tooling by eliminating `sass.compile` and `fs.writeFileSync` calls that run on every import.
- **Preparation:**
  - Identify who consumes `baseStyles` today (HTML exports? CLI reporter?). Confirm whether precompiled CSS can be embedded or referenced separately.
- **Execution:**
  1. Move Sass compilation into the existing build/test commands (e.g., npm script or documentation step) so CSS artifacts are generated ahead of runtime. ✅
  2. Replace `compileReportStyles()` with a simple loader: read a prebuilt CSS file or accept CSS as an injected dependency via function parameters. ✅
  3. Update documentation/README so contributors know how to refresh the CSS. ✅
- **Verification:** Run the report generator in an environment without write access to ensure it no longer attempts filesystem writes.
- **Deliverable:** Side-effect-free runtime module plus an updated build step that produces the styles.

---

## Step 4 – Preserve zero-value status entries

**Status:** ✅ Completed – `renderStatusSummaryList` now keeps zero counts, only skips null/undefined entries, and has a dedicated unit test covering the behaviour.

- **Goal:** Ensure `renderStatusSummaryList` surfaces zero counts so report readers can distinguish “0 blockers” from “data missing”.
- **Preparation:** Capture current HTML output for a run with zero blockers and non-zero warnings as a fixture.
- **Execution:**
  1. Update `renderStatusSummaryList` to keep entries with numeric `0`, only discarding `null/undefined`. ✅
  2. Add a targeted unit test (or snapshot) that verifies both zero and non-zero counts render. ✅
  3. Check other call sites to ensure no consumer relied on the old filtering behaviour. ✅
- **Verification:** Re-run the report summary generation to confirm the UI shows zero-valued pills with an appropriate tone/style.
- **Deliverable:** Helper adjustment + tests, with documentation of the expected UI change in the relevant changelog or README section.

---

Execute the steps sequentially so each change remains reviewable and reversible, updating `README.md` with the current commit hash once functional work begins per repository guidelines.
