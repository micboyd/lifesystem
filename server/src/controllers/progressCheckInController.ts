import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import ProgressCheckIn, {
    CLOTHES_FITS,
    ISO_DATE_PATTERN,
    RATING_FIELDS,
    type ClothesFit,
} from '../models/ProgressCheckIn'

function isDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

function isObjectBody(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A 1–5 rating, or undefined when absent, blank or out of range. */
function toRating(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) return undefined
    const rounded = Math.round(n)
    return rounded >= 1 && rounded <= 5 ? rounded : undefined
}

/**
 * GET /api/progress-check-ins?since=YYYY-MM-DD — oldest first, so a timeline can
 * be folded over them in order.
 */
export async function listCheckIns(req: AuthRequest, res: Response) {
    const { since } = req.query
    const filter: Record<string, unknown> = { user: req.userId }
    if (isDate(since)) filter.date = { $gte: since }

    const checkIns = await ProgressCheckIn.find(filter).sort({ date: 1 })
    res.json({ message: 'OK', data: checkIns })
}

/**
 * POST /api/progress-check-ins — record a check-in, upserting on the date.
 *
 * Every field is optional. Saving a check-in with only a note is a legitimate
 * thing to do, and demanding all five ratings is how a monthly habit turns into
 * a chore that gets skipped.
 */
export async function upsertCheckIn(req: AuthRequest, res: Response) {
    if (!isObjectBody(req.body)) {
        res.status(400).json({ message: 'a JSON object body is required' })
        return
    }
    const { date, clothesFit, notes } = req.body

    if (!isDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    if (
        clothesFit !== undefined &&
        clothesFit !== null &&
        clothesFit !== '' &&
        !(CLOTHES_FITS as readonly string[]).includes(clothesFit as string)
    ) {
        res.status(400).json({ message: `clothesFit must be one of: ${CLOTHES_FITS.join(', ')}` })
        return
    }

    // Blank fields are unset rather than left behind, so clearing one sticks.
    const set: Record<string, unknown> = {}
    const unset: Record<string, 1> = {}

    for (const field of RATING_FIELDS) {
        const value = toRating(req.body[field])
        if (value !== undefined) set[field] = value
        else unset[field] = 1
    }

    const fit = (CLOTHES_FITS as readonly string[]).includes(clothesFit as string)
        ? (clothesFit as ClothesFit)
        : undefined
    if (fit) set.clothesFit = fit
    else unset.clothesFit = 1

    const note = typeof notes === 'string' ? notes.trim().slice(0, 2000) : ''
    if (note) set.notes = note
    else unset.notes = 1

    const checkIn = await ProgressCheckIn.findOneAndUpdate(
        { user: req.userId, date },
        { $set: set, $unset: unset },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    res.status(201).json({ message: 'Saved', data: checkIn })
}

/** DELETE /api/progress-check-ins/:date — remove a check-in. */
export async function deleteCheckIn(req: AuthRequest, res: Response) {
    if (!isDate(req.params.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    const removed = await ProgressCheckIn.findOneAndDelete({
        user: req.userId,
        date: req.params.date,
    })
    if (!removed) {
        res.status(404).json({ message: 'Check-in not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
