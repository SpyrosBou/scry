# Scry App

SvelteKit shell for the in-app Scry experience. This is the source app; the older `site/app/` files are static mockups used for design reference.

## Commands

```bash
npm run dev
npm run check
npm run build
```

From the repository root, use:

```bash
npm run app:dev
npm run app:check
npm run app:build
```

## Notes

- Supabase types live in `src/lib/db/types.ts` and should match the generated database type shape expected by `@supabase/supabase-js`.
- Routes that need authenticated data should use server load functions and return typed `data` to page components.
- Keep unfinished UI states honest: placeholder pages are fine, but missing run data should not render as a passing audit.
