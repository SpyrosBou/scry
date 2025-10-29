# Experimental YAML Specs

YAML specifications for structured, higher-level test definitions. These specs can be converted into Playwright tests via a generator, but are not wired into the CLI runner by default. Hand-authored tests in `tests/` remain canonical.

## Layout

```
specs/
├── README.md                     # This file
├── templates/                    # Starter templates
│   ├── test-category.template.yml
│   └── test-case.template.yml
├── core-infrastructure/          # Availability, responses, basic perf
├── navigation-ux/                # Critical elements, internal links, nav
├── interactive-elements/         # JS errors, forms, interactions
├── accessibility/                # WCAG/axe checks (structure only)
├── wordpress-specific/           # Theme/plugin oriented checks
└── utils/                        # Loader + generator (experimental)
    ├── spec-loader.js
    └── spec-to-test-generator.js
```

Status: experimental; not executed by `run-tests.js` unless you manually generate a `.spec.js` file (see below).

## Spec Schema (overview)

- Metadata: category, version, description, priority, dependencies, tags
- Configuration: timeout, retries, parallel, browsers, viewports
- Test Cases: name, description, priority, reporting { epic, feature, story, severity }
- Steps: setup[], assertions[], cleanup[] (action/parameters vary by test type)
- Error Handling: soft_assertions, screenshot/video/trace_on_failure, recovery
- Integration: custom report summaries, error_context capture

Use the templates in `specs/templates/` for field names and structure.

## Example

```yaml
metadata:
  category: "core-infrastructure"
  version: "1.0.0"
  description: "Verify pages load and return non-error responses"
  priority: "high"
  tags: ["infrastructure", "availability"]

configuration:
  timeout: 30000
  retries: 2
  parallel: true

test_cases:
  - name: "page_availability_smoke"
    description: "Pages return 2xx and basic DOM is present"
    priority: "critical"
    reporting:
      epic: "Infrastructure"
      feature: "Availability"
      severity: "critical"
    setup:
      - action: "navigate"
        target: "{{baseUrl}}{{testPage}}"
    assertions:
      - type: "response_status"
        expected: 200
      - type: "element_visible"
        selector: "body"
```

## Generate Tests (manual)

You can generate a Playwright spec from YAML for local experimentation. This does not modify the runner. Two quick options:

1) Preview generated code to the console
```bash
node -e "const Gen=require('./specs/utils/spec-to-test-generator'); const g=new Gen(); console.log(g.generateFunctionalityTest());"
```

2) Write a runnable spec file and execute it
```bash
# Generate a top-level spec file picked up by the default pattern
node -e "const fs=require('fs'); const Gen=require('./specs/utils/spec-to-test-generator'); const g=new Gen(); const code=g.generateFunctionalityTest(); fs.writeFileSync('tests/functionality.generated.spec.js', code); console.log('Wrote tests/functionality.generated.spec.js');"

# Run with the existing runner (includes all top-level *.spec.js files)
# Swap 5 for another number or use --pages all to remove the cap.
node run-tests.js --site=<your-site> --pages=5 --functionality

# Or run Playwright directly (SITE_NAME is required by generated tests)
SITE_NAME=<your-site> npx playwright test tests/functionality.generated.spec.js
```

Notes
- Generated tests currently focus on functionality-style checks mapped from the YAML categories above.
- Avoid committing generated files unless intended; prefer regenerating locally. If you do commit, keep them stable and reviewed.
- The mapping from YAML → code is heuristic; custom or unfamiliar actions/assertions may fall back to generic steps.

## Authoring Guidelines

- Start from `templates/` and keep field names intact.
- Place specs under the closest category; prefer descriptive filenames.
- Keep `metadata.description` concise; use `tags` for discoverability.
- Use `priority` to signal importance: `critical|high|medium|low`.
- Keep forms non-destructive (no real submissions) and avoid write actions on live sites.

## Roadmap

- Optional `--use-specs` flag in the runner to generate/execute on demand.
- Schema docs and richer action/assertion libraries.
- CI wiring (off by default) once stability is proven.
