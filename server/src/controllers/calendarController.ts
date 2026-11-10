import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Calendar, { CALENDAR_COLORS, CalendarColor } from '../models/Calendar'
import Event from '../models/Event'
import { ensureDefaultCalendar } from '../lib/calendars'

function isColor(value: unknown): value is CalendarColor {
    return typeof value === 'string' && (CALENDAR_COLORS as readonly string[]).includes(value)
}

/** GET /api/calendars */
export async function listCalendars(req: AuthRequest, res: Response) {
    await ensureDefaultCalendar(req.userId!)
    const calendars = await Calendar.find({ user: req.userId }).sort({ order: 1, name: 1 })
    res.json({ message: 'OK', data: calendars })
}

/** POST /api/calendars */
export async function createCalendar(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    const color: CalendarColor = isColor(req.body.color) ? req.body.color : 'neutral'

    const last = await Calendar.findOne({ user: req.userId }).sort({ order: -1 })
    try {
        const calendar = await Calendar.create({
            user: req.userId,
            name,
            color,
            isDefault: false,
            visible: req.body.visible === false ? false : true,
            order: (last?.order ?? -1) + 1,
        })
        res.status(201).json({ message: 'Created', data: calendar })
    } catch (err: unknown) {
        if ((err as { code?: number })?.code === 11000) {
            res.status(409).json({ message: 'You already have a calendar with that name' })
            return
        }
        throw err
    }
}

/** PUT /api/calendars/:id */
export async function updateCalendar(req: AuthRequest, res: Response) {
    const set: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) set.name = req.body.name.trim()
    if (isColor(req.body.color)) set.color = req.body.color
    if (typeof req.body.visible === 'boolean') set.visible = req.body.visible
    if (typeof req.body.order === 'number') set.order = req.body.order

    // Promoting a calendar to default demotes whichever one held it.
    if (req.body.isDefault === true) {
        await Calendar.updateMany(
            { user: req.userId, _id: { $ne: req.params.id } },
            { $set: { isDefault: false } }
        )
        set.isDefault = true
        set.visible = true // the default calendar is never hidden
    }

    try {
        const calendar = await Calendar.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: set },
            { new: true }
        )
        if (!calendar) {
            res.status(404).json({ message: 'Calendar not found' })
            return
        }
        res.json({ message: 'Saved', data: calendar })
    } catch (err: unknown) {
        if ((err as { code?: number })?.code === 11000) {
            res.status(409).json({ message: 'You already have a calendar with that name' })
            return
        }
        throw err
    }
}

/**
 * DELETE /api/calendars/:id
 * Events are moved to the default calendar rather than deleted — dropping a
 * layer shouldn't silently destroy everything logged on it.
 */
export async function deleteCalendar(req: AuthRequest, res: Response) {
    const calendar = await Calendar.findOne({ _id: req.params.id, user: req.userId })
    if (!calendar) {
        res.status(404).json({ message: 'Calendar not found' })
        return
    }
    if (calendar.isDefault) {
        res.status(400).json({ message: 'The default calendar cannot be deleted' })
        return
    }

    const fallback = await ensureDefaultCalendar(req.userId!)
    const { modifiedCount } = await Event.updateMany(
        { user: req.userId, calendar: calendar._id },
        { $set: { calendar: fallback._id } }
    )
    await calendar.deleteOne()

    res.json({ message: 'Deleted', data: { movedEvents: modifiedCount } })
}
