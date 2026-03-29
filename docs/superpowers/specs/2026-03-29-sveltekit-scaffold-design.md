# Sub-project 1: SvelteKit Scaffold + Tailwind Design System

## Context

Scry's in-app UI has been designed and validated as static HTML mockups in `site/app/`. The approved design spec lives at `docs/superpowers/specs/2026-03-29-in-app-ui-design.md`. This sub-project scaffolds the real SvelteKit application that will replace those mockups, starting with the project foundation: routing, layout shell, design system, and reusable components.

**Stack**: SvelteKit + Tailwind CSS v4 + Vite
**Location**: `app/` at the project root
**Port**: 4401 (Vite dev server)
**Depends on**: Nothing (this is the foundation)
**Delivers**: Navigable app shell with placeholder pages and full design system

---

## Directory Structure

```
app/
├── src/
│   ├── app.css                          # Tailwind entry: @import "tailwindcss" + base layer
│   ├── app.html                         # HTML template
│   ├── routes/
│   │   ├── +layout.svelte               # App shell (imports AppShell)
│   │   ├── +page.svelte                 # Root redirect → first site dashboard
│   │   ├── (app)/                       # Route group: pages WITH app shell
│   │   │   ├── +layout.svelte           # Shell layout (sidebar + topbar + slot)
│   │   │   ├── sites/
│   │   │   │   └── [slug]/
│   │   │   │       ├── +page.svelte     # Site dashboard (placeholder)
│   │   │   │       └── settings/
│   │   │   │           └── +page.svelte # Site settings (placeholder)
│   │   │   └── reports/
│   │   │       └── [runId]/
│   │   │           ├── +page.svelte     # Report overview (placeholder)
│   │   │           └── [suite]/
│   │   │               └── +page.svelte # Report detail (placeholder)
│   │   └── (fullscreen)/                # Route group: pages WITHOUT app shell
│   │       ├── +layout.svelte           # Minimal layout (no sidebar/topbar)
│   │       └── onboarding/
│   │           └── +page.svelte         # Onboarding flow (placeholder)
│   └── lib/
│       ├── components/
│       │   ├── AppShell.svelte           # Sidebar + topbar + main panel container
│       │   ├── Sidebar.svelte            # Tree nav with projects/sites
│       │   ├── Topbar.svelte             # Fixed top bar
│       │   ├── ScoreCards.svelte          # 4-up score grid
│       │   ├── HealthDot.svelte           # Color-coded status dot
│       │   ├── Badge.svelte               # Status pill (error/warning/ok/info)
│       │   └── Button.svelte              # btn/btn--primary/secondary/ghost/danger
│       └── styles/
│           └── theme.css                 # @theme design tokens
├── static/                               # Static assets
├── svelte.config.js                      # SvelteKit config (adapter-auto)
├── vite.config.js                        # Vite config (tailwind plugin, port 4401)
└── package.json                          # SvelteKit + Tailwind deps
```

---

## Tailwind Integration

### Entry point: `src/app.css`

```css
@import "tailwindcss";
@import "$lib/styles/theme.css";

@layer base {
  html { color-scheme: dark; }
  body {
    font-family: var(--font-body);
    color: var(--color-text-primary);
    background: var(--color-deep);
    -webkit-font-smoothing: antialiased;
  }
  /* ... heading styles, focus-visible, selection, skip-link ... */
}
```

### Theme tokens: `src/lib/styles/theme.css`

Ported directly from `site/app/styles/theme.css`. All `@theme` tokens carry over unchanged:
- Colors: deep, primary, elevated, surface, gold, cyan, status-*, border-*, text-*
- Typography: font-display, font-body, font-mono
- Spacing, shadows, radius
- Animations: pulse-dot, spin, mesh-drift, orb-float

### Vite plugin

Use `@tailwindcss/vite` instead of the CLI. SvelteKit's Vite config gets:

```js
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: 4401 }
});
```

---

## Route Groups

Two layout groups handle the shell/no-shell split:

### `(app)` group — pages with sidebar + topbar

`(app)/+layout.svelte` renders `<AppShell>` which contains `<Sidebar>`, `<Topbar>`, and a `<main>` slot. All child routes render inside the main panel.

Routes:
- `/sites/[slug]` — site dashboard
- `/sites/[slug]/settings` — site settings
- `/reports/[runId]` — report overview
- `/reports/[runId]/[suite]` — report detail

### `(fullscreen)` group — pages without shell

`(fullscreen)/+layout.svelte` renders a minimal wrapper (just the slot, no sidebar/topbar). Used for onboarding and future auth pages.

Routes:
- `/onboarding` — first-time flow

### Root `+page.svelte`

Redirects to `/sites/acme-com` (or first available site). In future sub-projects, this will redirect based on the authenticated user's data.

---

## Components

### AppShell.svelte

Container component. Renders:
- `<Topbar>` fixed at top
- `<Sidebar>` fixed left
- `<main>` slot for page content

Props: none (layout-level, no external data yet).

### Sidebar.svelte

Tree navigation with `role="tree"` / `role="treeitem"` / `role="group"`.

Props:
- `projects` — array of `{ name, sites: [{ slug, name, health }] }` (static sample data for now)
- `activeSite` — current site slug (derived from `$page.params.slug`)

Behavior:
- Arrow key navigation (Up/Down/Home/End)
- Click navigates to `/sites/[slug]`
- Gear icon navigates to `/sites/[slug]/settings`
- Active site highlighted with gold accent
- `group`/`group-hover` for gear icon visibility

### Topbar.svelte

Fixed top bar with:
- Scry wordmark (link to `/`)
- Nav items: Dashboard (link to current site), Reports
- Settings gear, avatar placeholder

Props:
- `activePage` — "dashboard" | "reports" (for active highlight)

### HealthDot.svelte

Props: `status` — "green" | "yellow" | "red" | "none" | "running"

Renders a `<span>` with the appropriate health-dot class.

### Badge.svelte

Props: `variant` — "error" | "warning" | "ok" | "info"

Slots: default (badge text content).

### Button.svelte

Props:
- `variant` — "primary" | "secondary" | "ghost" | "danger" (default: "primary")
- `size` — "default" | "sm"
- `href` — if provided, renders as `<a>`, otherwise `<button>`
- `disabled` — boolean

Slots: default (button text).

### ScoreCards.svelte

Props: `scores` — array of `{ suite, value, status }`.

Renders the 4-up grid with color-coded top borders and score values.

---

## Placeholder Pages

Each route renders inside the app shell with:
- Correct `<h1>` for the page (e.g., "acme.com", "Accessibility Report")
- Route params displayed (slug, runId, suite)
- Styled placeholder text: "This page will show [description]. Coming in sub-project #N."
- No data fetching, no auth, no forms

The site dashboard placeholder includes the `<ScoreCards>` component with hardcoded sample data so we can verify the design system end-to-end.

---

## Static Sample Data

Hardcoded in `Sidebar.svelte` (no store, no API):

```js
const projects = [
  {
    name: 'Acme Corp',
    sites: [
      { slug: 'acme-com', name: 'acme.com', health: 'green' },
      { slug: 'blog-acme-com', name: 'blog.acme.com', health: 'yellow' }
    ]
  },
  {
    name: 'Bella Design',
    sites: [
      { slug: 'belladesign-co', name: 'belladesign.co', health: 'green' },
      { slug: 'shop-bella-co', name: 'shop.bella.co', health: 'red' }
    ]
  }
];
```

This matches the mockup data exactly. Replaced with real Supabase queries in sub-project #3.

---

## Fonts

Google Fonts loaded via `app.html` `<head>`:
- Instrument Serif (400, italic)
- Plus Jakarta Sans (400, 500, 600, 700)
- JetBrains Mono (400, 500)

Same `<link>` tag as the mockups.

---

## Verification

After this sub-project is complete:
1. `cd app && npm run dev` starts the dev server on `:4401`
2. Browser shows the dashboard with sidebar, topbar, and score cards
3. Clicking sidebar sites navigates between `/sites/[slug]` routes
4. Clicking the gear icon navigates to `/sites/[slug]/settings`
5. Topbar "Reports" link navigates to `/reports/run-1`
6. `/onboarding` renders full-screen without the app shell
7. All colors, fonts, spacing, and component styles match the static mockups
8. Keyboard navigation works in the sidebar tree (arrow keys, Home/End)
9. `prefers-reduced-motion` disables animations
