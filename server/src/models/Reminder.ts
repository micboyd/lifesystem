import { Schema, model, Document, Types } from 'mongoose'
import { RECURRENCE_FREQUENCIES, type RecurrenceSpec } from '../lib/recurrence'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export type IReminderRecurrence = RecurrenceSpec

export interface IReminder extends Document {
    user: Types.ObjectId
    date: string
    text: string
    order: number
    recurrence?: IReminderRecurrence
    /** YYYY-MM-DD occurrence dates removed from a recurring series ("this one only" deletes). */
    exdates?: string[]
    createdAt: Date
    updatedAt: Date
}

const recurrenceSchema = new Schema<IReminderRecurrence>(
    {
        frequency: { type: String, required: true, enum: RECURRENCE_FREQUENCIES },
        endsOn: { type: String, match: DATE_PATTERN },
    },
    { _id: false }
)

const reminderSchema = new Schema<IReminder>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        text: { type: String, required: true, trim: true },
        order: { type: Number, default: 0 },
        recurrence: { type: recurrenceSchema, default: undefined },
        exdates: { type: [String], default: undefined },
    },
    { timestamps: true }
)

reminderSchema.index({ user: 1, date: 1, order: 1 })

export default model<IReminder>('Reminder', reminderSchema)
