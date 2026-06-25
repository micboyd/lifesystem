---
name: money-uses-default-font
description: Money values use the default sans font (no monospace), with tabular-nums for alignment.
metadata:
  type: feedback
---

Money/currency values across the app should render in the default app font (DM Sans) — NOT `font-mono`. Keep `tabular-nums` for digit alignment in tables/columns.

**Why:** The user wants monetary figures to look consistent with the rest of the system's typography; the monospace look was undesired.

**How to apply:** When adding any money display (via [[money-formatters-mask-when-hidden]] `formatMoney`/`formatAmount`/`formatMoneyCompact`), do not add `font-mono`. There is no central `<Money>` component — formatting happens inline at each call site, so this convention has to be applied by hand.
