# Finance UX Review & Improvement Plan

_Reviewed: June 2026. Covers every surface that touches money in the app._

---

## 1. How finances currently work

### 1.1 Data model (server)

| Model             | Purpose                                                                                          | Key fields                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinanceGroup`    | Section on the monthly sheet                                                                     | `type: income\|expense\|savings`, lifecycle (`startMonth`/`endMonth`/`skipMonths`), plus `currentBalance` + `annualInterestRate` (savings only) |
| `FinanceRow`      | Line item in a group                                                                             | `recurringAmount`, `recurring` flag, `month` (one-time rows), lifecycle, `budgeted` flag, `budgetType: 'daily'`                                 |
| `FinanceEntry`    | Per-row, per-month amount override                                                               | `row`, `month`, `amount`                                                                                                                        |
| `BudgetSpend`     | Actual spend logged on a date against a daily-budget row                                         | `row`, `date`, `amount`                                                                                                                         |
| `BudgetExclusion` | A date excluded from daily budgeting (global, not per-row)                                       | `date`                                                                                                                                          |
| `FinanceSubItem`  | Itemised breakdown of a row (per month for recurring rows)                                       | `row`, `month?`, `name`, `amount`                                                                                                               |
| `Event.budgetRow` | Calendar event linked to a finance row; budget resolved server-side from the event's start month | —                                                                                                                                               |

The **effective amount** of a row in a month is `entry.amount ?? row.recurringAmount ?? 0`. Visibility is governed by the lifecycle window (`lib/finance.ts: visibleInMonth`), which is consistently applied — this part of the system is solid.

### 1.2 Surfaces

1. **Monthly** (`/finances`) — spreadsheet of groups/rows with month navigation. The hub: hover-revealed icons per row toggle _budgeted_ (bookmark), open _breakdown_ (pie), edit, delete. Dark summary card (income / expenses / savings / net).
2. **Budgets** (`/finances/budgets`) — card per bookmarked row; "daily tracking" toggle; today's allowance + spend logger. **Locked to the current month.**
3. **Daily Log** (`/finances/daily-log`) — month calendar of daily spends aggregated across _all_ daily rows; day modal logs per-row spends and can exclude a day (budget redistributes across remaining days).
4. **Forecast** (`/finances/forecast`) — "savings to date" (planned contributions over a range) + compound-interest projection per savings group; balance/rate settings live here.
5. **Breakdown** (`/finances/breakdown/:rowId`) — sub-item itemisation with an "accounted for" progress bar. Lives _outside_ the finance tab shell.
6. **Dashboard** (`/`) — `BudgetWidget` (per-daily-row allowance + quick log) and `InsightsStrip` ("Daily allowance left").
7. **Calendar events** — budget either manual or linked to a finance row ("From finances").

### 1.3 The setup funnel

To get the headline feature (daily spend tracking) working, a new user must:

1. Create a group on **Monthly** → 2. add a row with an amount → 3. _hover_ the row to discover the bookmark icon and click it → 4. switch to **Budgets** → 5. click "Enable daily tracking".

Five steps across two screens, with the critical step (3) behind a hover-only affordance.

---

## 2. Findings

### A. Correctness / consistency (these undermine trust in the numbers)

**A1. The daily-budget maths exists in three diverging copies.**

- `lib/budget.ts: computeBudgetDay` — per-row, **ignores exclusions** (used by `BudgetWidget`, `InsightsStrip`).
- `Budgets.tsx: BudgetCard` — re-implements the same per-row maths inline (lines 108–120), also ignoring exclusions, despite the comment in `lib/budget.ts` calling itself the "single source of truth".
- `BudgetCalendar.tsx: buildDayData` — aggregates **all rows into one pot** and **does** honour exclusions (`monthlyTotal / activeDays`).

Consequence: exclude a holiday in Daily Log and the daily rate there rises, but the Budgets tab, the dashboard widget, and the insights card keep the old rate — three screens show different "today's allowance" for the same data. The aggregation also differs (per-row carry vs pooled carry), so totals disagree even with no exclusions.

**A2. Zero error handling on finance mutations.** No finance page or widget has a `catch`; there is no toast system. A failed save (network blip, expired session) silently does nothing or leaves stale optimistic state — bad anywhere, corrosive in a money app.

**A3. Inconsistent currency display.** The Monthly tab shows bare numbers (`1,234.00`); every other surface shows `£`. `fmt()` is copy-pasted into 7+ files, with `fmtCompact` only in Forecast. Locale and currency are hard-coded.

**A4. The month-entry column has ambiguous semantics.** On Monthly, the per-month cell is "override of the plan", but because actuals only exist for daily-tracked rows, users will inevitably also use it to record "what I actually paid" — destroying the planned figure and making the recurring column meaningless for that month. The UI never says which it is.

### B. Discoverability / mobile

**B1. Hover-only row actions** (`opacity-0 group-hover:opacity-100` in Monthly and Breakdown) are invisible on touch devices and undiscoverable on desktop. The whole budget feature hangs off a hover-only bookmark.

**B2. Empty states instruct users to hover.** Budgets: "hover a row and click the bookmark icon". Daily Log: "Enable \`Daily spend\` on a card" — which references a label that doesn't exist (the button says "Enable daily tracking").

**B3. The Monthly table has no horizontal-overflow handling** — four fixed columns at `table-fixed` get very cramped on phones.

**B4. Icon-only buttons mostly lack `aria-label`s**; `AmountCell` is a bare unnamed button.

### C. Navigation / information architecture

**C1. Month context doesn't travel.** Monthly reads `?month=` but never writes it back (refresh loses your place); switching to Budgets/Daily Log/Forecast silently resets to the current month; Budgets has **no month navigation at all**, so past performance can't be reviewed; Daily Log keeps its own separate month state.

**C2. Breakdown lives outside the tab shell** — entering it loses the tabs, and "Back to Finances" is the only way out. It also fetches _all_ groups, rows and entries just to render one row.

**C3. Tab naming doesn't match content.** "Budgets" is really "spend tracking setup + today", "Daily Log" is the history of the same feature (an artificial split — two tabs for one concept), "Forecast" is savings-only but also contains the _settings_ for savings groups, far from where those groups are managed.

**C4. The route order encourages the wrong workflow.** Budgets/Daily Log/dashboard are where daily life happens, but the section opens on the planning sheet.

### D. Conceptual model

**D1. "Budget" means four different things**: the bookmark flag, the daily-tracking mode, an event's budget, and a logged spend. There's no vocabulary distinguishing _plan_, _envelope_, and _actual_.

**D2. Savings groups are magical.** Creating one silently auto-creates an undeletable "Savings" row; the add-row affordance is hidden for them; their balance/interest settings live on a different tab. They behave like _accounts_ but are presented as groups.

**D3. The event link is one-way and invisible from finances.** Events pull a row's monthly amount, but the Monthly sheet gives no indication a row is feeding an event, and nothing tracks spend against the event.

**D4. No history or trends anywhere.** No month-over-month net, no income/expense trend, no per-row history. The data (entries per month) already supports all of this.

### E. Performance / robustness (minor at current scale)

- Every surface fetches `listGroups()` + `listRows()` (all rows ever) and filters client-side; there's no shared cache, so visiting Home → Finances → Budgets refetches the same data 3×.
- `LiveSavingsSection` issues one `listEntries` request _per month_ in the range (24 months = 24 requests).
- `Finances.handleDeleteGroup` filters entries with `rows` captured in a stale closure — harmless today but fragile.

---

## 3. Improvement plan

### Phase 1 — Make the numbers agree (highest priority, small effort)

1. **One budget engine.** Extend `computeBudgetDay` to accept exclusions and an aggregation mode; delete the inline copy in `Budgets.tsx` and the bespoke `buildDayData` maths; have all five consumers (Budgets, Daily Log, BudgetWidget, InsightsStrip, day modal) call it. Decide deliberately whether carry is pooled or per-row and apply it everywhere.
2. **Shared money formatting.** `lib/money.ts` with `formatMoney` / `formatMoneyCompact`; use it everywhere, including Monthly (with `£`).
3. **Error handling.** Add a lightweight toast (StyleGuide first — check for an existing component) and wrap finance mutations: on failure, revert state + toast. One shared helper, not per-page boilerplate.
4. **Fix empty-state copy** to match real labels and non-hover flows.

### Phase 2 — Discoverability & navigation (medium effort)

5. **Kill hover-only actions.** Always show a compact action affordance (kebab menu per row, or icons at reduced opacity that strengthen on hover); ensure ≥40px touch targets; add `aria-label`s.
6. **Make month a section-level concept.** Lift month state into `FinanceLayout` (URL-synced `?month=`), shared by Monthly, Budgets, and Daily Log. Budgets gets the month navigator for free → past months become reviewable (read-only spend history per card).
7. **Bring Breakdown into the shell** (render under `/finances` with tabs visible, or as a drawer/modal from the row — the StyleGuide Drawer is a good fit) and fetch only the one row it needs.
8. **Merge "Budgets" and "Daily Log" into one "Spending" tab** — cards on top (today, logging) with the calendar below or behind a Today/Month toggle. One concept, one tab. Tabs become: **Monthly · Spending · Savings** (Forecast renamed; it's savings-only anyway).

### Phase 3 — Clarify the model (larger, do after 1–2)

9. **One-stop budget setup.** In the row editor (and AddRowForm), an explicit "Track spending" option with off / monthly / daily — replacing bookmark-then-toggle. Keep the bookmark as a shortcut but no longer the only path.
10. **Separate plan from actual.** Label the month column "Planned" explicitly; for tracked rows, show "Actual" (sum of spends) alongside planned on the Monthly sheet, with variance colouring. This gives non-daily users a home for "what I actually spent" without overwriting the plan.
11. **Treat savings groups as accounts.** Surface balance + interest in the group header/editor on Monthly (or a dedicated Savings tab section); explain the auto-row or remove it in favour of contributions directly on the group.
12. **Surface event links.** Small calendar icon on linked rows on Monthly, click-through to the event; show event budgets in the month they fall.

### Phase 4 — Insight (new value)

13. **Trends on Monthly**: 12-month sparkline of income / expenses / net above the summary card (data already exists via entries; add a server endpoint that returns monthly totals to avoid 12 client requests).
14. **Row history** in Breakdown: amount-by-month mini-chart.
15. **Spending review**: month-end summary on the Spending tab — total vs target, best/worst weeks, excluded days.

### Suggested sequencing

| Phase | Effort     | Risk                    | Payoff                             |
| ----- | ---------- | ----------------------- | ---------------------------------- |
| 1     | ~1–2 days  | Low                     | Numbers agree; failures visible    |
| 2     | ~2–3 days  | Low–medium              | Mobile usable; coherent navigation |
| 3     | ~3–5 days  | Medium (data semantics) | Clear mental model                 |
| 4     | open-ended | Low                     | Delight / retention                |

Phases 1 and 2 are safe to start immediately; Phase 3 items 9–10 deserve a short design pass first because they touch the meaning of stored data.
