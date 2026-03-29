# Scry In-App UI Design Spec

## Context

Scry is a WordPress website testing SaaS. The landing/marketing page is complete with a dark atmospheric design system (deep navy, gold/cyan accents, "mystical insight" brand identity). This spec defines the in-app experience — what users see after they log in.

**Primary persona**: Agency or freelancer managing multiple client websites.
**Core workflow**: Add sites grouped by client/project, run audits on-demand or on a schedule, review structured reports, export for clients.

---

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | SvelteKit | Lightweight, fast SSR, stores for real-time state, less boilerplate than React |
| Backend/DB | Supabase (Postgres) | Auth, row-level security, Realtime subscriptions for live run progress, relational model fits projects > sites > runs > findings |
| Hosting | Railway | Single platform for app + database + Playwright background workers (needs real browsers) |
| Test Runner | Node.js + Playwright | Existing engine, runs as Railway background worker triggered by the app |
| Styling | SCSS (existing tokens) | Reuse landing page design tokens and component styles |

---

## Design System (Inherited from Landing Page)

All tokens, typography, and color decisions from `site/DESIGN.md` and `site/TECHNICAL.md` carry into the app. Key references:

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#0a0e1a` | Page background, app shell |
| `--bg-primary` | `#0f1629` | Section backgrounds, sidebar |
| `--bg-elevated` | `#151d35` | Cards, inputs, panels |
| `--bg-surface` | `#1a2340` | Secondary panels |
| `--text-primary` | `#e8e6e1` | Body text (~15:1 contrast) |
| `--text-secondary` | `#9ca3b4` | Muted text (~7.5:1) |
| `--text-tertiary` | `#8891a0` | Captions (WCAG AA) |
| `--gold` | `#d4a574` | Primary CTAs, emphasis |
| `--cyan` | `#4ecdc4` | Links, secondary actions |
| `--status-blue` | `#268bd2` | Functionality suite |
| `--status-yellow` | `#b58900` | Responsive suite |
| `--status-green` | `#859900` | Accessibility suite |
| `--status-red` | `#dc322f` | Visual Regression suite |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Default borders |
| `--border-gold` | `rgba(212,165,116,0.25)` | Active/selected states |

**Typography**: Instrument Serif (display/headlines), Plus Jakarta Sans (body/UI), JetBrains Mono (code/culprit elements).

**Numeric displays**: All score numbers, page counts, metrics, progress percentages must use `font-variant-numeric: tabular-nums`.

**Global HTML requirements**:
- `color-scheme: dark` on `<html>`
- `<meta name="theme-color" content="#0a0e1a">`
- Loading/progress text uses ellipsis character: "Running…", "Saving…", "Loading…"
- `text-wrap: balance` on headings

---

## Information Architecture

```
App Shell (persistent sidebar + top bar)
|-- Dashboard (default view -- the Command Center)
|   |-- Sidebar: Projects -> Sites (tree nav with health dots)
|   |-- Main: Selected site overview (scores, trend, recent runs)
|   +-- Quick action: "Run Audit" button
|-- Reports
|   |-- Run detail view (Report Overview + Suite Detail)
|   +-- Run history timeline
|-- Run Audit Wizard (slide-in panel overlay, 2 steps)
|   |-- Step 1: Pick site (or add new)
|   +-- Step 2: Choose suites + pages -> run
|-- Site Settings (per-site config page)
|   |-- General (URL, project, pages)
|   |-- Scheduled Audits (frequency, time, suites, pages)
|   |-- Visual Baselines
|   +-- Danger Zone (remove site)
|-- Account Settings
|   +-- Profile, billing, preferences
+-- Onboarding (first-time only, full-screen)
    +-- Create Project -> Add Site -> First Run
```

**URL routing** (all stateful views are deep-linkable):
- `/dashboard` (redirects to last-viewed site)
- `/dashboard/:projectSlug/:siteSlug`
- `/reports/:runId`
- `/reports/:runId/:suiteSlug`
- `/reports/:runId/:suiteSlug#:findingId`
- `/sites/:siteSlug/settings`
- `/onboarding`

---

## Screen 1: Dashboard (Command Center)

The primary view. Persistent sidebar left, site detail panel right.

### Layout

```
+------------------------------------------------------------+
| [Scry logo]             Dashboard   Reports   gear  avatar |
+-----------+------------------------------------------------+
|           |                                                |
| ACME CORP |  acme.com                   [Run Audit >]      |
| * acme.com|  Last run: 2h ago * Scheduled: Daily 6am      |
| o blog.ac |                                                |
|           |  [Func: 98] [A11y: 74] [Resp: 91] [Vis: 100]  |
| BELLA DSN |                                                |
| * bella.co|  Score Trend (30d)                             |
| x shop.be |  [~~~~~~~~~~~~ sparkline chart ~~~~~~~~~~~~]   |
|           |                                                |
| ---------+|  Recent Runs                                   |
| + New     |  Mar 29 6:00 AM --- Pass --- 4 suites          |
| Project   |  Mar 28 6:00 AM --- Warn --- 4 suites          |
|           |  Mar 27 6:00 AM --- Pass --- 4 suites          |
+-----------+------------------------------------------------+
```

### Sidebar (~220px, fixed)

- **ARIA pattern**: `role="tree"` with `role="treeitem"` for each site, `role="group"` for sites under a project. Arrow keys navigate (Up/Down between items, Right expands project, Left collapses). `aria-expanded` on project nodes. `aria-selected="true"` on active site.
- **Project names**: `--text-tertiary`, uppercase, small (Instrument Serif).
- **Site rows**: Health dot (green/yellow/red, derived from worst suite score of last run) + site name. Active site: `--gold-bg` background, `--border-gold` left edge.
- **"+ New Project"**: Gold text link at sidebar bottom.
- **Overflow**: Long site names truncate with `text-overflow: ellipsis`. Sidebar scrolls independently with `overscroll-behavior: contain`.
- **Collapse**: Sidebar can collapse to icon-only width on smaller viewports.

### Top Bar (fixed)

- **Left**: Scry wordmark (Instrument Serif italic, `--gold`).
- **Center**: Primary nav — "Dashboard" and "Reports" as text links. Active item has `--gold-bg` pill.
- **Right**: Settings gear icon (`aria-label="Settings"`), user avatar (`aria-label="Account menu"`).
- **Background**: `--bg-primary` with `backdrop-filter: blur(12px)` on scroll.

### Main Panel

- **Site header**: Site name (Instrument Serif, `--text-primary`), meta line ("Last run: 2h ago" + schedule badge) in `--text-secondary`. "Run Audit" gold primary button top-right.
- **Score cards**: 4-up grid, one per suite. `--bg-elevated` card with solarized color top border (2px). Large score number (`tabular-nums`, `--text-primary`). Suite name below in `--text-secondary`. Clickable — navigates to that suite's most recent report detail (`<a>` element). If suite wasn't run, shows "--" in `--text-tertiary`.
- **Trend chart**: `--bg-elevated` card. 30-day sparkline per suite (overlaid, color-coded using solarized status colors). SVG paths. Hover tooltip shows date + scores.
- **Recent runs**: Compact list of `--bg-elevated` cards. Each row: timestamp, status dot (green=pass, yellow=warn, red=fail), suite count, page count. Click navigates to Report Overview. Subtle hover lift (`transform: translateY(-2px)`).
- **Schedule badge**: Inline under site name. "Scheduled: Daily 6am" in `--text-secondary`. If none: "No schedule" + "Set up" link to site settings.

### Empty States

- **No projects**: Single centered card on `--bg-deep` — "No projects yet. Add your first site to get started." + "Add Site" gold button.
- **No runs for site**: Main panel shows "No audits run yet." + "Run Your First Audit" gold button + illustration or subtle Scry brand mark.
- **No schedule**: Schedule badge shows "No schedule · Set up" with link.

---

## Screen 2: Run Wizard -- Step 1: Pick Site

Slide-in panel from the right (~500px), dimming the command center behind.

### ARIA & Focus

- **Pattern**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to "Run Audit" heading.
- **Focus**: On open, focus moves to the search input. Focus is trapped within the panel. Escape key or click-outside dismisses. On close, focus returns to the "Run Audit" button that triggered it.
- **Panel**: `overscroll-behavior: contain`. Entry animation: slide from right (`transform: translateX`) + fade, compositor-friendly.

### Content

- **Header**: "Run Audit" (Instrument Serif), "Step 1 of 2" in `--text-tertiary`.
- **Search input**: `type="search"`, `placeholder="Search sites..."`, `aria-label="Search sites"`. Sticky at top. Filters site list in real-time.
- **Site list**: Grouped by project. Project labels in `--text-tertiary` uppercase. Each site is a selectable row: health dot + name + "Last: 2h ago" meta. Selected = `--gold-bg` + `--border-gold` left edge.
- **"+ Add new site"**: Dashed border row at bottom. Opens inline form: URL input (`type="url"`, `placeholder="https://..."`) + project dropdown. Triggers automatic sitemap discovery on submit.
- **"Choose Suites" button**: Gold primary, bottom-right. Disabled until a site is selected. Label is specific (not "Next").
- **Shortcut**: If triggered from dashboard with a site already selected, this step is pre-filled and user lands on Step 2.

---

## Screen 3: Run Wizard -- Step 2: Choose Suites & Go

Same slide-in panel, content swaps.

### Content

- **Header**: Site name + "Step 2 of 2".
- **Prompt**: "What do you want to test?" (Instrument Serif).
- **Suite toggle cards**: 4 cards in a 2x2 grid. Each has the solarized color as a left border accent. Selected = `--gold-bg` + `--border-gold` + checkmark icon. Unselected = `--bg-elevated` + `--border-subtle`. Suite name + sub-description listing the sub-tests (e.g., "WCAG, keyboard, forms, landmarks"). `aria-pressed` for toggle state.
- **"Select All" / "Deselect All"**: Subtle text link above the suite grid.
- **Pages selector**: Compact dropdown: "All (12)", "Homepage Only", "Top 5", "Custom..." (opens page picker from discovered pages). Badge shows selected count.
- **"Run Audit" button**: Gold primary, bottom-right. Dismisses panel and transitions to Live Run view.
- **"Back" link**: Ghost style, bottom-left. Returns to Step 1.

---

## Screen 4: Live Run

Replaces main panel content. Sidebar stays visible with the running site highlighted.

### Layout

```
+-----------+------------------------------------------------+
| Sidebar   |  Running audit on acme.com...                  |
| (same,    |  Started 45s ago                               |
|  site     |                                                |
|  pulsing) |  [===============----------- 58%]              |
|           |                                                |
|           |  v Accessibility     12/12 pages   32s         |
|           |      WCAG audit            done                |
|           |      Keyboard nav          done                |
|           |      Forms validation      done                |
|           |      Landmarks             done                |
|           |  o Functionality      7/12 pages   18s         |
|           |      Internal links        done                |
|           |      Interactive smoke     running...           |
|           |      Infrastructure        queued               |
|           |  o Responsive              queued               |
|           |  o Visual Regression       queued               |
|           |                                                |
|           |  [Show Log]                 [Cancel Run]        |
+-----------+------------------------------------------------+
```

### Design Details

- **Progress bar**: `role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-label="Audit progress"`. Gold fill on `--bg-elevated` track. Percentage from (completed page-suite pairs / total).
- **Suite breakdown**: Expandable list. Status icons: checkmark (done, `--status-green`), pulsing dot (running, `--gold` with CSS animation), hollow circle (queued, `--text-tertiary`). Page progress "7/12" and elapsed time per suite. `aria-live="polite"` region wrapping the suite list so screen readers announce completions.
- **Sidebar indicator**: Running site's health dot pulses gold during the run.
- **"Show Log" toggle**: Reveals a monospace scrolling log (`--bg-deep`, `JetBrains Mono`, styled like landing page code blocks). Collapsed by default.
- **"Cancel Run"**: Red ghost button. Confirmation dialog before stopping ("Cancel the running audit on acme.com?" with "Cancel Audit" / "Keep Running" buttons).
- **Completion**: Progress bar fills to 100% green, 1s pause, auto-navigates to Report Overview with a crossfade transition. `aria-live` announces "Audit complete."
- **Animation**: Progress bar and status transitions use `transform`/`opacity` only. Respects `prefers-reduced-motion` (pulse animation disabled, instant state changes).

---

## Screen 5: Report Overview

Top-level summary of a completed run. Replaces main panel.

### Layout

```
+-----------+------------------------------------------------+
| Sidebar   |  acme.com * Mar 29, 2026 6:00 AM               |
| (same)    |  12 pages * 4 suites * 2m 14s  [Export Report] |
|           |                                                |
|           |  [Func: 98] [A11y: 74] [Resp: 91] [Vis: 100]  |
|           |   Pass       Warn       Pass       Pass        |
|           |                                                |
|           |  Findings                                      |
|           |  -- Blockers (3) ------------------------------ |
|           |  * Missing alt text (4 pages)         [A11y]   |
|           |  * Color contrast ratio (2 pages)     [A11y]   |
|           |  * Broken link /old-page (1 page)     [Func]   |
|           |  -- Warnings (7) ------------------------------ |
|           |  o Heading hierarchy gaps (3 pages)             |
|           |  o Missing form labels (2 pages)                |
|           |  o Layout shift on tablet (1 page)              |
|           |  o + 4 more...                                  |
|           |  -- Passed (12) ------------------------------- |
|           |  (collapsed)                                   |
|           |                                                |
|           |  [< All Runs]            [View Full Report >]  |
+-----------+------------------------------------------------+
```

### Design Details

- **Run header**: Site name (Instrument Serif) + timestamp. Meta line: page count, suite count, duration. All numeric values use `tabular-nums`.
- **Export button**: Cyan ghost style. Label: "Export Report" (specific per Guideline #77). Downloads PDF or HTML snapshot.
- **Score cards**: Same 4-up grid as dashboard, now also showing text status (Pass/Warn/Fail) below score. Clickable — navigates to suite detail view.
- **Findings list**: Three collapsible sections with `aria-expanded`:
  - **Blockers** (`--status-red` left border): Expanded by default. Issues that must be fixed.
  - **Warnings** (`--status-yellow` left border): Expanded by default. Issues worth reviewing.
  - **Passed** (`--status-green` left border): Collapsed by default. Expandable.
- **Finding rows**: Rule name + affected page count badge + suite tag pill (color-coded). Click navigates to Report Detail filtered to that finding.
- **Navigation**: "All Runs" (`<a>`) goes to run history. "View Full Report" (`<a>`) goes to the first suite's detail view.
- **Empty findings**: If zero blockers/warnings: celebratory state — "No issues found. Your site is looking good." with a subtle gold accent.

---

## Screen 6: Report Detail (Suite Drill-Down)

Full detail for one suite on one run. Accessed by clicking a score card or a finding row.

### Design Details

- **Back link**: "Back to Report Overview" (`<a>`, top of main panel).
- **Suite header**: Suite name (Instrument Serif) + site name + date + score.
- **Finding accordions**: Each finding is a disclosure widget (`aria-expanded` button controlling a panel). Expand to see:
  - **Rule reference**: WCAG criterion + level badge (A/AA/AAA pill).
  - **Impact**: Critical/Serious/Moderate/Minor, color-coded.
  - **Per-page breakdown**: Grouped by page path. Each page shows affected element count + culprit HTML in `JetBrains Mono` code blocks (`--bg-deep` background).
  - **Screenshot**: `--bg-elevated` container with colored overlay highlighting offending elements. `loading="lazy"`. Click for full-size lightbox.
- **Severity sections**: Blockers / Warnings / Passed as collapsible headers with count badges. Blockers expanded by default, Passed collapsed.
- **Deep-linking**: URL updates on expand: `/reports/:runId/:suiteSlug#:findingId`.
- **Export**: "Export Suite Report" cyan ghost button, downloads just this suite's findings.
- **Long content**: Finding descriptions use `line-clamp-3` with "Show more" expansion. Culprit HTML blocks scroll horizontally if needed. Flex children use `min-w-0`.

---

## Screen 7: Site Settings + Schedules

Per-site configuration page. Accessed from sidebar gear icon or site detail "Settings" link.

### Sections (each a `--bg-elevated` card)

**General**
- Site URL (read-only display + edit affordance)
- Project assignment (dropdown to change)
- Pages: count + "Rediscover Pages" button (triggers sitemap re-crawl, inline "Discovering..." spinner with `aria-live="polite"`)

**Scheduled Audits**
- Status toggle: Active / Paused
- Frequency dropdown: Daily / Weekly / Monthly / Off
- Time picker
- Suite checkboxes (same visual style as wizard toggle cards)
- Pages selector (same dropdown as wizard)
- "Next run" computed timestamp in `--text-tertiary`

**Visual Baselines**
- Last updated date, snapshot count
- "Refresh Baselines" button. Confirmation dialog before executing ("This replaces your current baselines. Continue?" per Guideline #54).

**Danger Zone** (`--status-red` left border)
- "Remove Site" red ghost button. Requires confirmation dialog with site name typed to confirm.

### Form Behavior

- All inputs have proper `<label>` elements and `autocomplete` attributes.
- URL field: `type="url"`. Time: time picker control.
- "Save Changes" gold primary button, bottom of page. Disabled until changes detected. Shows "Saving..." spinner during save. `beforeunload` warning on unsaved changes (Guideline #25).

---

## Screen 8: Onboarding (First-Time Flow)

Full-screen takeover for new users. No sidebar, no top nav.

### Layout

- **Background**: `--bg-deep` with the same gradient mesh + floating orbs from the landing page hero. Connects marketing -> product.
- **Content**: Centered card (`--bg-primary`, generous padding, max-width ~500px).
- **Progress**: Three-step horizontal indicator matching the landing page "How It Works" style (circled numbers + connecting lines).

### Steps

**Step 1: Create Project**
- "What's your first project called?" + text input (`placeholder="e.g., Acme Corp..."`)
- "Continue" gold button.

**Step 2: Add Site**
- URL input (`type="url"`, `placeholder="https://..."`, `autocomplete="url"`).
- On submit: inline discovery progress ("Discovering pages..." with count updating, `aria-live="polite"`).
- Fallback: "No sitemap found. We'll test the homepage. You can add more pages later."

**Step 3: First Run**
- Suite toggle cards (all four pre-selected for maximum first impression).
- "Run Your First Audit" gold CTA.
- Transitions to Live Run view (Screen 4).

### Edge Cases

- **"Skip for now"**: Subtle ghost link on each step. Takes user to empty-state dashboard.
- **Post-completion**: After first audit finishes, land on Report Overview with a brief gold shimmer on score cards (subtle, matches "quiet authority" brand). Disabled under `prefers-reduced-motion`.

---

## Cross-Cutting Concerns

### Accessibility (Validated against ARIA APG + Web Interface Guidelines)

| Component | ARIA Pattern | Key Requirements |
|-----------|-------------|-----------------|
| Sidebar | Tree | `role="tree/treeitem/group"`, arrow key nav, `aria-expanded`, `aria-selected` |
| Run Wizard | Dialog | `role="dialog"`, `aria-modal="true"`, focus trap, Escape to dismiss, return focus on close |
| Progress bar | Progressbar | `role="progressbar"`, `aria-valuenow/min/max`, `aria-label` |
| Suite status | Live region | `aria-live="polite"` wrapping status updates |
| Finding sections | Disclosure | `aria-expanded` on headers, `aria-controls` on panels |
| Score cards | Link | `<a>` elements (navigational), not `<div onClick>` |
| Icon-only buttons | Labeled | `aria-label` on gear icon, avatar, health dots if interactive |
| All buttons | Semantic | `<button>` for actions, `<a>` for navigation |
| Focus indicators | Visible | Gold outline (`focus-visible`), 3px offset, inherited from landing page |
| Skip link | Navigation | First focusable element, targets main content area |

### Animation & Motion

- All animations use `transform`/`opacity` only (compositor-friendly).
- Never use `transition: all` -- list properties explicitly.
- `prefers-reduced-motion`: disable pulse animations, floating orbs, slide transitions. Instant state changes instead.
- Wizard panel: slide + fade entry/exit, interruptible (responds to Escape mid-animation).

### Content & Typography

- Button labels are specific: "Run Audit", "Export Report", "Choose Suites", "Add Site", "Save Changes", "Cancel Audit".
- Ellipsis character for loading states, not three dots.
- `text-wrap: balance` on display headings.
- `tabular-nums` on all numeric displays.
- Long content: truncation with `text-overflow: ellipsis` in sidebar, `line-clamp` on finding descriptions, `min-w-0` on flex children.

### Empty States

| View | Empty State |
|------|-------------|
| Dashboard (no projects) | Centered card: "No projects yet. Add your first site to get started." + "Add Site" button |
| Site detail (no runs) | "No audits run yet." + "Run Your First Audit" button |
| Report findings (no issues) | "No issues found. Your site is looking good." with subtle gold accent |
| Schedule (not configured) | "No schedule" badge + "Set up" link |
| Run history (no runs) | "Run your first audit to see results here." |

### Performance Considerations

- Run history lists: virtualize if > 50 items.
- Report finding lists: virtualize if > 100 findings in a suite.
- Screenshots in report detail: `loading="lazy"`.
- Sidebar: independent scroll container.
- Trend chart: lightweight SVG, not a heavy charting library.

---

## Screen Summary

| # | Screen | Type | Entry Point |
|---|--------|------|-------------|
| 1 | Dashboard | Main view | Default after login |
| 2 | Run Wizard: Pick Site | Slide-in panel (Step 1) | "Run Audit" button |
| 3 | Run Wizard: Choose Suites | Slide-in panel (Step 2) | Step 1 completion |
| 4 | Live Run | Main panel replacement | Wizard completion |
| 5 | Report Overview | Main panel replacement | Run completion or run history click |
| 6 | Report Detail | Main panel replacement | Score card or finding click |
| 7 | Site Settings + Schedules | Main panel replacement | Sidebar gear icon or settings link |
| 8 | Onboarding | Full-screen takeover | First login only |
