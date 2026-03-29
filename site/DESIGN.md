# Scry Landing Page — Design Direction

## Concept: "Mystical Insight"

The name "Scry" means divination — seeing what is hidden. The landing page leans into this metaphor: a tool that reveals the invisible flaws in your WordPress sites. The aesthetic evokes precision, foresight, and quiet authority.

## Tone

Dark, atmospheric, luminous. Not aggressive or flashy — more like a well-lit observatory at night. Confident without being loud. The design should feel like it belongs to a tool built by people who care about craft.

## Color Philosophy

**Dark-dominant palette.** Deep navy backgrounds create depth and focus. Two accent families provide contrast:

- **Gold / warm** — used for primary actions, headlines that need emphasis, and decorative accents. Gold connotes insight, value, and the "reveal" moment. It's the emotional accent.
- **Cyan / cool** — used for secondary actions, links, and data-adjacent elements. Cyan connects to the technical/analytical side of the product. It's the rational accent.
- **Solarized status colors** — borrowed directly from the product's report UI (blue, yellow, green, red) for the feature cards. This creates a visual bridge between the marketing page and the product experience.

The two accent families should never compete for attention in the same visual block. Gold dominates hero and CTA sections; cyan dominates links and benefit icons. Feature cards use their own status-color accents.

## Typography

Three font families, each with a clear role:

- **Instrument Serif** (display) — editorial, elegant, with beautiful italic forms. Used for headlines and the wordmark. Carries the "mystical" aspect of the brand. Never used below 1.2rem.
- **Plus Jakarta Sans** (body) — geometric sans-serif with rounded terminals. Modern and approachable at body sizes. Carries legibility and professionalism. Used for descriptions, navigation, and UI text.
- **JetBrains Mono** (code) — clean developer-oriented monospace. Used sparingly for CLI examples and the code-block component. Reinforces the CLI-first technical identity.

The contrast between the serif headlines and sans-serif body creates visual hierarchy without needing weight extremes. Instrument Serif at 400 weight is already distinctive enough.

## Layout Principles

- **Asymmetry over centering.** The hero is intentionally left-aligned on desktop, leaving the right side for atmospheric effects. This creates visual tension and avoids the generic centered-hero look common in SaaS pages.
- **Generous negative space.** Sections breathe. The `--section-gap` token uses `clamp(4rem, 8vw, 8rem)` so spacing adapts without feeling cramped on any viewport.
- **Cards as containers.** Feature cards and benefit cards use elevated surfaces (`--bg-elevated`) with subtle borders to create depth against the dark background. Hover states lift cards slightly and shift border colors.
- **The benefits section** uses a sticky left-column statement ("Stop finding bugs in production.") with a scrolling grid of benefit cards on the right. This creates a reading rhythm that anchors the emotional message while the practical points scroll past.

## Motion Philosophy

Motion serves three purposes and nothing else:

1. **Atmosphere** — the hero gradient mesh drifts slowly (20s cycle), and two blurred orbs float behind the content. These are purely decorative and create a living, breathing background without demanding attention.
2. **Entrance** — elements reveal as they scroll into view with a subtle upward slide and fade. Staggered delays within groups (0.1s increments) create a cascade effect. Once revealed, elements stay put.
3. **Feedback** — buttons scale and shift shadow on hover. Cards lift on hover. The nav gains a frosted backdrop on scroll.

All motion is CSS-only (no animation libraries). All motion respects `prefers-reduced-motion` — when enabled, everything appears instantly with no transitions.

## Accessibility Standards

This page represents an accessibility auditing tool. It must practice what the product preaches:

- Every text element exceeds WCAG AA contrast ratios (verified via Lighthouse — 100 score on both desktop and mobile).
- Semantic HTML throughout (`<nav>`, `<main>`, `<section aria-labelledby>`, `<footer>`).
- Skip-to-content link as the first focusable element.
- Visible focus indicators (gold outline, 3px offset) on all interactive elements.
- Minimum 44x44px touch targets on all buttons and links.
- Proper heading hierarchy: single `<h1>`, `<h2>` per section, `<h3>` within.
- All decorative elements marked `aria-hidden="true"`.

## Section Flow

The page follows a classic SaaS narrative arc:

1. **Hero** — emotional hook + immediate product identity (headline, CTA, CLI teaser)
2. **Credibility bar** — quick proof of capability (not vanity metrics — real product attributes)
3. **Features** — what the product does, grounded in the four audit dimensions
4. **How it works** — demystify the workflow in three concrete steps
5. **Benefits** — why it matters, framed as outcomes not features
6. **CTA** — close with open-source positioning and clear next action
7. **Footer** — navigation, legal, brand signature (gold gradient border)

## What to Avoid

- **Generic SaaS aesthetics.** No purple gradients on white backgrounds. No Inter or system fonts for headlines. No stock illustrations.
- **Overused patterns.** No floating browser mockups, no "trusted by logos" with placeholder brands, no animated counters.
- **Competing animations.** The gradient mesh and scroll reveals are enough. Don't add particle effects, parallax scrolling, or complex hover animations that distract from content.
- **Light theme.** The dark palette is the identity. A light variant would dilute the atmospheric quality that makes this page distinctive.

## Relationship to Product UI

The landing page and product reports share:
- Solarized status colors (blue/yellow/green/red for the four suites)
- The gold accent family (reports use it for highlights too)
- The concept of themed dark surfaces with subtle borders

They intentionally differ on:
- Typography (reports use Inter/Work Sans; landing uses Instrument Serif/Plus Jakarta Sans)
- Background depth (reports use Solarized cream/navy; landing uses deeper navy)
- Layout density (reports are data-dense; landing is spacious)

This creates a sense of family without making the marketing page look like a dashboard.
