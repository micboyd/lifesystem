---
name: design-language
description: The app-wide visual design language Michael wants for lifesystem, modeled on his munro-locator app
metadata:
  type: project
---

Michael wants the `lifesystem` client styled to match his Angular `munro-locator` app (reference: `C:\Users\MichaelBoyd\repos\other\munro-locator`, esp. `src/styles.css` and shared components). This replaces the original brutalist look (pure black, sharp corners, `font-black uppercase`).

Design tokens / patterns:
- **Palette:** neutral-first. White / `neutral-50` backgrounds; primary action = `neutral-950` (near-black, NOT pure black); muted text `neutral-400`; soft borders `neutral-100/200`. Accents (sparingly): herb green `#708C69` (success), marigold `#F4A258`, red for errors.
- **Shape:** rounded everything — `rounded-full` for buttons/badges/nav-links/pills, `rounded-xl`–`rounded-2xl` for inputs/cards/panels.
- **Type:** DM Sans (400–700) via `@fontsource/dm-sans`. Headings `font-bold tracking-tight text-neutral-950`, responsive (`text-3xl sm:text-4xl md:text-5xl`). Tiny labels `text-xs font-semibold uppercase tracking-wide text-neutral-400`.
- **Buttons:** `rounded-full bg-neutral-950 text-white hover:bg-neutral-800`, `px-6 py-3 text-sm font-semibold`.
- **Inputs:** filled `bg-neutral-50` → white on focus, `rounded-xl border`, `focus:ring-2 focus:ring-neutral-200`; error = `border-red-400` + `text-red-500` hint.
- **Cards:** `rounded-2xl border border-neutral-100`, hover lift (`hover:shadow-md hover:-translate-y-0.5`), footer split by `border-t`.
- **Feel:** subtle shadows, `transition-all duration-150/200/300`, generous whitespace.

Icons: Font Awesome to be added later — Michael has a FA Pro account. Not wired up yet (as of 2026-06-04). See [[styleguide-page]].
