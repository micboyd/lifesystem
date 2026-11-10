import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const TIMEBOX_CATEGORIES = ['work', 'personal', 'health', 'learning', 'social', 'travel'] as const
export type TimeboxCategory = (typeof TIMEBOX_CATEGORIES)[number]

export const RECURRENCE_FREQS = ['daily', 'weekly', 'weekdays', 'custom'] as const
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number]

/**
 * One block of time on one day. With `recurrence` set it's a template that
 * repeats from `date` on (until `until`), minus the days in `exceptions`.
 *
 * Same shape and collection as the module retired on 2026-11-05, so blocks
 * saved back then still load.
 */
export interface ITimebox extends Document {
    user: Types.ObjectId
    date: string
    title: string
    notes?: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[]; until?: string }
    exceptions: string[]
    /** 'ical' on meetings imported from Google Calendar — read-only, replaced by each sync. */
    source?: 'ical'
    /** The feed's UID for the meeting (shared by every occurrence of a series). */
    externalUid?: string
    /** London date of the occurrence's original start — with the UID, its identity across syncs. */
    occurrenceDate?: string
    location?: string
    /** Video call link on an imported meeting. */
    joinUrl?: string
    createdAt: Date
    updatedAt: Date
}

const timeboxSchema = new Schema<ITimebox>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        title: { type: String, required: true, trim: true, maxlength: 200 },
        notes: { type: String, trim: true, maxlength: 2000 },
        category: { type: String, enum: TIMEBOX_CATEGORIES },
        startTime: { type: String, required: true, match: TIME_PATTERN },
        endTime: { type: String, required: true, match: TIME_PATTERN },
        recurrence: {
            type: new Schema(
                {
                    freq: { type: String, enum: RECURRENCE_FREQS, required: true },
                    days: { type: [Number], default: undefined },
                    until: { type: String, match: DATE_PATTERN, default: undefined },
                },
                { _id: false }
            ),
            default: undefined,
        },
        exceptions: { type: [String], default: [] },
        source: { type: String, enum: ['ical'] },
        externalUid: { type: String },
        occurrenceDate: { type: String, match: DATE_PATTERN },
        location: { type: String, trim: true, maxlength: 500 },
        joinUrl: { type: String, trim: true, maxlength: 1000 },
    },
    { timestamps: true }
)

timeboxSchema.index({ user: 1, date: 1, startTime: 1 })
timeboxSchema.index(
    { user: 1, source: 1, externalUid: 1, occurrenceDate: 1 },
    { partialFilterExpression: { source: { $exists: true } } }
)

export default model<ITimebox>('Timebox', timeboxSchema)
