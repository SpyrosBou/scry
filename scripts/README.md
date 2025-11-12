# Scripts Directory

The `scripts/` folder is organized by concern so it is easy to find the tooling that powers the test harness:

```
scripts/
├── AGENTS.md                  # workflow policies for contributors
├── README.md                  # this file
├── discovery/                 # site manifest + sitemap tooling
│   ├── discover-pages.js      # scaffolds/refreshes site configs
│   └── update-baselines.js    # refreshes visual baselines for sites
├── reporting/                 # HTML report utilities and styling
│   ├── build-report-styles.js
│   ├── read-reports.js
│   ├── regenerate-report.js
│   ├── run-utils.js
│   ├── serve-report-dev.js
│   └── preview/
│       └── run-service.js
├── maintenance/               # cleanup, smoke servers, browser installs
│   ├── cleanup.js
│   ├── check-browser-teardown.js
│   ├── install-browsers.js
│   ├── static-server.js
│   └── wait-url.js
└── runtime/
    └── playwright-global-setup.js
```

## Authoring Guidelines

- **Naming:** prefer action-oriented filenames (e.g., `read-reports.js`, `install-browsers.js`). When scripts share logic, extract it into `utils/` so unit tests can cover it.
- **Header comments:** each script should start with a short comment that explains what it does and list any side effects. Immediately below, enumerate relevant environment variables so users can discover them without reading the entire file.
- **Logging:** keep logs single-line and prefix with the script name when possible (e.g., `[discover-pages]`).
- **CLI usability:** support `--help` wherever practical and reuse the same flag names exposed by `run-tests.js` (`--site`, `--pages`, `--workers`, etc.) so tooling feels consistent.
- **Documentation:** when scripts change behavior, update this tree (if new files are added), `scripts/AGENTS.md`, and the repository `README.md` to keep contributors oriented.
