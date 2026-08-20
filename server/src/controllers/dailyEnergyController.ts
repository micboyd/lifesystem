import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import DailyEnergy, { ISO_DATE_PATTERN } from '../models/DailyEnergy'

function isDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

/**
 * GET /api/daily-energy?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Burn figures in a date range, oldest first. Both bounds optional — without
 * them the whole history comes back, which is what the maintenance estimate
 * wants when it's deciding how much data it has to work with.
 */
export async function listDailyEnergy(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    const filter: Record<string, unknown> = { user: req.userId }
    if (isDate(start) || isDate(end)) {
        const range: Record<string, string> = {}
        if (isDate(start)) range.$gte = start
        if (isDate(end)) range.$lte = end
        filter.date = range
    }

    const entries = await DailyEnergy.find(filter).sort({ date: 1 })
    res.json({ message: 'OK', data: entries })
}

/**
 * POST /api/daily-energy — record a day's total burn, upserting on the date.
 *
 * A `caloriesOut` of 0 is rejected rather than stored: it would read as "burned
 * nothing today", which is never true, and would drag the day's balance into a
 * nonsense surplus. Clearing a day is a DELETE.
 */
export async function upsertDailyEnergy(req: AuthRequest, res: Response) {
    const { date, caloriesOut, notes } = req.body

    if (!isDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const kcal = typeof caloriesOut === 'number' ? caloriesOut : Number(caloriesOut)
    if (!Number.isFinite(kcal) || kcal <= 0) {
        res.status(400).json({ message: 'caloriesOut must be a positive number' })
        return
    }

    const note = typeof notes === 'string' ? notes.trim() : ''
    const set: Record<string, unknown> = { caloriesOut: kcal }
    const unset: Record<string, 1> = {}
    if (note) set.notes = note
    else unset.notes = 1

    const entry = await DailyEnergy.findOneAndUpdate(
        { user: req.userId, date },
        { $set: set, $unset: unset },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    res.status(201).json({ message: 'Saved', data: entry })
}

/**
 * DELETE /api/daily-energy/:date — clear a day's figure. Keyed by date rather
 * than id: the client knows which day it's looking at, and never needs to have
 * loaded the row to be able to clear it.
 */
export async function deleteDailyEnergy(req: AuthRequest, res: Response) {
    const { date } = req.params
    if (!isDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const entry = await DailyEnergy.findOneAndDelete({ user: req.userId, date })
    if (!entry) {
        res.status(404).json({ message: 'No entry for that day' })
        return
    }
    res.json({ message: 'Deleted', data: entry })
}
