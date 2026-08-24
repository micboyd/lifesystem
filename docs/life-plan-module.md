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
month grain is "how much is this month being asked to carry".

Flag the months that are asking for more than they have, and say _which_
commitments are doing it. This is the module's sharpest output: it catches the
overcommitment while it's still a plan and not yet a failure.

Keep the rule in `lib/lifeLoad.ts` alongside `lib/overload.ts`, pure and unit
tested — same pattern, same reasoning, coarser grain. **The measurement itself
was reworked after first use; §8 records what it is now and why.**

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

---

## 8. Measuring load — the rework

_August 2026. The first version shipped a single weighted score per month; this
replaced it._

### 8.1 What was wrong with a score

v1 gave every commitment a weight (training plan 2, cut 2, savings target 1,
deadline 1 …), summed them, and called a month overloaded at 6. Three problems,
all visible within a few minutes of real use:

1. **It added up things that don't compete.** A savings plan could push a month
   into "overloaded" alongside a training block. Saving £400 a month costs
   nothing physically — those two commitments compete for nothing, so summing
   them measured nothing.
2. **It counted presence, not intensity.** A savings target weighed 1 at £50/mo
   and at £900/mo. A cut weighed 2 at −200 kcal and at −800. A training plan
   weighed 2 at three sessions a week and at six. All three numbers were already
   in the database and none of them were read.
3. **It had no denominator.** "Six of what?" The threshold was a constant
   somebody chose, unconnected to this person's income, calendar or history.

### 8.2 Reserves, not pillars

Load is a **vector over reserves** — the thing actually being spent — and
overload is per-reserve. The reserves cut *across* the pillars, which is the
whole point:

| Reserve | Unit | Capacity from |
| ------- | ---- | ------------- |
| `time` | h/wk | Default (9h discretionary) |
| `body` | hard sessions/wk | **Measured** — `sustainedVolume` over your own logs; calibrated once history allows |
| `money` | £/mo | **Measured** — `freeCashByMonth` over the finance rows |
| `focus` | concurrent behaviour changes | Default (3) or calibrated |

| Commitment | time | body | money | focus |
| ---------- | ---- | ---- | ----- | ----- |
| Training plan | ●●● | ●●● | – | ● |
| Cut phase | – | ●●● | – | ●●● |
| Gain phase | ● | – | – | ●● |
| Savings target | – | – | ●●● | – |
| Course | ●●● | – | – | ●●● |
| Month flag | ●● | – | – | ● |
| Goal deadline | – | – | – | ●● |

Two consequences worth stating plainly, because they're the reason for the
rework:

- **A cut plus a build block is two commitments and overloads `body`.** v1 scored
  that 4 and said "Busy". It's the single most reliable way to fail a block.
- **Four savings targets can only ever overload `money`,** and they do it when
  they cost more than there is to spend — not when there happen to be four.

### 8.3 Intensity comes off the records

| Reserve | Read from |
| ------- | --------- |
| `time` (training) | `schedule[]` entries in the month ÷ the month's weeks, × per-role hours. Falls back to `weeklyTemplate` × coverage when the list endpoint omits `schedule`. |
| `time` (study) | `requiredHours − completedHours`, spread over the months to `targetDate` — so the rate visibly rises as the deadline closes. |
| `body` (training) | Hard sessions/week, **unioned across plans** — see §8.10. Mobility and recovery count 0, exactly as in `overload.ts:isHardSession`. |
| `body` (nutrition) | Not a demand at all — a deficit lowers the ceiling instead. See §8.10. |
| `money` | `SavingsTarget.requiredMonthly`, exactly. |
| `focus` | Phase 1, plan 0.5, course 1, flag 0.5, deadline 1 (its month only). |

Everything is charged pro-rata for the fraction of the month it actually covers.

### 8.4 Measured vs assumed

Some inputs can't be read (a month flag labelled "Portugal" could be a house move
or a dry January), so those carry a flat prior. Every contributor records
`basis: 'measured' | 'assumed'` and every reserve reports `assumedShare`, so a
month reads as "four of five inputs measured" rather than asking to be trusted
whole. `money` has no honest prior at all, so its capacity is `null` until the
finance rows supply one, and a null capacity scores `null` — the same call
`measuredMaintenance` makes, for the same reason.

### 8.5 Calibration — the ceiling from your own history

`lib/lifeCalibration.ts`. The question isn't "is six sessions a lot", it's
**"the last time a month looked like this, what happened?"** — which the app can
answer, because it has the receipts.

Each past month carries a demand (scored by the same `computeMonthLoads`) and an
outcome: sessions logged against sessions planned, meals eaten against meals
planned, habit ticks landed against ticks available, pooled and weighted by how
much each signal was measuring. Every observed demand is then tried as a split
point, and the one where adherence most clearly falls away becomes that reserve's
capacity, with `basis: 'calibrated'`.

Guards, all of which earned their place:

- `MIN_MONTHS` (8) months of history before any fit is attempted.
- `MIN_BUCKET` (3) months either side of a split.
- `MIN_DROP` (0.1) — below ten points of adherence, the split is noise.
- **Medians, not means.** A three-month bucket's mean is dragged far enough by
  one catastrophic month to invent a ceiling out of two good months standing next
  to a bad one. This was caught by a test, not by inspection.
- `TIE_MARGIN` (0.05) — where two splits explain the history equally well, the
  **higher** ceiling wins. A ceiling set too low nags about months that went fine,
  and an alarm that cries wolf is worse than no alarm.

Fits nothing and keeps the priors when there isn't enough to go on, and says so.

### 8.6 Conflicts, kept apart from load

A conflict is a pair that can't both go well however much room there is — a
different claim from "this month is expensive", and not fixable by moving
something. Three rules, all **gated on intensity rather than presence**, because
cutting while training is ordinary and often the entire point of a season:

- `opposing-phases` — a cut and a gain overlapping.
- `deep-cut-in-heavy-block` — a cut at ≥2 body units (≈ −500 kcal/day) under ≥4
  hard sessions a week.
- `unfundable` — committed beyond free cash. Not heavy; it doesn't add up.

### 8.7 Relief — `findFreeSlot` at month grain

`lib/lifeRelief.ts` is the direct scale-up of `overload.ts:findFreeSlot`: a slot
is carrying two hard sessions, so look for somewhere nearby to put one of them.
Each candidate move **shifts the record and rescores the whole window**, rather
than subtracting the commitment's cost from the month — those two answers differ,
and the second is wrong, because a shifted commitment lands somewhere else and
where it lands is exactly what you need to know. Suggestions that only relocate
the pile-up are shown, marked "moves the problem". Nothing is ever written.

### 8.8 Surfaces

- **Reserve meter** (`ReserveMeter`) replaces the single pill everywhere. The
  track is the capacity, so a full bar means "all of it"; past full the bar keeps
  its width and grows a nub, since letting it stretch would rescale every bar
  beside it.
- **Load row** — one row on the timeline, sitting with the season band: a cell a
  month, naming the reserve under most strain. Quiet and steady months are drawn
  almost invisibly on purpose, so a row where only the difficult months carry a
  mark can be read across in one pass.

  This started as a four-strip capacity ribbon below the lanes — one per reserve,
  on the same grid, with a dashed capacity line. It was honest and unreadable: it
  asked you to decode a chart before learning anything, on a screen whose job is
  *what is happening, when*. The month only ever has one answer worth putting
  beside the lanes — which reserve is hot, and how hot — so the ribbon moved to
  the Pressure tab ("the window at a glance"), where there is room to label it,
  and the detail lives one click away in the month drawer. The mobile month list
  makes the same trade: the pill names the reserve, the drawer carries the gauges.
- **Month drawer** (`MonthLoadDrawer`) reads as a budget statement: what it costs,
  what there is, what is spending it.
- **Season shape** on the Seasons tab — a season that runs heavy in three reserves
  is a wish list, said at the moment it's being written rather than in the review.
- **"How this is measured"** on the Pressure tab names every denominator and where
  it came from.

### 8.9 Still open

- **Extending a savings target isn't offered as relief.** It's the natural move
  for `money` — a longer deadline means a smaller monthly — but `requiredMonthly`
  is computed server-side with interest and a starting balance, and approximating
  it here would disagree with the Forecast screen. Only shifting is modelled.
- **Free cash uses recurring amounts, not per-month entries.** Right for planning
  a year, and it keeps the page to two requests instead of one per month; it will
  differ from what a given month actually did.
- **`time` and `focus` capacities are still shipped defaults** until enough
  history accumulates to fit them. `money` is measured from day one; `body` is the
  one most likely to calibrate first.

### 8.10 The body model, revisited

_Reported from use: "a nutrition plan and two gym blocks reads as an overload,
and it isn't."_ Two separate faults, one a plain bug and one a modelling error.

**Fault 1 — two plans were summed, so a shared week counted twice.**

`weeklySessions` was called per plan and the results added, so a strength block
and a running block covering the same month produced ten hard sessions a week.
A week is a week: two plans live in the same month are two prescriptions for the
same seven days, not fourteen days of training.

`trainingShares` now unions them, which is the move `overload.ts` already makes
at day grain — a slot holds one hard session however many things want it. Slots
are keyed by **weekday and role**: two plans wanting Monday strength describe one
Monday, while Monday strength and Monday intervals are genuinely two sessions.
Weekday rather than date because the list endpoint omits `schedule`, and keying
on what both paths can always produce keeps a dated plan and a templated one
comparable. Plans are walked in order, each charged only for the share of its
week nothing before it claimed, so the shares still sum to the union — and a
plan that adds nothing is kept and *says whose week it duplicates*, because
"these two blocks are the same block" is the useful thing to learn.

**Fault 2 — a deficit was on the wrong side of the equation.**

v2 added the deficit to the demand: −500 kcal/day counted as two extra hard
sessions. Wrong shape. **A deficit doesn't make the week busier; it makes you
worse at recovering from the week you already have.** So it belongs on the
capacity side as a multiplier, not the demand side as an addend.

`ReserveLoad` gained `baseCapacity` and `adjustments[]`, and
`recoveryAdjustments` turns each live cut into a factor —
`RECOVERY_COST_PER_500 = 0.10`, pro-rated for the share of the month it covers,
floored at `MIN_RECOVERY_FACTOR`. The drawer renders it as "Ceiling 7 → 6.2,
Autumn cut −11%", which is a clearer sentence than any total.

Three things fall out for free:

- A cut with **no** training now costs the body nothing, which is correct and
  which v2 could not express.
- The `deep-cut-in-heavy-block` conflict stops being a separate special case and
  becomes the same physics read at a threshold.
- An ordinary cut under an ordinary block lands on **busy**, not overloaded —
  which is the reported case, and is now a test.

**And the real answer: measure the ceiling.**

Both faults were inflating the numerator, but the denominator was a guess too —
a flat 6 for everybody. `sustainedVolume` reads the busiest week you have hit in
at least `SUSTAINED_WEEKS` (3) separate weeks of the last `VOLUME_WEEKS` (12),
plus `VOLUME_HEADROOM` (1). Sustaining a volume is evidence it is *under* your
ceiling, not at it, so a capacity equal to what you already do would score your
ordinary week at 100% and cry wolf every month. It never goes below the shipped
default, and a fitted ceiling from the adherence pass overrides it when one
exists — adherence is the better evidence. Unlike that fit, this is available
from the first month of logs.

**Honest about the constants.** `RECOVERY_COST_PER_500` and `VOLUME_HEADROOM`
are priors, and they are the two most arbitrary numbers left in the model. They
are also exactly what §8.5 exists to replace: once there are eight months of
history, the ceiling stops being anyone's opinion. Until then they are set
conservatively, on the principle that an alarm which cries wolf is worse than no
alarm.
