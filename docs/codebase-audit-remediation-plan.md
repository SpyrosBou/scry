# Codebase Audit and Remediation Plan

## Audit Context

- Repository: `website-testing`
- Branch audited: `refactor/report-templates-structure`
- HEAD audited: `d162e91`
- Audit date: 2026-03-29
- Audit stance: greenfield. Assume no live deployment constraints, no backward-compatibility obligations, and no need to preserve custom behavior unless it clearly earns its cost.
- Audit method: direct codebase inspection only. No implementation assumptions were taken from prior plans or subagent output.

## Executive Summary

This codebase is not failing because it lacks features. It is failing because it has accumulated too much custom infrastructure for the problem it is trying to solve. The project has a reasonable core stack, but it has drifted into a shape where a Playwright test harness now carries a custom runner, custom manifest transport, custom aggregation, custom schema contract, custom HTML reporter, custom report viewer, custom discovery workflow, and large helper layers that often repackage Playwright rather than using it directly.

The highest-value recommendation is not "polish what is here." It is "reduce the number of systems." Keep Playwright Test, Axe, JSON site manifests, and a small amount of reusable test support. Rebuild execution around deterministic run configuration, refactor specs into isolated per-page tests, and either radically slim the custom reporting stack or replace it with a simpler post-run reporting model.

If I were taking this project over, I would treat the current code as a functional prototype with some useful pieces, not as an architecture to preserve.

## Verified Baseline

| Area                      | Current State | Evidence                                                                                                                                                              |
| ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                | Passing       | `npm run test:unit` passed with 18 tests                                                                                                                              |
| Lint                      | Failing       | `npm run lint` fails on `utils/test-fixtures.js` and formatting drift in `utils/report-aggregation-store.js`                                                          |
| Formatting                | Failing       | `npm run prettier:check` fails                                                                                                                                        |
| Security                  | Failing       | `npm audit --json` reports 7 vulnerabilities, including high severity transitive findings                                                                             |
| Direct dependency hygiene | Weak          | `js-yaml`, `@testing-library/dom`, and `playwright-testing-library` are declared but not used anywhere in repo code                                                   |
| Package metadata          | Incorrect     | `package.json` declares `"main": "index.js"` but no `index.js` exists                                                                                                 |
| Install workflow          | Redundant     | `npm run setup` runs `npm install`, `npm run install-browsers`, and then `npx playwright install` again                                                               |
| Complexity hotspots       | Excessive     | `utils/report-templates.js` is 7,062 LOC, `utils/test-runner.js` is 991 LOC, `utils/wordpress-page-objects.js` is 830 LOC, `tests/a11y.audit.wcag.spec.js` is 776 LOC |
| Documentation consistency | Broken        | `README.md`, `SPEC.md`, and `docs/reporting-redesign-roadmap.md` disagree about current architecture and migration status                                             |

## What Is Worth Keeping

- `@playwright/test` is the right foundation. The problem is not the choice of Playwright. The problem is how much code has been built around it.
- `@axe-core/playwright` is the right accessibility foundation.
- The JSON site manifest concept is valid. The current schema and mutation model are not.
- The project clearly values structured output over ad hoc logs. That is the right instinct.
- The custom reporter work contains useful thinking around normalized findings, per-page summaries, and report artifacts. The issue is scope and coupling, not the desire for structured output.
- Some unit tests exist around validator and reporter helper behavior. That is the correct testing target, even if coverage is too thin relative to the system size.

## Ranked Findings

### 1. Critical: The execution path is not deterministic and can mutate repo-tracked configuration

`utils/test-runner.js` mixes execution and mutation. When `--discover` is passed, `TestRunner.runTestsForSite` can change `siteConfig.baseUrl`, `siteConfig.discover.sitemapUrl`, and `siteConfig.testPages`, then write those changes back into `sites/<name>.json`. A test execution path should not be able to rewrite tracked config files.

This violates a basic boundary: discovery is a content-authoring operation, execution is a read-only operation. Right now the runner doubles as both. That makes runs non-deterministic, makes dry runs less trustworthy, and hides configuration drift by "fixing" manifests during execution instead of forcing the manifest to be correct before the run starts.

Recommendation: keep discovery as a separate command. Remove all repo-tracked file writes from the execution path. A run may write only ignored artifacts under `reports/` or `test-results/`.

### 2. Critical: Timeout strategy is fundamentally misconfigured

`playwright.config.js` sets `timeout: 0`, which disables the global test timeout. Large specs then apply `test.setTimeout(7200000)` in multiple places, including `tests/a11y.audit.wcag.spec.js`, `tests/responsive.layout.structure.spec.js`, `tests/functionality.infrastructure.health.spec.js`, and `tests/visual.regression.snapshots.spec.js`.

This is not a reliability strategy. It is a hang-permission strategy. A bad selector, deadlocked page, or stalled browser becomes a multi-hour test instead of an actionable failure. It also destroys the signal value of retries and hides whether the runner is stuck or simply slow.

Recommendation: reintroduce a bounded global timeout and short operation-specific timeouts. If one suite legitimately needs a longer cap, that should still be measured in minutes, not hours, and should be justified by a stable execution model.

### 3. Critical: Most specs are batch jobs, not tests

The dominant pattern is "one giant test loops across many pages." Examples include `tests/functionality.infrastructure.health.spec.js`, `tests/functionality.interactive.smoke.spec.js`, `tests/responsive.layout.structure.spec.js`, and `tests/a11y.audit.wcag.spec.js`.

This bypasses Playwright's strongest feature: per-test isolation. One page failure can poison an entire suite-level test. Native retries become less useful. Failure output is coarse. Reporter logic has to become more custom because the test model no longer maps cleanly to the thing being tested.

Recommendation: generate tests per page or per page-and-viewport at definition time. Let Playwright own isolation, failure boundaries, parallelism, and retries.

### 4. High: The fixture contract exists but is not actually driving the suite

`utils/test-fixtures.js` defines `siteContext`, `siteConfig`, and `siteName`, but many specs still read `process.env.SITE_NAME`, call `SiteLoader.loadSite()`, and validate config in `beforeEach`. This duplication appears in `tests/responsive.layout.structure.spec.js`, `tests/functionality.infrastructure.health.spec.js`, `tests/visual.regression.snapshots.spec.js`, `tests/a11y.structure.landmarks.spec.js`, and others.

The duplication is already causing real quality problems: the fixture itself fails lint because of the empty destructuring pattern in `siteContext`, while the rest of the suite ignores the abstraction it is meant to standardize.

Recommendation: make fixtures the only source of site context. Remove direct `process.env.SITE_NAME` consumption from specs. Remove redundant `SiteLoader.loadSite()` calls from spec setup.

### 5. High: The helper and page-object layer is too large for the value it returns

`utils/test-helpers.js` is 653 LOC. `utils/wordpress-page-objects.js` is 830 LOC. Both contain real useful logic, but both also contain broad wrappers, retry behavior, fallback logic, and theme-guessing selectors that substantially increase maintenance cost.

This is a common testing anti-pattern: instead of keeping the tests close to Playwright, the codebase builds a secondary test framework. The result is more indirection, more logging, more custom recovery paths, and more places where behavior can diverge from Playwright norms.

Recommendation: keep only helpers that remove repeated, verified complexity. Delete wrappers that mostly rephrase `page.goto`, selectors, waits, or interactions without making tests more deterministic.

### 6. High: The reporting stack is oversized and over-coupled to the test suite

The reporting subsystem is now one of the largest parts of the repository. `utils/report-templates.js` alone is 7,062 LOC. `utils/custom-html-reporter.js` adds another 688 LOC. Specs are tightly coupled to report payload construction through `attachSchemaSummary`, `createRunSummaryPayload`, `createPageSummaryPayload`, and summary-type conventions.

The reporting design makes specs responsible for data collection and report-shape correctness at the same time. That is too much coupling. It also explains the high churn in recent history on branch `refactor/report-templates-structure`, where recent commits are dominated by `fix(a11y): tolerate partial wcag aggregation`, `fix(reports): surface wcag summaries in ui`, `fix(reports): slim wcag run summary payload`, and similar repair work.

Recommendation: decide whether the custom HTML report is a core product requirement. If not, replace it with a smaller post-run summarizer on top of Playwright outputs. If yes, narrow the contract so specs emit normalized machine data only and rendering happens downstream.

### 7. High: Metadata and schema naming are already drifting

The current report metadata model is inconsistent. In `utils/report-metadata.js`, `applyViewportMetadata` sets `projectName` from the site label rather than the Playwright project label, while also setting `browser`, `viewport`, and `viewports`. Across the codebase, `projectName`, `siteName`, `browser`, and `viewport` are not consistently distinct concepts.

Once a reporting system loses naming discipline at this level, every dashboard, table, renderer, and downstream consumer becomes harder to trust.

Recommendation: define one canonical meaning for each of `siteName`, `projectName`, and `viewport`. Enforce it in schema validation and stop inferring or reassigning labels in helper layers.

### 8. High: Dependency hygiene is already below the minimum acceptable bar

The repo declares unused direct dependencies: `js-yaml`, `@testing-library/dom`, and `playwright-testing-library`. `js-yaml` is also directly vulnerable at `4.1.0`. `npm audit` reports 7 vulnerabilities, including high severity issues in `flatted`, `immutable`, `minimatch`, and `picomatch`.

This is not a theoretical cleanup item. It is the simplest, fastest proof that the project is not controlling its own surface area.

Recommendation: remove unused direct packages immediately, then update the retained toolchain to current supported versions in controlled phases.

### 9. High: The install and package workflow is sloppy

`package.json` declares `"main": "index.js"` even though no `index.js` exists. The `setup` script runs `npm install` inside an npm script, then runs both `npm run install-browsers` and `npx playwright install`, which is redundant and undermines the point of `scripts/maintenance/install-browsers.js`.

This is not catastrophic, but it is a reliable marker of a project that has not defined its operational boundaries cleanly.

Recommendation: treat the package as a CLI-oriented private tool unless there is a real importable API to publish. Remove `main` if there is no library entry. Make `setup` a deterministic post-install task, not a second package-manager invocation.

### 10. High: Documentation is materially untrustworthy

`README.md` says the remaining reporting migrations include infrastructure, responsive, and visual panels. `docs/reporting-redesign-roadmap.md` says those same areas are complete. `SPEC.md` says the current report schema inventory lives in `docs/report-schema-inventory.md`, but that file does not exist. `docs/spec-to-report-pipeline.md` says suites "never read env vars directly," which is false in the current specs.

There is also a separate maintainability problem in the README's "Package-Lite Distribution" section, which says `../a11y-testing` is a mirrored copy of the repo outside Git. That is not a distribution strategy. It is an intentional drift generator.

Recommendation: replace the current status-heavy docs with fewer source-of-truth documents and remove the out-of-repo mirrored copy workflow entirely.

### 11. Medium: Site manifest validation is too weak

`utils/site-loader.js` only validates that `name`, `baseUrl`, and `testPages` are truthy. It does not validate URL shape, array shape, supported optional fields, threshold types, form config structure, or discovery config structure.

That weakness explains why the runner compensates with runtime repair logic such as homepage injection and host rewriting. The system is accepting bad input and trying to rescue it later.

Recommendation: add JSON schema validation and fail fast before execution. Stop compensating for invalid config inside runtime code.

### 12. Medium: Fixed sleeps are still present across tests and helpers

Hard waits still exist in the suite, including `page.waitForTimeout(300)` in `tests/visual.regression.snapshots.spec.js`, `page.waitForTimeout(1200)` in `tests/a11y.forms.validation.spec.js`, multiple waits in `tests/a11y.keyboard.navigation.spec.js`, and helper-level waits in `utils/test-helpers.js` and `utils/wordpress-page-objects.js`.

Some of these may be pragmatic for visual diff stabilization, but right now they are spread through the codebase without a disciplined standard. That is an avoidable flake source.

Recommendation: replace fixed waits with state-based readiness checks wherever possible. Where a wait is still required for rendering stability, isolate it in one named helper with an explicit justification.

### 13. Medium: Test coverage is badly out of proportion to system size

The repo currently has 10 spec files and 5 unit test files. Only 3 unit tests are clearly report-related, even though reporting is one of the largest and riskiest subsystems.

This does not mean the codebase needs blanket coverage. It means the codebase is investing complexity in the wrong places. Large reusable systems such as the runner, manifest loading, schema validation, and reporting transforms should have direct tests. Giant spec files should not be carrying the burden alone.

Recommendation: add targeted unit coverage for config parsing, runner resolution, schema shaping, and report transformation. Reduce the amount of logic that only executes inside end-to-end runs.

### 14. Medium: The project identity is unclear

The package is named `wordpress-testing-suite`. The README calls it a "WordPress Testing Suite." `SPEC.md` calls it "Website Testing Runner" and frames it as a future GUI-backed engine. The actual implementation is somewhere between a WordPress site audit harness and a report-generation platform.

This matters because architecture follows product boundaries. A repo that does not know whether it is a CLI runner, reusable core engine, or HTML reporting product will keep building all three.

Recommendation: pick one primary identity. My recommendation is: a CLI-first Playwright audit runner with a small optional report viewer.

## Keep, Delete, Rebuild

### Keep

- `@playwright/test`
- `@axe-core/playwright`
- JSON site manifests as the source of target inventory
- A small shared fixture layer
- Small, well-tested schema validation utilities
- Generated report artifacts under ignored output directories

### Delete

- Unused direct dependencies
- Runtime writes into `sites/*.json`
- `timeout: 0` and 2-hour test timeouts
- Spec-local site loading and direct env lookups
- The sibling `../a11y-testing` mirror workflow
- Compatibility no-ops that no longer serve a real caller

### Rebuild

- Runner orchestration
- Spec structure and isolation model
- Site config validation
- Report data contract
- Documentation set

## Target Architecture

- A thin CLI adapter parses arguments and produces a normalized `RunConfig`.
- A pure resolver reads site config, expands requested pages, applies filters, and produces an immutable execution manifest.
- Discovery is a separate command that is the only code path allowed to mutate site manifests.
- Specs consume fixtures only. They do not load config or env directly.
- Tests are defined per page or per page-and-viewport, so Playwright owns isolation and retries.
- Reporting is a post-run concern. Specs emit normalized machine data. Rendering is separate from execution.

## Dependency Decision Matrix

| Package                      | Current State                            | Decision                              | Notes                                                                  |
| ---------------------------- | ---------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| `js-yaml`                    | Declared, unused, directly vulnerable    | Remove in Phase 1                     | No repo code imports it                                                |
| `@testing-library/dom`       | Declared, unused                         | Remove in Phase 1                     | No repo code imports it                                                |
| `playwright-testing-library` | Declared, unused                         | Remove in Phase 1                     | No repo code imports it                                                |
| `@playwright/test`           | Core dependency, outdated                | Keep and update in Phase 1            | Update to current supported minor after timeout cleanup                |
| `@axe-core/playwright`       | Core dependency, outdated patch          | Keep and update in Phase 1            | Low-risk update                                                        |
| `eslint`                     | Core tooling, outdated                   | Keep and update within 9.x in Phase 1 | Defer ESLint 10 until lint rules are stabilized                        |
| `eslint-config-prettier`     | Needed if Prettier-in-eslint remains     | Keep and update in Phase 1            | Re-evaluate if formatting model changes                                |
| `eslint-plugin-prettier`     | Currently used                           | Keep short term                       | Could be removed later if formatting is decoupled from lint            |
| `prettier`                   | Needed                                   | Keep and update in Phase 1            | Current repo already fails formatting                                  |
| `sass`                       | Used by report style build               | Keep and update in Phase 1            | Re-evaluate only if custom report UI is reduced                        |
| `open`                       | Used by report viewer scripts            | Keep short term                       | Remove if report viewer is replaced or simplified                      |
| `chokidar`                   | Used by report preview server            | Keep short term                       | Remove if dev preview server is dropped                                |
| `pixelmatch`                 | Used in keyboard focus-indicator diffing | Keep only if that feature survives    | Otherwise remove                                                       |
| `pngjs`                      | Used with `pixelmatch`                   | Same as `pixelmatch`                  | Same decision                                                          |
| `minimist`                   | Used across CLI scripts                  | Keep short term                       | Replace later with a stricter parser only if CLI surface remains broad |

## Phased Remediation

## Phase 1: Stop Current Breakage and Trim Dead Weight

- Fix lint and formatting failures.
- Remove unused direct dependencies: `js-yaml`, `@testing-library/dom`, `playwright-testing-library`.
- Remove invalid package metadata such as `"main": "index.js"` if no library entry point is intended.
- Replace `npm run setup` with a deterministic bootstrap that does not call `npm install` internally and does not duplicate Playwright browser installation.
- Update retained low-risk dependencies and regenerate `package-lock.json`.

### Phase 1 Acceptance Criteria

- `npm run lint` passes.
- `npm run prettier:check` passes.
- `npm audit` has no high or critical findings.
- `package.json` declares only dependencies that are actually used.
- Bootstrap commands are single-purpose and non-redundant.

## Phase 2: Separate Discovery from Execution

- Remove repo-tracked file writes from `TestRunner.runTestsForSite`.
- Move sitemap refresh and site-file mutation exclusively into `scripts/discovery/discover-pages.js` or a replacement discovery command.
- Refactor runner logic into smaller modules: CLI parsing, config resolution, manifest creation, Playwright invocation, report summary reading.
- Stop mutating global `process.env` inside the runner except for explicit child-process env payload construction.

### Phase 2 Acceptance Criteria

- `node run-tests.js --dry-run` never writes repo-tracked files.
- `node run-tests.js` never writes repo-tracked files.
- Only discovery commands can change `sites/*.json`.
- `utils/test-runner.js` is no longer the single home for unrelated execution concerns.

## Phase 3: Rebuild Specs Around Playwright's Native Model

- Remove `timeout: 0` from `playwright.config.js`.
- Remove all 2-hour spec-level timeouts.
- Convert page loops into generated tests per page or per page-and-viewport.
- Make fixtures the only source of site context and remove direct `process.env.SITE_NAME` reads from specs.
- Replace fixed sleeps with state-based waits wherever possible.
- Shrink or delete helper abstractions that mostly repackage Playwright.

### Phase 3 Acceptance Criteria

- No spec reads `process.env.SITE_NAME`.
- No spec calls `SiteLoader.loadSite()` in setup.
- No spec contains `test.setTimeout(7200000)`.
- Global test timeout is bounded.
- Failures are isolated to individual pages or page-and-viewport combinations.

## Phase 4: Simplify Reporting and Data Contracts

- Decide whether the custom HTML report is a product feature or an internal convenience.
- If it is a convenience, replace the current custom reporter stack with a smaller post-run summary layer.
- If it is a product feature, narrow the contract so specs emit normalized JSON only and renderers consume that JSON without extra inference.
- Fix naming discipline for `siteName`, `projectName`, `browser`, and `viewport`.
- Continue modularizing or replacing `utils/report-templates.js` until it is no longer a monolith.

### Phase 4 Acceptance Criteria

- Report payload fields have one meaning each and are documented.
- Specs are not responsible for presentation concerns.
- `utils/report-templates.js` is no longer a single-file monolith.
- The report viewer can be changed without rewriting specs.

## Phase 5: Lock Down Schemas and Configuration Discipline

- Add JSON schema validation for site manifests.
- Validate optional fields such as `forms`, `visualThresholds`, `visualOverrides`, `discover`, and accessibility sampling config before execution.
- Remove runtime "repair" behavior such as silent homepage injection except where explicitly configured.
- Define one documented report-schema inventory if the custom report stack remains.

### Phase 5 Acceptance Criteria

- Invalid site configs fail fast before any browser work starts.
- Runtime execution no longer silently repairs configuration mistakes.
- Schema inventory docs exist and match code.

## Phase 6: Rewrite Documentation Around Reality

- Replace drift-prone status claims in `README.md`, `SPEC.md`, and roadmap docs with source-of-truth documentation.
- Remove references to nonexistent docs such as `docs/report-schema-inventory.md` until they actually exist.
- Delete the README guidance that relies on a mirrored sibling copy at `../a11y-testing`.
- Document the actual supported workflow: install, discovery, execution, report viewing, baseline updates.

### Phase 6 Acceptance Criteria

- README, SPEC, and docs do not contradict each other.
- Every referenced document exists.
- No doc describes architecture that the repo no longer uses.
- No doc instructs contributors to maintain out-of-repo mirrored copies.

## Test and Validation Strategy During Refactor

- Use targeted unit tests for pure runner/config/report modules.
- Keep targeted Playwright smoke coverage small while execution architecture is changing.
- Validate one representative site per suite family after each structural phase.
- Do not run broad all-pages suites as a substitute for unit coverage during refactor.

## Final Recommendation

Do not treat this as a cleanup sprint. Treat it as a simplification program.

The current project has good intent and real effort behind it, but it has crossed the point where incremental local fixes will keep paying off. The right move is to reduce the number of custom systems, restore deterministic boundaries, and make Playwright do more of the work the codebase is currently trying to do itself.
