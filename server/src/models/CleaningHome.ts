import { Schema, model, Document, Types } from 'mongoose'

export const CLEANING_FREQS = [
    'daily',
    '3x-week',
    '2x-week',
    'weekly',
    'fortnightly',
    'monthly',
    'quarterly',
    '6-monthly',
    'yearly',
] as const
export type CleaningFreq = (typeof CLEANING_FREQS)[number]

export interface ICleaningTask {
    key: string
    name: string
    minutes: number
    freq: CleaningFreq
}

export interface ICleaningRoom {
    key: string
    name: string
    /** The preset it came from ('kitchen', 'bathroom', …) or 'custom' — picks the icon. */
    kind: string
    tasks: ICleaningTask[]
}

/**
 * The user's home for the Cleaning module: rooms, what needs cleaning in each,
 * and how much time they give it. One document per user; the weekly schedule
 * is worked out from it on the client.
 */
export interface ICleaningHome extends Document {
    user: Types.ObjectId
    rooms: ICleaningRoom[]
    minutesPerDay: number
    /** Days of the week to clean on, 0 = Sun … 6 = Sat. */
    days: number[]
    /** When the cleaning block starts, for Timebox. */
    startTime: string
    /** The Monday the 4-week rotation counts from (fortnightly/monthly jobs). */
    cycleStart: string
    createdAt: Date
    updatedAt: Date
}

const taskSchema = new Schema<ICleaningTask>(
    {
        key: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 120 },
        minutes: { type: Number, required: true, min: 1, max: 600 },
        freq: { type: String, enum: CLEANING_FREQS, required: true },
    },
    { _id: false }
)

const roomSchema = new Schema<ICleaningRoom>(
    {
        key: { type: String, required: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        kind: { type: String, required: true, maxlength: 40 },
        tasks: { type: [taskSchema], default: [] },
    },
    { _id: false }
)

const cleaningHomeSchema = new Schema<ICleaningHome>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        rooms: { type: [roomSchema], default: [] },
        minutesPerDay: { type: Number, required: true, min: 5, max: 600 },
        days: { type: [Number], default: [1, 2, 3, 4, 5, 6, 0] },
        startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        cycleStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    },
    { timestamps: true }
)

export default model<ICleaningHome>('CleaningHome', cleaningHomeSchema)
