# Report Layout Guide

This document maps the report UI into consistent sections so engineers and designers can reference shared names, data needs, and behaviours.

---

## Spec Sidepanel

### Run info list
- Lives at the top of the sidepanel.
- Displays run metadata (site title, run ID, duration, total pages tested, etc.).
- Always visible to provide quick context regardless of which pane is selected.

### Suite category
- Groups specs by their suite family (Accessibility, Functionality, Responsive, Visual, etc.).
- Each category header expands to reveal the specs belonging to that suite.
- Order should match the high-level grouping used in the summary “Suites at a glance”.

### Overview pane
- The first, always-available entry in the sidepanel.
- Labeled “Summary” and selected by default when the report loads.
- Clicking it swaps the content window into the summary view described below.

### Spec pane
- Individual clickable item for each spec/test.
- Colour-coded status indicator (pass / warning / fail) reflects the overall outcome for that spec.
- Selecting one updates the content window with the spec-specific view described in the next section.

---

## Content Window

The content window renders different layouts depending on whether the Overview pane or a specific spec pane is selected.

### When on Summary (Overview) pane

#### Test overview section
- Introductory copy, high-level stats, and any hero cards explaining the run at a glance.
- Appears above “Suites at a glance”.
- Should include the same metadata surfaced in the run info list plus any relevant badges (e.g., browser count, viewport count).

#### Suites at a glance
- Grid/list of suite summaries with quick metrics (pages impacted, gating counts, etc.).
- Mirrors the structure of the suite categories in the sidepanel for easy navigation.
- Each item links to the associated suite/spec pane when applicable.

### When on a spec pane

#### Spec overview
- Optional top-of-pane narrative and quick metrics tailored to the selected spec.
- Use it to set context before diving into the findings. When omitted, the report jumps straight into the tables described below.

#### Unique Gating violations section
- Section heading plus the unique gating table.
- Table columns (in order): Impact, Rule, Details, Browser, Viewport, Pages (conditional), Nodes (conditional), WCAG level (conditional for accessibility specs).
- Rows aggregate each unique gating issue across all tested pages.

#### Unique Advisories section
- Mirrors the gating section but surfaces advisory/best-practice findings.
- Uses the same column rules, with pages/nodes conditional and WCAG badges when available.

#### Per-page findings section
- Contains the accordion of per-page breakdowns.
- Each accordion entry displays page-level metadata and a table of findings specific to that page.

##### Page accordion
- Expandable detail block for a single page within the per-page section.
- Summary line includes page label and status indicator (pass/warn/fail/advisory).
- Expanded content renders the per-page table with columns: Impact, Rule, Details, Browser, Viewport, WCAG level (if applicable), Culprit.
  - **Culprit behaviour:** display the most specific selector available; if a screenshot exists, present it via an interactive hover/click link.

---

## Table Column Reference

All tables follow these conventions unless a section above specifies otherwise:

### Baseline columns (always present)
1. **Impact** — Severity grade (`critical`, `serious`, `moderate`, `minor`, `info`) with status styling.
2. **Rule** — Human-readable rule name or identifier.
3. **Details** — Summary text describing the finding. May include a “Guidance” link when docs are available.
4. **Browser** — Line-separated list of browser projects that reproduced the issue.
5. **Viewport** — Line-separated list of viewport profiles (desktop/tablet/mobile/etc.).

### Conditional columns
- **Pages** — Only for aggregate “Unique” tables. Shows distinct page labels affected.
- **Nodes** — Only for aggregate “Unique” tables. Totals DOM nodes/instances.
- **WCAG level** — For accessibility specs when tags/badges are present or derivable.
- **Culprit** — Only for per-page tables. Highlights the specific offending element and links to screenshots when available.

These definitions keep the report UI consistent and provide a single reference point for future updates. Please extend sections here if new UI elements or interactions are added.***
