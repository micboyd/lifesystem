import { Schema, model, Document, Types } from 'mongoose'

/**
 * Palette keys rather than raw classes — the client owns the Tailwind mapping,
 * the same way DAY_STATUS_OPTIONS works.
 */
export const CALENDAR_COLORS = [
    'neutral',
    'blue',
    'amber',
    'indigo',
    'emerald',
    'rose',
    'purple',
    'teal',
] as const
export type CalendarColor = (typeof CALENDAR_COLORS)[number]

export interface ICalendar extends Document {
    user: Types.ObjectId
    name: string
    color: CalendarColor
    /** The calendar new events land in when none is chosen. Exactly one per user. */
    isDefault: boolean
    /** Whether its events are drawn in the grid. Hidden ones still show as presence dots. */
    visible: boolean
    order: number
    createdAt: Date
    updatedAt: Date
}

const calendarSchema = new Schema<ICalendar>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        color: { type: String, required: true, enum: CALENDAR_COLORS, default: 'neutral' },
        isDefault: { type: Boolean, default: false },
        visible: { type: Boolean, default: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

// Names are the handle the user reasons about, so two calendars called "Gym"
// would be indistinguishable in the filter bar.
calendarSchema.index({ user: 1, name: 1 }, { unique: true })

export default model<ICalendar>('Calendar', calendarSchema)
