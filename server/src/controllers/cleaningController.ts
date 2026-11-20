import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import CleaningHome, { CLEANING_FREQS, type CleaningFreq, type ICleaningRoom } from '../models/CleaningHome'
import Timebox from '../models/Timebox'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const int = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : null

/** Clean rooms from a request body; bad tasks and nameless rooms are dropped. */
export function readRooms(raw: unknown): ICleaningRoom[] | string {
    if (!Array.isArray(raw)) return 'rooms must be an array'
    if (raw.length > 60) return 'at most 60 rooms'
    const rooms: ICleaningRoom[] = []
    for (const r of raw) {
        if (!r || typeof r !== 'object') continue
        const room = r as Record<string, unknown>
        const name = str(room.name, 80)
        const key = str(room.key, 40)
        if (!name || !key) continue
        const tasks = (Array.isArray(room.tasks) ? room.tasks : [])
            .slice(0, 80)
            .map((t) => {
                const task = (t ?? {}) as Record<string, unknown>
                const freq = (CLEANING_FREQS as readonly string[]).includes(task.freq as string)
                    ? (task.freq as CleaningFreq)
                    : null
                const minutes = int(task.minutes, 1, 600)
                const taskName = str(task.name, 120)
                const taskKey = str(task.key, 40)
                return freq && minutes && taskName && taskKey
                    ? { key: taskKey, name: taskName, minutes, freq }
                    : null
            })
            .filter((t): t is NonNullable<typeof t> => t !== null)
        rooms.push({ key, name, kind: str(room.kind, 40) || 'custom', tasks })
    }
    return rooms
}

/** GET /api/cleaning — the user's home, or null before the wizard has been run. */
export async function getCleaningHome(req: AuthRequest, res: Response) {
    const home = await CleaningHome.findOne({ user: req.userId }).lean()
    res.json({ message: 'OK', data: home })
}

/** PUT /api/cleaning — body: { rooms, minutesPerDay, days, startTime, cycleStart } — saves the whole home. */
export async function saveCleaningHome(req: AuthRequest, res: Response) {
    const body = req.body ?? {}
    const rooms = readRooms(body.rooms)
    if (typeof rooms === 'string') {
        res.status(400).json({ message: rooms })
        return
    }
    const minutesPerDay = int(body.minutesPerDay, 5, 600)
    if (!minutesPerDay) {
        res.status(400).json({ message: 'minutesPerDay must be a number of minutes' })
        return
    }
    const days = Array.isArray(body.days)
        ? [...new Set(body.days.filter((d: unknown): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6))]
        : []
    if (!days.length) {
        res.status(400).json({ message: 'pick at least one day to clean on' })
        return
    }
    if (typeof body.startTime !== 'string' || !TIME.test(body.startTime)) {
        res.status(400).json({ message: 'startTime must be HH:MM' })
        return
    }
    if (typeof body.cycleStart !== 'string' || !DATE.test(body.cycleStart)) {
        res.status(400).json({ message: 'cycleStart must be YYYY-MM-DD' })
        return
    }
    const home = await CleaningHome.findOneAndUpdate(
        { user: req.userId },
        { user: req.userId, rooms, minutesPerDay, days, startTime: body.startTime, cycleStart: body.cycleStart },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    ).lean()
    res.json({ message: 'Saved', data: home })
}

/**
 * POST /api/cleaning/timebox — body: { from, to, blocks: [{ date, title, startTime, endTime, notes }] }
 * Puts the schedule into Timebox: any cleaning blocks already sent for
 * from…to are removed first, so sending again replaces rather than doubles.
 */
export async function sendToTimebox(req: AuthRequest, res: Response) {
    const { from, to, blocks } = req.body ?? {}
    if (typeof from !== 'string' || typeof to !== 'string' || !DATE.test(from) || !DATE.test(to) || to < from) {
        res.status(400).json({ message: 'from and to must be YYYY-MM-DD, from first' })
        return
    }
    if (!Array.isArray(blocks) || blocks.length > 120) {
        res.status(400).json({ message: 'blocks must be an array of at most 120' })
        return
    }
    const docs: object[] = []
    for (const b of blocks) {
        const r = (b ?? {}) as Record<string, unknown>
        if (typeof r.date !== 'string' || !DATE.test(r.date) || r.date < from || r.date > to) continue
        if (typeof r.startTime !== 'string' || typeof r.endTime !== 'string') continue
        if (!TIME.test(r.startTime) || !TIME.test(r.endTime) || r.endTime <= r.startTime) continue
        const title = str(r.title, 200)
        if (!title) continue
        docs.push({
            user: req.userId,
            date: r.date,
            title,
            notes: str(r.notes, 2000) || undefined,
            category: 'personal',
            startTime: r.startTime,
            endTime: r.endTime,
            origin: 'cleaning',
        })
    }
    const removed = await Timebox.deleteMany({
        user: req.userId,
        origin: 'cleaning',
        date: { $gte: from, $lte: to },
        recurrence: { $exists: false },
    })
    const created = docs.length ? await Timebox.insertMany(docs) : []
    res.status(201).json({ message: 'Sent', data: { added: created.length, replaced: removed.deletedCount } })
}
