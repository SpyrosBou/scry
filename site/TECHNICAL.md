# Scry Landing Page — Technical Reference

## File Structure

```
site/
  index.html                  # Single-page landing (all sections)
  build.js                    # SCSS → CSS compiler
  serve.js                    # Dev server with live reload
  DESIGN.md                   # Aesthetic direction and design rationale
  TECHNICAL.md                # This file
  styles/
    landing.scss              # Entry point (@use partials)
    landing.css               # Compiled output (committed to git)
    _variables.scss           # CSS custom properties and font imports
    _base.scss                # Reset, body defaults, typography foundations
    _components.scss          # Buttons, code blocks, nav, badges
    _hero.scss                # Hero section + gradient mesh + floating orbs
    _features.scss            # Feature card grid with colored accents
    _how-it-works.scss        # 3-step process with connecting line
    _benefits.scss            # Asymmetric statement + benefit cards
    _cta.scss                 # Final CTA section
    _footer.scss              # Footer with gold gradient border
    _animations.scss          # Scroll-reveal, credibility bar, reduced-motion
    _responsive.scss          # All breakpoint overrides
  js/
    landing.js                # IntersectionObserver, nav scroll, year, smooth scroll
```

The `site/` directory (singular) is distinct from `sites/` (plural), which holds per-environment JSON manifests for the auditing tool.

## Development

### Build styles

```bash
npm run site:build
```

Compiles `site/styles/landing.scss` → `site/styles/landing.css` using the `sass` package (already a project dependency). The compiled CSS is committed to git for deployment simplicity.

### Dev server

```bash
npm run site:dev
```

Starts an HTTP server on port 3000 (override with `SITE_PORT` env var or `--port` flag). Features:
- Serves `site/` as static files
- Watches `.scss` files via `chokidar`, recompiles on change
- SSE-based live reload (injected `<script>` tag, `/__reload` endpoint)
- `--open` flag auto-launches browser via the `open` package
- Avoids port conflict with the report dev server (port 4173)

## Design Tokens

All tokens are CSS custom properties defined in `_variables.scss`. No Sass variables are used — everything is runtime-accessible.

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-deep` | `#0a0e1a` | Page background, deepest layer |
| `--bg-primary` | `#0f1629` | Section backgrounds (features, benefits) |
| `--bg-elevated` | `#151d35` | Cards, elevated surfaces |
| `--bg-surface` | `#1a2340` | Secondary cards, inset panels |
| `--bg-subtle` | `#1e2a4a` | Hover fills |
| `--text-primary` | `#e8e6e1` | Body text (~15:1 on deep bg) |
| `--text-secondary` | `#9ca3b4` | Muted text (~7.5:1 on deep bg) |
| `--text-tertiary` | `#8891a0` | Captions, metadata (~5.3:1, AA compliant) |
| `--text-inverse` | `#0a0e1a` | Text on light/gold backgrounds |
| `--gold` | `#d4a574` | Primary accent, CTAs |
| `--gold-light` | `#f0c987` | Hover state for gold elements |
| `--gold-muted` | `#a67c52` | Subdued gold (borders, decorative lines) |
| `--gold-glow` | `rgba(212,165,116,0.15)` | Ambient glow behind gold elements |
| `--cyan` | `#4ecdc4` | Secondary accent, links |
| `--cyan-light` | `#7eddd6` | Hover state for cyan elements |
| `--status-blue` | `#268bd2` | Functionality suite (Solarized) |
| `--status-yellow` | `#b58900` | Responsiveness suite (Solarized) |
| `--status-green` | `#859900` | Accessibility suite (Solarized) |
| `--status-red` | `#dc322f` | Visual regression suite (Solarized) |

### Typography

| Token | Value | Usage |
|-------|-------|-------|
| `--font-display` | Instrument Serif, Georgia, serif | Headlines, wordmark |
| `--font-body` | Plus Jakarta Sans, Inter, system-ui | Body text, UI elements |
| `--font-mono` | JetBrains Mono, SF Mono, Consolas | Code blocks, CLI examples |

Fonts are loaded from Google Fonts with `display=swap`:
```
Instrument Serif (regular, italic)
Plus Jakarta Sans (400, 500, 600, 700)
JetBrains Mono (400, 500)
```

### Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| `--section-gap` | `clamp(4rem, 8vw, 8rem)` | Vertical padding between sections |
| `--content-max` | `1200px` | Maximum content width |
| `--content-narrow` | `800px` | Narrow content (not currently used) |
| `--radius-sm` | `8px` | Small elements, badges |
| `--radius-md` | `12px` | Buttons, code blocks, cards |
| `--radius-lg` | `20px` | Feature cards |
| `--radius-xl` | `28px` | Large containers (reserved) |

## Responsive Breakpoints

Mobile-first with `min-width` media queries. All breakpoint overrides live in `_responsive.scss`.

| Breakpoint | Target | Key changes |
|------------|--------|-------------|
| Base (< 600px) | Mobile | Single column, stacked CTAs, no credibility dividers |
| `>= 600px` | Tablet | 2x2 feature grid, 2x2 benefits, 3-col footer |
| `>= 960px` | Small desktop | Horizontal steps, asymmetric benefits (sticky left) |
| `>= 1200px` | Full desktop | 2x2 benefits grid alongside sticky statement |

Typography uses `clamp()` throughout for fluid scaling without breakpoint-specific overrides:
- `h1`: `clamp(2.8rem, 6vw, 5rem)`
- `h2`: `clamp(1.8rem, 3.5vw, 2.8rem)`
- `h3`: `clamp(1.2rem, 2vw, 1.5rem)`

## CSS Architecture

### SCSS Module Pattern

The entry point `landing.scss` uses `@use` to compose partials in dependency order:

```scss
@use './variables';    // Tokens (must be first — defines :root custom properties)
@use './base';         // Reset + typography
@use './components';   // Shared components (buttons, code blocks, nav, badges)
@use './hero';         // Hero section
@use './features';     // Feature cards
@use './how-it-works'; // Steps section
@use './benefits';     // Benefits section
@use './cta';          // CTA section
@use './footer';       // Footer
@use './animations';   // Scroll-reveal + credibility bar + reduced-motion
@use './responsive';   // Breakpoint overrides (must be last)
```

### BEM-ish Naming

Classes follow a simplified BEM convention: `.block__element--modifier`.

- Blocks: `.hero`, `.feature-card`, `.step`, `.benefit`, `.nav`, `.footer`
- Elements: `.hero__title`, `.feature-card__desc`, `.step__number`
- Modifiers: `.feature-card--blue`, `.btn--primary`, `.badge--error`

### Section Backgrounds

Sections alternate between `--bg-deep` and `--bg-primary` to create visual rhythm:

| Section | Background |
|---------|-----------|
| Hero | `--bg-deep` + gradient mesh |
| Credibility | `--bg-primary` |
| Features | `--bg-primary` |
| How It Works | `--bg-deep` |
| Benefits | `--bg-primary` |
| CTA | `--bg-deep` + radial gradient |
| Footer | `--bg-deep` |

## JavaScript

`landing.js` is a single IIFE with four responsibilities:

### Scroll Reveal

Uses `IntersectionObserver` with `threshold: 0.15` and `rootMargin: '0px 0px -40px 0px'`. Elements with class `.reveal` start at `opacity: 0; transform: translateY(24px)` and receive `.reveal--visible` when they enter the viewport. Each element is unobserved after reveal (one-shot). Stagger delays are set via inline `--reveal-delay` custom properties.

Fallback: if `IntersectionObserver` is unavailable, all `.reveal` elements receive `.reveal--visible` immediately.

### Nav Scroll Effect

Adds `.nav--scrolled` to the `<nav>` when `window.scrollY > 60`. The class triggers `backdrop-filter: blur(12px)` and a semi-transparent background.

### Copyright Year

Sets `#year` text content to `new Date().getFullYear()`.

### Smooth Scroll

Intercepts clicks on `a[href^="#"]` and calls `scrollIntoView({ behavior: 'smooth' })`.

## Hero Background Effects

The hero uses three layered pseudo/child elements for atmosphere:

1. **`.hero__mesh`** — Three overlapping `radial-gradient()` ellipses (gold, cyan, blue) that slowly drift via `@keyframes mesh-drift` (20s, alternate). Creates a living gradient mesh.
2. **`.hero__noise`** — An inline SVG `feTurbulence` pattern at 3.5% opacity, creating subtle grain texture. `pointer-events: none`.
3. **`.hero__orb--gold` / `.hero__orb--cyan`** — Two large (280-350px), heavily blurred (`filter: blur(80px)`) circles that float independently on 18-22s animation cycles. Pure atmosphere.

All effects are `z-index: 0-1` with content at `z-index: 2`. All are `aria-hidden="true"`.

## Component Reference

### Buttons (`.btn`)

| Class | Appearance | Usage |
|-------|-----------|-------|
| `.btn--primary` | Gold background, dark text, glow shadow | Primary CTAs |
| `.btn--secondary` | Transparent, subtle border | Secondary actions |
| `.btn--ghost` | No background, cyan text, arrow suffix | Inline links |

All buttons have `min-height: 48px` for touch targets and `transition: transform 0.2s, box-shadow 0.2s`.

### Code Blocks (`.code-block`)

Dark semi-transparent background with monospace font. Supports semantic spans:
- `.prompt` — `$` prefix (gold-muted, `user-select: none`)
- `.command` — Command name (primary text)
- `.flag` — Flags like `--site` (cyan)
- `.value` — Values like `my-store` (gold-light)

### Badges (`.badge`)

Small mono-font pills with status-colored backgrounds at 15% opacity:
- `.badge--error` (red), `.badge--warning` (yellow), `.badge--ok` (green), `.badge--info` (blue)

### Feature Cards (`.feature-card`)

Elevated surface with 3px colored top-border. Modifier classes set the accent color:
- `.feature-card--blue`, `--yellow`, `--green`, `--red`

Each card includes a `.feature-card__sample` — a mini finding styled like the product's report UI.

## Lighthouse Scores

Verified on 2026-03-29:

| Category | Desktop | Mobile |
|----------|---------|--------|
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

The `--text-tertiary` color was adjusted from `#6b7280` to `#8891a0` during development to meet WCAG AA contrast requirements against both `--bg-primary` and `--bg-deep` backgrounds.
