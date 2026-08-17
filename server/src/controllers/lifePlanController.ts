import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import LifePlan, { LIFE_PILLARS, type ILifePlan, type ISeason, type LifePillar } from '../models/LifePlan'
import { MONTH_PATTERN } from '../models/MonthNote'
import { CALENDAR_COLORS, type CalendarColor } from '../models/Calendar'

function isValidMonth(v: unknown): v is string {
    return typeof v === 'string' && MONTH_PATTERN.test(v)
}

function isValidColor(v: unknown): v is CalendarColor {
    return typeof v === 'string' && (CALENDAR_COLORS as readonly string[]).includes(v)
}

/**
 * A body worth reading. `express.json()` accepts bare `null`, `true` and arrays
 * as valid JSON, so destructuring the body without this check throws a
 * TypeError and surfaces as a 500 on what is really a bad request.
 */
function isObjectBody(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Whether an id can address a document at all. An unparseable id cast-errors
 * inside Mongoose, turning "no such plan" into a 500; checking first lets the
 * handlers answer 404, which is what a caller asking for a nonexistent id means.
 */
function isId(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)
}

/** The ids in a link array that are well-formed, deduped. Bad ids are dropped. */
function readIds(v: unknown): Types.ObjectId[] {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: Types.ObjectId[] = []
    for (const id of v) {
        if (typeof id !== 'string' || !Types.ObjectId.isValid(id) || seen.has(id)) continue
        seen.add(id)
        out.push(new Types.ObjectId(id))
    }
    return out
}

function readPillars(v: unknown): LifePillar[] | undefined {
    if (!Array.isArray(v)) return undefined
    const out = v.filter((p): p is LifePillar =>
        typeof p === 'string' && (LIFE_PILLARS as readonly string[]).includes(p)
    )
    return out.length > 0 ? [...new Set(out)] : undefined
}

/** Validate a plan create/update body, or return the error message. */
function readPlanBody(body: unknown):
    | { error: string }
    | { name: string; start: string; end: string; vision?: string; pillars: LifePillar[] } {
    if (!isObjectBody(body)) return { error: 'a JSON object body is required' }
    const { name, start, end, vision, pillars } = body
    if (typeof name !== 'string' || !name.trim()) return { error: 'name is required' }
    if (!isValidMonth(start) || !isValidMonth(end))
        return { error: 'start and end must be YYYY-MM' }
    if (start > end) return { error: 'start cannot be after end' }
    if (vision !== undefined && vision !== null && typeof vision !== 'string')
        return { error: 'vision must be a string' }
    return {
        name: name.trim().slice(0, 80),
        start,
        end,
        vision: typeof vision === 'string' && vision.trim() ? vision.trim() : undefined,
        pillars: readPillars(pillars) ?? [...LIFE_PILLARS],
    }
}

/** The shape a season body is normalised to before being written. */
type SeasonFields = Pick<ISeason, 'name' | 'startMonth' | 'endMonth' | 'color' | 'intent' | 'links'> & {
    focus?: string
}

/**
 * Validate a season body against its plan. A season must sit inside the plan's
 * window and must not overlap a sibling: the plan is a partition of its own
 * months, which is what makes "which season am I in right now" answerable.
 */
function readSeasonBody(
    body: unknown,
    plan: ILifePlan,
    ignoreSeasonId?: string
): { error: string } | SeasonFields {
    if (!isObjectBody(body)) return { error: 'a JSON object body is required' }
    const { name, startMonth, endMonth, focus, color, intent, links } = body
    if (typeof name !== 'string' || !name.trim()) return { error: 'name is required' }
    if (!isValidMonth(startMonth) || !isValidMonth(endMonth))
        return { error: 'startMonth and endMonth must be YYYY-MM' }
    if (startMonth > endMonth) return { error: 'startMonth cannot be after endMonth' }
    if (startMonth < plan.start || endMonth > plan.end)
        return { error: `season must sit within the plan window (${plan.start} to ${plan.end})` }

    const clash = plan.seasons.find(
        (s) =>
            String(s._id) !== ignoreSeasonId &&
            s.startMonth <= endMonth &&
            s.endMonth >= startMonth
    )
    if (clash) return { error: `overlaps the "${clash.name}" season` }

    const intents = Array.isArray(intent)
        ? intent
              .filter(
                  (i): i is { pillar: LifePillar; text: string } =>
                      !!i &&
                      typeof i === 'object' &&
                      typeof (i as { pillar?: unknown }).pillar === 'string' &&
                      (LIFE_PILLARS as readonly string[]).includes((i as { pillar: string }).pillar) &&
                      typeof (i as { text?: unknown }).text === 'string' &&
                      !!(i as { text: string }).text.trim()
              )
              .map((i) => ({ pillar: i.pillar, text: i.text.trim().slice(0, 500) }))
        : []

    const l = (links ?? {}) as Record<string, unknown>
    return {
        name: name.trim().slice(0, 80),
        startMonth,
        endMonth,
        focus: typeof focus === 'string' && focus.trim() ? focus.trim().slice(0, 300) : undefined,
        color: isValidColor(color) ? color : 'neutral',
        intent: intents,
        links: {
            trainingPlans: readIds(l.trainingPlans),
            nutritionPhases: readIds(l.nutritionPhases),
            savingsTargets: readIds(l.savingsTargets),
            goals: readIds(l.goals),
            courses: readIds(l.courses),
            monthNotes: readIds(l.monthNotes),
        },
    }
}

/** Seasons always come back in date order — the timeline reads them left to right. */
function sortSeasons(plan: ILifePlan) {
    plan.seasons.sort((a, b) => a.startMonth.localeCompare(b.startMonth))
    plan.seasons.forEach((s, i) => {
        s.order = i
    })
}

/** GET /api/life-plans — every plan, seasons included. */
export async function listLifePlans(req: AuthRequest, res: Response) {
    const plans = await LifePlan.find({ user: req.userId }).sort({ order: 1, start: 1 })
    res.json({ message: 'OK', data: plans })
}

/** GET /api/life-plans/:id — one plan. */
export async function getLifePlan(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    res.json({ message: 'OK', data: plan })
}

/** POST /api/life-plans — start a new plan horizon. */
export async function createLifePlan(req: AuthRequest, res: Response) {
    const parsed = readPlanBody(req.body)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    const last = await LifePlan.findOne({ user: req.userId }).sort({ order: -1 }).select('order')
    const plan = await LifePlan.create({
        user: req.userId,
        ...parsed,
        order: (last?.order ?? -1) + 1,
    })
    res.status(201).json({ message: 'Created', data: plan })
}

/**
 * PUT /api/life-plans/:id — update the plan's own fields.
 *
 * Narrowing the window would orphan seasons outside it, so the change is
 * refused rather than silently dropping or clamping them.
 */
export async function updateLifePlan(req: AuthRequest, res: Response) {
    const parsed = readPlanBody(req.body)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const stranded = plan.seasons.find(
        (s) => s.startMonth < parsed.start || s.endMonth > parsed.end
    )
    if (stranded) {
        res.status(400).json({
            message: `the "${stranded.name}" season would fall outside the new window`,
        })
        return
    }
    plan.name = parsed.name
    plan.start = parsed.start
    plan.end = parsed.end
    plan.pillars = parsed.pillars
    if (parsed.vision === undefined) plan.set('vision', undefined)
    else plan.vision = parsed.vision
    await plan.save()
    res.json({ message: 'Saved', data: plan })
}

/** DELETE /api/life-plans/:id — remove a plan and its seasons. */
export async function deleteLifePlan(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    res.json({ message: 'Deleted' })
}

/** POST /api/life-plans/:id/seasons — add a chapter to the plan. */
export async function createSeason(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const parsed = readSeasonBody(req.body, plan)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    plan.seasons.push({ ...parsed, order: plan.seasons.length } as ISeason)
    sortSeasons(plan)
    await plan.save()
    res.status(201).json({ message: 'Created', data: plan })
}

/** PUT /api/life-plans/:id/seasons/:seasonId — edit a chapter. */
export async function updateSeason(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const season = plan.seasons.find((s) => String(s._id) === req.params.seasonId)
    if (!season) {
        res.status(404).json({ message: 'Season not found' })
        return
    }
    const parsed = readSeasonBody(req.body, plan, req.params.seasonId)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    season.name = parsed.name
    season.startMonth = parsed.startMonth
    season.endMonth = parsed.endMonth
    season.color = parsed.color
    season.intent = parsed.intent
    season.links = parsed.links
    // Assigning undefined unsets the path, so a cleared focus is removed rather
    // than left behind as an empty string.
    season.focus = parsed.focus
    sortSeasons(plan)
    await plan.save()
    res.json({ message: 'Saved', data: plan })
}

/** DELETE /api/life-plans/:id/seasons/:seasonId — drop a chapter. */
export async function deleteSeason(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    if (!plan.seasons.some((s) => String(s._id) === req.params.seasonId)) {
        res.status(404).json({ message: 'Season not found' })
        return
    }
    plan.seasons.pull({ _id: req.params.seasonId })
    sortSeasons(plan)
    await plan.save()
    res.json({ message: 'Deleted', data: plan })
}

/**
 * PUT /api/life-plans/:id/seasons/:seasonId/review — save the retro.
 *
 * Kept off the season update route so writing a review never has to resend the
 * season's dates and links, and so a review can't fail validation on them.
 */
export async function saveSeasonReview(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const plan = await LifePlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const season = plan.seasons.find((s) => String(s._id) === req.params.seasonId)
    if (!season) {
        res.status(404).json({ message: 'Season not found' })
        return
    }
    if (!isObjectBody(req.body)) {
        res.status(400).json({ message: 'a JSON object body is required' })
        return
    }
    const { notes, rating, reviewedAt } = req.body
    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
        res.status(400).json({ message: 'notes must be a string' })
        return
    }
    if (
        rating !== undefined &&
        rating !== null &&
        (typeof rating !== 'number' || rating < 1 || rating > 5)
    ) {
        res.status(400).json({ message: 'rating must be between 1 and 5' })
        return
    }
    const hasNotes = typeof notes === 'string' && notes.trim()
    const hasRating = typeof rating === 'number'
    // An empty review is no review — clear it rather than store a blank record.
    if (!hasNotes && !hasRating) {
        season.review = undefined
    } else {
        season.review = {
            notes: hasNotes ? notes.trim() : undefined,
            rating: hasRating ? rating : undefined,
            reviewedAt:
                typeof reviewedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(reviewedAt)
                    ? reviewedAt
                    : new Date().toISOString().slice(0, 10),
        }
    }
    await plan.save()
    res.json({ message: 'Saved', data: plan })
}
