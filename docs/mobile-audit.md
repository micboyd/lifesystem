# Mobile audit — overnight 2026-11-20

## Summary (COMPLETE 2026-11-21)
Every screen, tab, sub-tab and shared overlay was checked at 375px (and 320px for all routes). Main changes: phones get swipeable section tabs instead of a tall stacked list; charts draw at their real width (`useBoxWidth`); 35 breakpoint-only grids got a `grid-cols-1` base (fixes 320px overflow); compact day-nav date pickers; dropdown/time/date popovers stay on screen; tap targets in TimePicker/DatePicker/Toast are 40px on phones; tables, toolbars and drawer footers fit; the Planner week strip is visible again. Nothing committed.
- `tsc --noEmit`: clean.
- `npm test`: 1041 pass, 2 fail in `src/lib/yourDay.test.ts` (`estimateWorkoutMinutes` reads `workout.warmUp.length` on a fixture with no `warmUp`). These files weren't touched by the audit and have no uncommitted changes, so the failures are older than it. Left for you to look at.

Goal: every screen, tab, sub-tab, drawer and popover looks and works perfectly at phone width (375px, also 320px and 390–430px).
Method: open each view in the browser pane at 375×812 against the dev server on :5173, measure horizontal overflow with JS, screenshot, fix, re-check.
Last updated: 2026-11-21 07:50 (status: COMPLETE)

## Rules for any session continuing this
- Never start a dev server. Use the one on http://localhost:5173 (preview_start {url}).
- If the pane is on /login, do the code-only audit (grep patterns below); never type a password.
- Tick items here as you go and bump "Last updated" — this file is how a resumed session knows where to pick up.
- Don't commit. Leave changes in the working tree for the user to review.
- Overflow check snippet (run in page):
  `[...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1&&r.width>0}).slice(0,15).map(e=>e.tagName+'.'+String(e.className).slice(0,80))`

## Checklist
### Top level
- [x] Login
- [x] Home (Your day, glance row, widgets)
- [x] App nav / sidebar / mobile menu
- [x] Calendar — Year, Month, day drawer, birthdays drawer
- [x] Goals — Active, Done, goal + habit drawers
- [x] Timeline
- [x] Timebox (day strip, blocks, drawers, import)
- [x] Cleaning (wizard, schedule)
- [x] Consistency (score, rows, drawers)
- [x] Walking + Walk planner (/walking/:id, /walking/library/:id)
- [x] Notes
- [x] Weather
- [x] Birthdays, Days since, Days until
- [x] Perfect day
- [x] Profile
- [x] Not found
### Fitness
- [x] Planner (week, session drawer, More menu, logger)
- [x] Strength — Workouts Library, Exercises, Workouts
- [x] Conditioning — Session Library, Sessions
- [x] Plans (library + detail: Overview, Week, Sessions, Schedule)
- [x] Stats — Progression, Consistency, Records, Conditioning, Garmin
- [x] Body (weigh-ins, photos, On plan? panel)
### Nutrition
- [x] Planner
- [x] Thinking ahead (/nutrition/thinking-ahead)
- [x] Library
- [x] Plans
- [x] Stats
### Finances
- [x] Monthly (/finances) — added 2026-11-21 finance pass
- [x] Monthly
- [x] Statement
- [x] Budgets
- [x] Logs (daily log)
- [x] Forecast (target planner, PlanDrawer)
- [x] Spaces
- [x] Breakdown (/finances/breakdown/:rowId)
### Shared parts
- [x] Drawer, Modal, BottomSheet, DropdownMenu, DatePicker, TimePicker, Toast

## Findings and fixes
(newest at the bottom)
- Walking: day-part rows used a bare `grid` (auto column) so long titles pushed the row 52px off screen → `grid-cols-1` + `minmax(0,1fr)`. Blok ModuleBar actions slot capped with `min-w-0 max-w-full`.
- Walking: FigureStrip "13,979 of 10,000" broke mid-unit → figure is a wrapping baseline flex, unit nowrap. "Add a afternoon/evening walk" → "an".
- Day nav (Home/Timebox/Walking): date was "20 Nov…" with a useless × → phones get `compact` DatePicker (no icon/chevron/clear), label "Fri 20 Nov".
- Home: "Time to sleep" subtitle wraps instead of truncating; 4 weather facts lay out 2×2 instead of 3+1.
- Calendar Year: month panels full-bleed on phones, Part column 104→78px (~10 days visible instead of 7). Month view: chips drop icons + tighter cell padding on phones, so titles read ("Funeral" not "F.").
- Goals: "Best streak" wrapped and misaligned the stat row → label "Streak", sub "best running".
- DropdownMenu (shared): flips alignment when the requested side would overflow, instead of sliding off its trigger.
- Timeline: week figures 13px on phones so ranges don't touch.
- Timebox: meeting sub-rows stack time over title on phones (titles were "Daily Sta…").
- Cleaning: sticky footer was `bottom-20` (stale bottom-nav offset) floating mid-screen → `bottom-0` + safe area. Picked room tiles drop −/+ to their own line; names wrap. Job names are a growing textarea (wrap, Enter blurs). Select (shared) label now truncates on one line.
- Days Since / Days Until: header crammed arrow+title+blurb+button in one row (blurb one word per line) → title block wraps (`basis-60`), button drops below; back arrow 44px.
- Fitness/Nutrition/Money section nav: on phones (<640px) the stacked list (≈200px) is now a swipeable tab row; tablets keep the stacked list. Active tab scrolls into view (shared `revealActive` in Tabs, also used by Tabs and ModuleBar).
- Planner week strip (Fitness + Nutrition): 6 of 7 days were invisible (white-on-white, dark-hero styling outside a HeroShell) → hero tone defaults to soft.
- Body weight chart + MetricChart: drawn on a fixed 720×200 viewBox, so on a phone the chart was ~93px tall in a 192px box with 5px labels → draw at measured width (`useBoxWidth`).
- Plan drawer stat "On planner" truncated → "Planned". Garmin trend figures 15px on phones.
- LibraryToolbar: "28 meals" truncated to "2" → wraps instead.
- Meal drawer footer: Delete is icon-only on phones so Delete/Duplicate/Edit fit one line.
- Nutrition Plans: Export/Import icon-only on phones (row ran off screen).
- Statement "Doh" rows: phones drop the icon and the repeated amount (title already has it).
- Forecast: year table and month-by-month drawer table had fixed min widths wider than a phone (Balance column cut off) → fit on phones; drawer close 44px.
- Target planner drawer: Start/Reach-by dates stack below 420px (were "1 Nove…").
- Spaces: each space is one compact row on phones (icon · name · balance).
- 35 breakpoint-only grids got a `grid-cols-1` base so content can't push them wider than the screen (this was the Profile 320px overflow).
- Pagination: slimmer slots under 360px so seven fit.
- 320px sweep: all top-level routes pass the overflow check.
- LibraryToolbar actions wrap at 320px (Nutrition Library was 13px too wide). 320px sweep of every Fitness/Nutrition tab + sub-tab: all pass.
- Login (code-only, session is signed in): card was px-6 + p-8, leaving ~208px for fields at 320px → px-4/p-6 on phones; subtitle 16px on phones.
- Shared overlays: Modal max-h 85vh → 85dvh (iOS toolbar); Toast close 28→40px on phones and toast stack clears the home indicator; TimePicker spinner arrows 28→40px, clear × 20→32px, quick times + Now/Done taller on phones; DatePicker month arrows 32→40px on phones. TimePicker/DatePicker popovers already clamp to the viewport (checked End-time picker: 115–355px of 375). Drawer is full-screen on phones; BottomSheet already uses dvh + safe-area footer. iOS focus zoom already guarded in index.css.
- Statement re-check after Doh change: page scrollWidth = 375; only the intentional swipe rows (section tabs, category chips) extend past the edge.
- Finance pass 2026-11-21 (all finance screens + drawers at 375 and 320; checked overflow, tap targets <32px, text <11px, cut-off text):
  - Monthly: paid/received ticks were 24px → 40px tap area, same 24px circle; row names wrap to 2 lines instead of truncating; amount column 96px under 360px; month title 17px under 360px.
  - Statement: "Show more / Show all / See N payments" links 20px → 40px tall. Transactions review mode: phones stack amount over the Good/Bad toggle and let names wrap (were "Marks & Spen…"); event-pill checkbox has a 40px invisible tap area.
  - Budgets card footer (Transactions, Sync, More), Archived, Out of sync → 40px on phones. Recent spending "Statement" link 18px → 40px.
  - Forecast: plan delete button 28px → 40px on phones + aria-label.
  - Clean already: Daily log, Spaces, Breakdown, Monthly row drawer, Statement payments drawer, Budgets transactions drawer.


## Fitness in-gym pass 2026-11-22

Focus: the screens used on a phone mid-workout — planner day, item drawer, strength logger, conditioning logger. Planning/builder screens left as desktop-first (they already pass the overflow sweep).

Checked at 375px with real data:
- **Strength logger** — already good: 48px kg/reps inputs with `decimal`/`numeric` keypads, 16px text (no iOS zoom), big set ticks, Back/Next pinned. No changes beyond wake lock.
- **Planner item drawer / overview** — clean, nothing to change.
- **Conditioning logger** — the weak spot. The rep you're on scrolled off-screen, so mid-run you had to hunt for the row; the only fixed control was Wrap up.

Changes:
- Conditioning logger: a **Now bar** pinned above the footer — phase + "Rep 1 of 2" + part name, the rep's numbers ("Walk · 3 min · 5.0 km/h"), its recovery, and a 56px **Done** button that ticks the rep (or completes a part with no reps). Wrap up shrinks to a small outline button until everything is done, then goes back to primary.
- **Screen stays awake** while either logger is open (`components/useWakeLock.ts`, re-acquired when the page comes back; no-op where unsupported).
- Planner on phones: the selected day now comes **straight under the week strip**; the week totals drop below it (`order-last sm:order-none`). Tablet/desktop order unchanged.
- Tap targets: round counter +1 / undo 36 → 44px; part Undo 28 → 40px; part Done 44 → 48px.
- Minutes: session lengths were showing "50.85 min" and phase spans "5–47.9 min". Lengths are now whole minutes (`minutesLabel`), spans use clock marks when they aren't whole ("5:00–47:51 min").

Not browser-tested: pressing Done in the Now bar (it would have written a real log). The handler is the same one the existing rep rows and part Done buttons use.
