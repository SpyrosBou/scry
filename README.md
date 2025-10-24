# WordPress Testing Suite

Automated testing suite for WordPress websites with responsive design, functionality testing, and visual regression detection.

## What This Project Does (Beginner Friendly)

Think of this suite as an automated QA teammate for WordPress sites. You give it a small JSON config in `sites/` that lists the URLs you care about, and it drives real browsers (via Playwright) to make sure those pages still look and behave correctly.

On every run (`node run-tests.js --site=your-site`):

- The suite loads the config, opens each page, and checks the layout on mobile, tablet, and desktop sizes.
- It makes sure critical pieces like headers, menus, and footers are visible, and it compares screenshots to catch visual regressions.
- It looks for broken links, slow or failing responses, JavaScript errors, and accessibility issues using axe-core plus targeted keyboard/resilience/form/structure audits that call out the relevant WCAG success criteria.
- It writes a self-contained HTML report to `reports/run-<timestamp>/report.html` (plus JSON snapshots) with a run headline, cross-browser summary tables, per-page accordions, and a collapsible "Debug testing" deck for raw Playwright output. Open the latest run anytime with `npm run reports:read` (append a number like `npm run reports:read 3` to open multiple recent runs).

To try it locally: run `npm run setup` (this installs dependencies and caches Playwright browsers under `.pw-browsers/`), copy `sites/example-site.json` to your own file, update the URLs, then execute `node run-tests.js --site=<your-site>`. The HTML report will show you exactly what passed and what needs attention before users notice.

## Quick Start

0. **Prereqs**
   - Node.js 18+ and npm

1. **Setup**

   ```bash
   cd website-testing
   npm run setup
   ```

   This installs project dependencies and downloads the Playwright browser bundle into `.pw-browsers/`. Delete that directory and rerun `npm run setup` any time you need a fresh install.

2. **Configure your site**
   - Copy `sites/example-site.json` to `sites/your-site-name.json`
   - Update the configuration with your WordPress site details

3. **Run tests**

   ```bash
   node run-tests.js --site=your-site-name
   ```

4. **Run smoke test (functionality only, Chrome, homepage)**

   ```bash
   node run-tests.js --site=nfsmediation-local --functionality --pages=1 --project=Chrome
   # If your WordPress dev site runs via ddev, use:
   ddev exec node run-tests.js --site=nfsmediation-local --functionality --pages=1 --project=Chrome
   ```

5. **Open the latest report**
   ```bash
   npm run reports:read
   ```
   This launches the most recent `reports/run-*/report.html` in your default browser. Use `npm run reports:read 3` to open the latest three runs.

### Focused runs & advanced options

- **Single spec globs**: `node run-tests.js --site=my-site tests/a11y.audit.wcag.spec.js`
- **Multiple sites**: repeat `--site` (e.g. `node run-tests.js --site=daygroup-local --site=daygroup-live`)
- **Project overrides**: `node run-tests.js --site=my-site --browsers Chrome,Firefox`
- **Worker overrides**: `node run-tests.js --site=my-site --workers 4` (defaults to `auto`)
- **Site lookup**: `node run-tests.js --list-sites`

### Report layout

Every report folder contains `report.html` and a `data/` directory with the machine-readable JSON that powered it (for example: `reports/run-20251003-170959/data/run.json`). Opening the HTML shows three stacked sections:

- **Headline + metadata** – summary cards (total/passed/failed/flaky) followed by run metadata (site, browsers, start/end times) so you can confirm scope at a glance.
- **Promoted summaries** – spec-provided overviews such as the accessibility run summary. These cards now aggregate findings "per browser across N viewport(s)" so Chrome desktop vs mobile distinctions are visible without duplicate blocks. Per-page detail lives behind an accordion for faster scanning.
- **Debug testing accordion** – collapsed by default. Expanding reveals the navigation sidebar, status filters, and every individual Playwright project/test for deep dives into attachments, console output, and stack traces.

Because the debug deck stays hidden unless you opt in, the top of the report remains stakeholder-friendly while power users still have one-click access to raw data when needed.

Recent report polish: summary cards use succinct, comma-separated meta labels (including clarifying the `PAGES SCANNED` card as `per test`). Suite overview cards now stack one per row so each block has room for headlines and status context before you dive into the spec-specific tabs.

## Quick Setup (macOS)

Use this streamlined flow on a Mac to verify everything works end-to-end:

```bash
# 1) Install dependencies and Playwright browsers
npm run setup

# 2) Run a quick smoke (functionality only, Chrome, homepage)
node run-tests.js --site=nfsmediation-live --functionality --pages=1 --project=Chrome

# 3) Open the report
npm run reports:read
```

## Site Configuration

Create a JSON file in the `sites/` directory for each WordPress site you want to test:

```json
{
  "name": "My WordPress Site",
  "baseUrl": "https://mywordpresssite.com",
  "testPages": ["/", "/about", "/contact"],
  "visualThresholds": { "ui_elements": 0.1, "content": 0.25, "dynamic": 0.5 },
  "dynamicMasks": [".breaking-news", ".ticker"],
  "visualOverrides": [
    { "match": "/", "threshold": 0.35, "masks": [".dynamic-widget"] },
    { "pattern": "^/blog", "threshold": 0.4 }
  ],
  "forms": [
    {
      "name": "Contact Form",
      "page": "/contact",
      "selector": "#contact-form",
      "fields": {
        "name": "input[name='your-name']",
        "email": "input[name='your-email']",
        "message": "textarea[name='your-message']"
      },
      "submitButton": "input[type='submit']"
    }
  ],
  "criticalElements": [
    { "name": "Navigation", "selector": ".main-navigation" },
    { "name": "Header", "selector": "header" },
    { "name": "Footer", "selector": "footer" }
  ],
  "linkCheck": {
    "maxPerPage": 20,
    "timeoutMs": 5000,
    "followRedirects": true,
    "methodFallback": true
  },
  "a11yFailOn": ["critical", "serious"],
  "a11yIgnoreRules": ["color-contrast"],
  "a11yMode": "gate",
  "ignoreConsoleErrors": ["vendor-script", "MarketingPixel"],
  "resourceErrorBudget": 0,
  "performanceBudgets": {
    "domContentLoaded": 2500,
    "loadComplete": 4000,
    "firstContentfulPaint": 2000
  }
}
```

`linkCheck` lets you tune how aggressively the internal link audit runs. Defaults are `maxPerPage: 20`, `timeoutMs: 5000`, `followRedirects: true`, and `methodFallback: true` (retry with GET when servers reject HEAD). `performanceBudgets` soft-fail the run when `domContentLoaded`, `loadComplete`, or `firstContentfulPaint` timings exceed the provided millisecond thresholds. If omitted, the suite uses the conservative defaults baked into the specs (`linkCheck`) and skips the performance gating entirely.

`testPages` should list the exact paths you expect to remain available. Always include `'/'` so the homepage is scanned—the runner will warn and inject it if omitted, but keeping it explicit avoids churn in repo diffs. The functionality and accessibility suites will fail as soon as they encounter a 4xx/5xx response, so keep this array in sync with the live site (or enable sitemap discovery as described below).

## Optional Page Discovery

Add a `discover` block to your site config and run with `--discover` when you want to refresh `testPages` from a sitemap. Without the flag the runner keeps your existing list (and prints a reminder), so discovery is always an explicit action.

```json
{
  "name": "My WordPress Site",
  "baseUrl": "https://mywordpresssite.com",
  "testPages": ["/", "/about", "/contact"],
  "discover": {
    "strategy": "sitemap",
    "sitemapUrl": "https://mywordpresssite.com/sitemap_index.xml",
    "maxPages": 25,
    "include": ["^/services"],
    "exclude": ["^/tag/"]
  }
}
```

Run discovery like this:

```bash
node run-tests.js --site=my-site --discover
```

When `strategy` is `sitemap`, the runner fetches the sitemap (default `baseUrl/sitemap.xml`), walks child sitemaps up to two levels, normalises URLs to paths, filters them with the optional `include`/`exclude` patterns, and writes the merged list back to your site JSON (sorted, unique) so subsequent runs stay in sync.

## Experimental YAML Specs

An experimental generator lives under `specs/`. These YAML definitions map to the same functionality/responsive categories and can be converted into `.spec.js` files with the scripts in `specs/utils/`, but they are not wired into `run-tests.js`. Treat them as prototypes—hand-authored Playwright specs in `tests/` remain canonical.

## Commands

```bash
# List available sites
node run-tests.js --list-sites

# Test a specific site (defaults to Chrome + auto workers)
node run-tests.js --site=my-site
# or with short flags
node run-tests.js -s my-site

# Target specific spec files (accepts multiple patterns and sites)
node run-tests.js --site=my-site tests/a11y.audit.wcag.spec.js
node run-tests.js -s daygroup-local -s daygroup-live -t responsive.layout.structure.spec.js

# Limit the number of pages (applies before suite selection)
node run-tests.js --site=my-site --pages=5
node run-tests.js -s my-site -p 5

# Using npm script (pass args after --)
npm run test:site -- --site=my-site

# Smoke test example (nfs mediation)
node run-tests.js --site=nfsmediation-local --functionality --pages=1 --project=Chrome
# ddev variant
ddev exec node run-tests.js --site=nfsmediation-local --functionality --pages=1 --project=Chrome

# Refresh sitemap-backed page list before running tests
node run-tests.js --site=my-site --discover

# Pin worker count or expand browser coverage
node run-tests.js --site=my-site --workers 4 --browsers Chrome,Firefox
node run-tests.js -s my-site -w 4 -b Chrome,Firefox

# Update visual baselines for a site (visual regression only)
npm run baselines:update -- my-site

# Refresh test pages from sitemap (no tests run)
npm run discover -- my-site

## Smoke Site Config
- A minimal CI-friendly config is provided at `sites/nfsmediation-smoke.json` (points to `https://nfs.atelierdev.uk`, homepage only).
- For CI, set the repository Actions variable `SMOKE_SITE=nfsmediation-live` or `nfsmediation-smoke`.

# Run only visual regression tests (defaults to Chrome desktop)
node run-tests.js --site=my-site --visual

# Expand coverage (examples)
node run-tests.js --site=my-site --visual --project=all
node run-tests.js --site=my-site --visual --project=Chrome,Firefox

# Run only responsive structure tests
node run-tests.js --site=my-site --responsive

# Run only functionality tests
node run-tests.js --site=my-site --functionality

# Test specific browser (defaults to Chrome when omitted)
node run-tests.js --site=my-site --project="Chrome"
node run-tests.js --site=my-site --project="Firefox"
node run-tests.js --site=my-site --project="Safari"  # WebKit engine
node run-tests.js --site=my-site --project=all         # Run every configured Playwright project

# Start local ddev automatically (if applicable)
# Use --local to enable ddev preflight and infer DDEV_PROJECT_PATH under /home/warui/sites
node run-tests.js --site=my-site-local --visual --local
```

## What Gets Tested

### Responsive Testing (Industry-Standard Approach)

- 🔧 **Default footprint**: Chrome desktop only for fast feedback
- 🔁 **Opt-in breadth**: Use `--project=all` or comma-separated lists, and `--viewport=all` to add browsers/devices
- ✅ **Multi-Viewport Testing** (when enabled): mobile (375×667), tablet (768×1024), and desktop (1920×1080)
- ✅ **Cross-Browser Coverage** (when enabled): Chrome, Firefox, and Safari/WebKit
- ✅ Critical elements are visible across devices
- ✅ Mobile menu functionality
- ✅ **Visual Regression Detection** - Automatic screenshot comparison
- ✅ **Layout Change Alerts** - Pixel-level difference detection

### Browser Strategy

- **Desktop Browsers Only**: Uses Chrome, Firefox, Safari to simulate all viewport sizes
- **Why This Works**: Matches real-world responsive development and testing workflows
- **Real Mobile Testing**: For actual device testing, use cloud services (not covered by this suite)

### Functionality Testing

- ✅ No broken internal links (per-page sampling honours `linkCheck` config, retries with GET when HEAD is unsupported, and the report includes a checked/broken URL table)
- ✅ JavaScript & resource error smoke: light focus/hover on buttons/links/inputs with console logging, failed-request tracking, per-site ignore/budget controls, and per-page summaries embedded in the report
- ✅ Form validation and submission (for forms listed in site config)
- ✅ Page load times (per-page DOM timing with optional `performanceBudgets` soft gates; the report highlights any budget breaches)
- ✅ HTTP status codes & content-type assertions

The interactive audit still walks every entry in `testPages`, but it only performs lightweight focus/hover taps while watching for console errors and failed network requests. That keeps the shared harness stable across very different client sites. When you need multi-step user journeys, flows behind logins, or bespoke form handling, layer client-specific Playwright specs on top of the shared suite.

All other shared suites (infrastructure, links, accessibility, responsive structure/visual) execute their full assertions across every `testPages` URL without these limitations. Each migrated spec now emits structured summaries via `attachSchemaSummary`, and the reporter renders the same HTML/Markdown layout without relying on bespoke attachments (legacy suites still fall back to `attachSummary`).

### Accessibility Deep-Dive

- ✅ **Responsive Axe scans** honour impact-based gating and now surface three buckets: gating, WCAG advisories, and best-practice advisories.
- ✅ **Keyboard-only navigation audit** exercises the first ten focus stops per page, verifies focus never lands on hidden elements, and records skip-link coverage (mapped to WCAG 2.1.1, 2.1.2, 2.4.1, 2.4.3, 2.4.7).
- ✅ **Reduced-motion coverage** forces `prefers-reduced-motion: reduce` and flags long-running or infinite animations that remain active (WCAG 2.2.2, 2.3.3).
- ✅ **Reflow/zoom resilience** renders pages at a 320 px viewport and reports horizontal overflow sources that break responsive layouts (WCAG 1.4.4, 1.4.10).
- ✅ **Iframe inventory** captures accessible metadata for embeddings, flagging unlabeled or cross-origin frames that require manual follow-up (WCAG 1.3.1, 4.1.2).
- Focus-indicator detection now compares before/after screenshots (via `pixelmatch`) so the suite only warns when the visual state truly fails to change.
- ✅ **Forms accessibility audit** validates configured forms for accessible labels and meaningful validation feedback on error (WCAG 1.3.1, 3.3.1, 3.3.2, 3.3.3, 4.1.2).
- ✅ **Structural landmark checks** confirm each page exposes a single H1, a `main` landmark, and a sensible heading outline (WCAG 1.3.1, 2.4.1, 2.4.6, 2.4.10).

Each Allure summary now includes a “WCAG coverage” banner for these manual audits so reviewers can see at a glance which success criteria the findings relate to.

## Test Results

- **Custom HTML Report**: Every run writes `reports/run-<timestamp>/report.html`, a self-contained artifact with inline screenshots, logs, and per-test narratives. Matching JSON lives under `reports/run-<timestamp>/data/` for dashboards or scripting.
- **Run History**: pass a number (e.g. `npm run reports:read 5`) to open multiple recent runs in one go.
- **Test Artifacts**: Screenshots, videos, and traces remain in `test-results/` (cleared by global setup unless `PW_SKIP_RESULT_CLEAN=true`).
- **Console Output**: After each run, the CLI points to the matching report folder and reminds you about `npm run reports:read`.

### Viewing Reports

- `npm run reports:read` — open the most recent report in your default browser.
- `npm run reports:read <n>` — open the newest `<n>` reports.
- When adding a new suite, prefer emitting schema payloads via `attachSchemaSummary` (use `attachSummary` only as a transitional fallback) so the reporter can render the same inline HTML/Markdown blocks automatically.
- The current mock and implementation plan for the refreshed report layout live in `docs/mocks/` and `docs/reporting-redesign-roadmap.md`.
- Treat WCAG findings surfaced by the suites as defects to address. We do **not** suppress or whitelist contrast (or any other WCAG-level) violations in the harness; our automated results must stay faithful to a real audit even when product/design decides to accept the risk.

#### Schema payload contract

- Run + page schema payloads that opt into the refreshed reporter must provide `summary.gating`, `summary.warnings`, `summary.advisories`, and `summary.notes` as arrays (empty arrays are fine) so the renderer can drop findings into the shared tables/cards without guessing at per-suite keys. Visual payloads should also surface `deltaPercent` and artifact filenames to drive the inline diff previews.
- Legacy payloads (e.g., older WCAG audit attachments) still validate, but new work should follow the contract above. `docs/report-schema-inventory.md` lists the current suites and the fields they emit; keep that file in sync as new specs adopt the schema.
- The schema validator now enforces this contract: `attachSchemaSummary` will throw if a payload omits the standard arrays, making it easier to catch regressions while authoring specs.

## CI & Scheduling

- CI smoke tests no longer run automatically on PRs, pushes, or on a schedule.
- Trigger the workflow manually from GitHub Actions (Run workflow) and optionally set `site` input.
- You can also set repository Actions variable `SMOKE_SITE` (e.g., `nfsmediation-live`) to be used when running manually.
- You can also trigger manually via the "Run workflow" button and provide a site input.

### Deterministic Smoke (optional)

- A static fixture and local server exist for fully deterministic smoke runs:
  - Server: `node scripts/static-server.js` (serves `fixtures/static-site/` on `http://127.0.0.1:8080`).
  - Config: `sites/static-smoke.json`.
  - CI will auto-start this server when `SMOKE_SITE=static-smoke` or manual input `site=static-smoke`.

## Local ddev Preflight (Optional)

- If your site uses ddev and is unreachable, the runner can attempt to start it when:
  - Use `--local` to automatically set `ENABLE_DDEV=true` and infer `DDEV_PROJECT_PATH` from `/home/warui/sites/<project>` when possible.
  - Or set `ENABLE_DDEV=true` and `DDEV_PROJECT_PATH=/path/to/your/wp/project` in the environment manually.
  - The site `baseUrl` contains `.ddev.site`.
- The runner will try `ddev start` and wait up to 2 minutes for the site to respond.

### Managing Reports

```bash
# Wipe all Playwright artifacts (screenshots/traces/videos)
npm run clean-test-results

# Prune HTML reports to the 10 newest runs
npm run clean-reports
```

**Note**: HTML reports live under `reports/run-*/report.html`. Playwright artifacts (videos/screenshots/traces) remain in `test-results/`.

Run `npm run clean-manifests` to delete run manifest files older than 15 days (pass a custom day count as a second argument if needed).

### Run Manifest & Environment Contracts

- Every run serialises a manifest describing the resolved site, pages, specs, and projects. Small manifests are injected via `SITE_RUN_MANIFEST_INLINE`; large ones are persisted under `reports/run-manifests/` and referenced through `SITE_RUN_MANIFEST`.
- `SITE_TEST_PAGES` (and optional `SITE_TEST_PAGES_LIMIT`) remain for legacy consumers but always mirror the manifest’s page list.
- Specs and helpers can read the manifest through `utils/run-manifest.js` rather than parsing env vars manually. `SiteLoader` already respects the manifest, so loading a site config inside a spec yields the runner-filtered pages.
- Adapters (CLI today, GUI tomorrow) can listen to runner events (`manifest:ready`, `manifest:persisted`, `run:complete`) to render previews or progress without scraping stdout.
- Add `--output=path/to/run.json` when invoking the CLI to write the manifest + run summary to disk for external tooling or dashboards.

### Working with the custom reporter

- Every spec that emits HTML via `attachSchemaSummary` **must** set `metadata.suppressPageEntries: true` on the run-level payload when it also supplies `htmlBody` (or embedded cards). This tells the reporter not to render the fallback per-page accordion a second time.
- Page-level payloads should focus on structured data (`summary`) and optional `cardHtml`/`cardMarkdown`; the run summary controls the promoted layout.
- When a suite relies on the automatically generated tables (no custom HTML), omit `htmlBody` entirely so the shared renderer produces the standard accordion view.
- Aggregate summaries (e.g. `a11y-summary`) are the only place we embed full “per-page breakdown” cards; per-project summaries should normally rely on the fallback tables unless they also provide their own `htmlBody` **and** request `suppressPageEntries`.
- Generating reports manually:

  ```bash
  SITE_NAME=createarts-live npx playwright test tests/a11y.audit.wcag.spec.js --project=Chrome
  npm run reports:read 3   # opens the three most recent reports (Chrome windows by default)
  npm run reports:read     # open the single latest report
  ```

- The metadata header displays the domain if `SITE_BASE_URL` or `BASE_URL` is exported. Running via `node run-tests.js` is recommended because it sets that env automatically (fallback loads it from `sites/<SITE_NAME>.json`).

## Browser Coverage

Tests run on:

- Desktop Chrome & Firefox
- Safari (WebKit engine)
- Mobile and tablet viewports via device profiles

## Troubleshooting

**"Site configuration not found"**: Ensure your `.json` file exists in `sites/` directory

**Tests hang**: Check your WordPress site is accessible and URLs are correct

**Form tests fail**: Update form selectors in your site configuration to match your WordPress theme

**JavaScript errors**: Review console output for specific error details

**Visual regression failures**: Run `npx playwright test --update-snapshots` to update baselines after intentional design changes

## Accessibility Configuration

- `a11yFailOn`: array of axe impact levels to gate on. Default: `["critical","serious"]`. Only violations at these severities fail the build; everything else is treated as a non-gating advisory.
- `a11yIgnoreRules`: array of axe rule IDs to ignore when evaluating failures (e.g., `"color-contrast"`).
- `a11yMode`: how accessibility specs behave. `"gate"` (default) aggregates violations across all pages/viewports and fails once at the end; `"audit"` logs the summary without failing so you can review issues without blocking the pipeline.
- `a11yResponsiveSampleSize`: number of pages (per viewport) for the responsive a11y sweep. Accepts a positive integer or `'all'`. Default: `3`. Use the site config (or the global `--pages` flag) when you need temporary breadth adjustments without code changes.
- `a11yKeyboardSampleSize` / `a11yMotionSampleSize` / `a11yReflowSampleSize` / `a11yIframeSampleSize`: optional overrides for the keyboard, reduced-motion, reflow, and iframe audits. Each falls back to `a11yResponsiveSampleSize` when omitted.
- `a11yStructureSampleSize`: optional override for the structural landmark audit (defaults to `a11yResponsiveSampleSize`).
- `ignoreConsoleErrors`: array of substrings or regex patterns (string form) to suppress known console noise during interactive scans.
- `resourceErrorBudget`: maximum number of failed network requests (request failures or 4xx/5xx responses) tolerated before the interactive spec soft-fails. Default: `0`.

These fields are optional. When present, they control how the a11y tests in `tests/a11y.audit.wcag.spec.js` decide which violations trigger failures. The suite generates structured summaries (HTML + Markdown via `utils/reporting-utils.js`) that appear inline in the custom report:

Include mobile/tablet Playwright projects (e.g., `--project="Chrome,Chrome Mobile,Chrome Tablet"`) when you need multi-viewport coverage.

- Inline the full summary so reviewers don’t have to download artifacts.
- Split the findings into **gating** (impact ∈ `a11yFailOn`), **non-gating WCAG advisories**, and **best-practice advisories** (rules without WCAG tags) so you can see the full axe signal without conflating compliance with severity.
- Display WCAG version/level badges alongside the traditional axe impact, so project managers can answer “which WCAG criteria failed?” while engineering stays focused on user-harm severity.

Non-gating findings still appear in the report even though they do not fail CI. If you need stricter gating (e.g., include `moderate`), just extend `a11yFailOn` in your site config. Functionality/accessibility suites default to the Playwright project you pass (we typically run Chrome). Omit `--project` if you want Playwright to execute the same checks across every configured browser/device profile.

Need a compliance-only view? Set `A11Y_TAGS_MODE=wcag` in the environment before launching the runner to scope the axe pass to WCAG-tagged rules (gating still follows `a11yFailOn`).

For additional context on why we continue to gate on severity instead of raw WCAG tags, see [`why_not_wcag_gating.md`](./why_not_wcag_gating.md).
