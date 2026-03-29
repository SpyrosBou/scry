# Report Schema Inventory

This document defines the reporting contract used by active specs and the custom report viewer.

## Canonical Metadata Meanings

- `siteName`: target fixture or site label from the manifest.
- `projectName`: Playwright project label for the executing browser or viewport profile.
- `browser`: browser/project label shown in issue tables when a browser-style label is needed.
- `viewport`: single viewport label for a page summary.
- `viewports`: list of viewport labels covered by a run summary.
- `summaryType`: stable suite summary identifier consumed by the reporter.
- `scope`: summary scope such as `project` when the payload aggregates multiple page entries.

## Payload Kinds

- Run summary:
  - `kind: run-summary`
  - Carries aggregate `overview`, optional `details`, optional `ruleSnapshots`, and `metadata`.
- Page summary:
  - `kind: page-summary`
  - Carries `page`, `viewport`, per-page `summary`, and `metadata`.

## Active Summary Types

- `wcag`: aggregate accessibility violations and per-page WCAG findings.
- `forms`: configured-form accessibility validation.
- `keyboard`: keyboard navigation and focus-order checks.
- `structure`: landmarks and heading structure.
- `reduced-motion`: reduced-motion preference handling.
- `reflow`: 320px overflow and reflow resilience.
- `iframe-metadata`: iframe title and metadata checks.
- `internal-links`: internal link integrity.
- `interactive`: console/network interaction smoke checks.
- `availability`: page availability and structural health.
- `http`: response and redirect validation.
- `performance`: sampled page load-budget checks.
- `responsive-structure`: per-viewport layout and landmark coverage.
- `responsive-consistency`: cross-viewport comparison for the same page.
- `wp-features`: homepage-level WordPress responsive feature checks.
- `visual`: screenshot diff summaries.

## Contract Rules

- Specs emit schema payloads only. They do not attach report-specific HTML or Markdown.
- Run and page payloads must set `metadata.summaryType`.
- Report payloads must not use `htmlBody`, `markdownBody`, `summary.cardHtml`, or `summary.cardMarkdown`.
- Renderers may derive presentation from payload content, but they must not rewrite field meanings.
- New summary types must be added to this inventory and to the reporter registry in the same change.
