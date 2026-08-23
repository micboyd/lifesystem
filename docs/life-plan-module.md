# Life Plan — Module Design

_Drafted August 2026, built August 2026. This doc describes what shipped._

---

## 1. Why the module exists

Every existing surface works at a short horizon:

| Surface                            | Horizon                          |
| ---------------------------------- | -------------------------------- |
| Home (`/`)                         | Today / week ahead               |
| Calendar (`/calendar`)             | Month, with day drill-down       |
| Fitness & meal planners            | The week                         |
| Month flags (`MonthNote`)          | Month ranges — the only long-horizon record today |
| Goals (`/goals`)                   | A `targetDate`, with no surrounding context |

Two things are missing as a result:

1. **Quarters and years.** There is nowhere to write down what the next six months
   are _for_, or to see a year at a glance.
2. **Domains side by side.** Training, nutrition, money and study each live in
   their own module, so the app can't answer the question that actually decides
   whether a plan survives contact: _"In October I'm in a 10K build, cutting,
   saving for a car, and away for a week — is that realistic?"_

Life Plan is the long-horizon layer that answers it. It is explicitly **not** a
second dashboard: Home owns "what do I do now", Life Plan owns "what is this
stretch of time for, and is it overcommitted".

## 2. Horizons

Nested, so the same module scales from "this quarter" to life-scale:

```
Vision      multi-year themes, undated or loosely dated
  └─ Year   a LifePlan document, e.g. "2027"
      └─ Season   the working unit: 6–12 weeks, dated, per-pillar intent
          └─ Week   the existing fitness / meal planners — untouched
```

**The season is the unit that matters.** Everything above it is framing;
everything below it already exists.

A season looks like:

> **Sept–Nov 2026 · "Cut & 10K"**
> Training — 10K build (Post-10K Base plan)
> Nutrition — −500 kcal/day, 180 g protein
> Money — £400/mo to the house fund
> Study — nothing, deliberately quiet
> Life — Portugal 12–19 Oct

## 3. Pillars

The lanes of the timeline, matching the app's real domains:

| Pillar    | Reads from                                    |
| --------- | --------------------------------------------- |
| Training  | `TrainingPlan` (`planStart`/`planEnd`, `phases[]`) |
| Nutrition | `NutritionPhase` (new — see §5)               |
| Money     | `SavingsTarget` (`startMonth`/`targetMonth`)  |
| Study     | `Course`                                      |
| Life      | `MonthNote` (month flags), notable events     |

## 4. What the module owns vs. reads

**Decision: author seasons, read everything else.** One thin new model plus one
small one. No duplicated state, no two-way sync with five modules.

Seasons are authored here. Training plans, savings targets, goals, courses and
month flags stay owned and edited by their own modules; Life Plan links to them
and renders them read-only, deep-linking out for edits.

### `LifePlan` (new)

Follows `TrainingPlan`'s embedded-array shape — the plan document carries its
own chapters rather than scattering them across a second collection.

```
LifePlan
  user, name              e.g. "2027"
  start, end              YYYY-MM (whole months; a plan is never part-month)
  vision?                 free text — the multi-year theme this year serves
  pillars[]               which lanes this plan tracks, ordered
  seasons[]               embedded, below
  order                   library position
```

```
Season (embedded)
  name                    "Cut & 10K"
  startMonth, endMonth    YYYY-MM, contiguous
  focus?                  one line — the season in a sentence
  color                   reuse CALENDAR_COLORS for lane/flag consistency
  intent[]                { pillar, text }  — the stated intent per pillar
  links                   { trainingPlans[], nutritionPhases[], savingsTargets[],
                            goals[], courses[], monthNotes[] }
  review?                 see §6
```

Seasons within a plan must not overlap — the plan is a partition of its own
window, which is what makes the "what am I in right now" lookup unambiguous.

### `NutritionPhase` (new, small)

The one genuine data hole. There is no meal-plan _document_ today, only
day-level `MealPlanEntry`, so the nutrition lane has nothing to draw and
nutrition adherence has no target to be scored against.

```
NutritionPhase
  user, name              "Autumn cut"
  startDate, endDate      YYYY-MM-DD (day-precise; a cut rarely starts on the 1st)
  kind                    'cut' | 'maintain' | 'gain'
  targets                 MacroGoals — reuse the existing type
  weeklyRate?             kg/week, signed — matches BodyGoals.weeklyRate
  notes?
```

This slots straight into the existing fat-loss work: the weigh-in trend and meal
adherence views gain a dated target to judge against instead of a single global
setting.

## 5. Surfaces

Route `/life-plan`, top-level sidebar item (`fa-compass` or `fa-map`), tabbed
with the existing `Tabs` component.

### 5.1 Timeline — the default tab

The "bring it all together" screen. Months across the top, pillars as lanes,
seasons as a tinted band spanning every lane so you read a column as one chapter.

- **Bars** for dated windows: training plans (with `phases[]` as sub-bars),
  nutrition phases, savings targets, courses, month flags.
- **Diamonds** for point-in-time markers: goal `targetDate`s, race days,
  savings target months.
- **Quarter-month resolution.** Bars and diamonds are placed to the nearest
  quarter of a month, so a phase ending on 15 November stops halfway through the
  November column instead of filling it. Records that only store a month
  (savings targets, month flags) still cover their whole column.
- Horizontally scrollable, one lane per pillar, ~12 months in view on desktop;
  on mobile it collapses to a vertical month list (the nav-cluster overflow
  trap applies here — the lane header cluster must shrink).
- Clicking any bar opens a `Drawer` with the read-only detail plus a link to the
  owning module.

### 5.2 Seasons

The authoring surface: list of seasons in the active plan, each expandable to
edit dates, focus, per-pillar intent, and what's linked in. Creating a season
is the one write path that matters, so it should be quick — name, month range,
and a line of intent per pillar.

### 5.3 Pressure check

Scale up the idea already in `lib/overload.ts` from a day-slot to a season.
That module weighs two hard sessions in one slot; the same shape of question at
month grain is "how many demanding commitments are live at once".

Per month, count what's active and weight it — a training plan in a build phase,
an aggressive cut, a savings target above the usual contribution, a course with
an exam, a house move. Flag the months where the count piles up, and say
_which_ commitments collide. This is the module's sharpest output: it catches
the overcommitment while it's still a plan and not yet a failure.

Keep the rule in `lib/lifeLoad.ts` alongside `lib/overload.ts`, pure and unit
tested — same pattern, same reasoning, coarser grain.

### 5.4 Review

What turns the module into a loop rather than a wish list. When a season ends,
score it from data already collected:

| Pillar    | Scored from                                             |
| --------- | ------------------------------------------------------- |
| Training  | `WorkoutLog` / `ConditioningLog` completion vs. the plan's schedule |
| Nutrition | Meal adherence + `WeightLog` trend vs. the phase's `weeklyRate` |
| Money     | Actual contributions vs. `SavingsTarget` plan           |
| Study     | `Course` progress                                       |
| Habits    | `HabitLog` completion rate over the window              |

Plus a short written retro stored on the season (`review`). The next season's
intent is then written with the last one's result on screen.

## 6. What shipped

All five steps of the planned build order are in place.

**Server**

| File | Purpose |
| ---- | ------- |
| `models/LifePlan.ts` | Plan with embedded `seasons[]`, each carrying intent + links |
| `models/NutritionPhase.ts` | Dated eating phase with macro targets |
| `controllers/lifePlanController.ts` | Plan CRUD + season sub-resource + review |
| `controllers/nutritionPhaseController.ts` | Phase CRUD |
| `routes/lifePlanRoutes.ts` | `/api/life-plans` |
| `routes/nutritionPhaseRoutes.ts` | `/api/nutrition-phases` |

Two server-side invariants worth knowing about:

- **Seasons within a plan cannot overlap**, and must sit inside the plan window.
  The plan is a partition of its own months, which is what makes "which season is
  this month in" have exactly one answer.
- **Narrowing a plan's window is refused** when it would strand a season outside
  it, rather than silently dropping or clamping the season.

**Client — pure logic (79 unit tests)**

| File | Purpose |
| ---- | ------- |
| `lib/lifeTimeline.ts` | Flattens six record types onto one month grid; row packing |
| `lib/lifeLoad.ts` | Month pressure scoring |
| `lib/seasonReview.ts` | Season scorecard from existing logs |

**Client — UI**

`pages/LifePlan.tsx` at `/life-plan`, with `components/lifeplan/`:
`LifePlanTimeline` (desktop grid), `TimelineMonthList` (small screens),
`LaneItemDrawer`, `SeasonsTab`, `SeasonForm`, `NutritionPhasesTab`,
`PressureCheck`, `SeasonReviewTab`, `PlanForm`, `LoadPill`.

### Decisions made during the build

- **Training-plan phases are not sub-bars.** `PlanPhase.dates` is free text in the
  import format ("Sep 1 – Oct 12"), so phases can't be placed on a month grid
  reliably. They're listed as written in the drawer instead.
- **Nutrition phases are authored in Life Plan, not Nutrition.** A dated phase is a
  planning artifact; Nutrition owns what was eaten on a day, and the phase is the
  target that day gets judged against.
- **The timeline shows everything live in the window, not only what a season
  links.** Seeing an unclaimed commitment is the point. The Review is the opposite
  — it scores only linked records, because an unlinked target isn't that season's
  business.
- **Quarters, not days, are the timeline's resolution.** Day-accurate bars ask the
  eye to measure a few pixels on an 88px column; whole-month bars overstate every
  commitment by up to a month. Quarters read as "starts mid-month" at a glance and
  keep row packing honest — two things can share November without overlapping.
- **Small screens get a vertical month list, not a squeezed grid.** On a phone the
  useful question is the column ("what is this month carrying"), so that one is
  answered properly rather than showing a worse version of both axes.
- **Unscorable review rows return null, not zero.** "No meals were planned" and "no
  meals were eaten" are different facts; showing the first as 0% would read as a
  failure that never happened.
- **An in-flight season is scored on elapsed days only** — judging four weeks of
  work against a twelve-week plan would read as failure every time.

## 7. Still open

- **Do month flags survive as their own feature?** Seasons and flags overlap
  conceptually (both are labelled month ranges). Recommendation: keep them
  distinct — a season is a chapter with intent across pillars, a flag is a
  single label on the calendar. Life Plan links flags into seasons rather than
  replacing them. Worth revisiting if the two feel redundant in use.
- **One active plan or many?** Assumed: one plan per year, multiple plans in a
  library (like `PlanLibrary`), with the one covering today treated as active.
- **Does Home surface the season?** A one-line "you're in: Cut & 10K, month 2 of
  3" on the dashboard would connect the horizons cheaply. Not built — the Life
  Plan page carries that line at the top of its own header for now.
- **Phase targets aren't wired into the weigh-in trend or meal adherence yet.**
  The model and the scorecard read them, but the existing Nutrition views still
  judge against the single global `BodyGoals`/`MacroGoals` setting. Pointing them
  at the phase covering the day is the natural follow-up.
- **Habit count is a snapshot.** The review's habit denominator uses how many
  habits exist now, not how many existed during the season.
