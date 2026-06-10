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

Icons: Font Awesome Pro is wired in via the kit script in `client/index.html` (`https://kit.fontawesome.com/a07e376782.js`). Use plain `<i className="fa-solid fa-..." />` elements (the kit auto-renders them). IMPORTANT: `client/index.html` sets `window.FontAwesomeConfig = { autoReplaceSvg: 'nest' }` BEFORE the kit loads. This is required — the kit's default mode _replaces_ each `<i>` with an `<svg>`, which breaks React reconciliation (removeChild error → white screen) whenever an icon is conditionally rendered/swapped. `nest` mode nests the svg inside the `<i>` so React keeps owning the node. Do not remove it. Components accept FA class strings as props: `Button` (`icon`, `iconPosition`), `Input` (`icon`, leading), `Alert` (`icon`, auto per-variant by default). `Checkbox` tick and `Navbar` brand mark use FA icons too. See [[styleguide-page]].
