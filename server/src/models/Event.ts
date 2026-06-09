import { Schema, model, Document, Types } from 'mongoose'

export const PARTS = ['morning', 'afternoon', 'evening', 'na'] as const
export type Part = (typeof PARTS)[number]

export const EVENT_TYPES = ['trip', 'social', 'general'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface IRecurrence {
    frequency: RecurrenceFrequency
    endsOn?: string
}

export interface IEvent extends Document {
    user: Types.ObjectId
    title: string
    notes?: string
    location?: string
    eventType: EventType
    allDay: boolean
    time?: string
    startDate: string
    startPart: Part
    endDate: string
    endPart: Part
    recurrence?: IRecurrence
    createdAt: Date
    updatedAt: Date
}

const recurrenceSchema = new Schema<IRecurrence>(
    {
        frequency: { type: String, required: true, enum: RECURRENCE_FREQUENCIES },
        endsOn: { type: String, match: DATE_PATTERN },
    },
    { _id: false }
)

const eventSchema = new Schema<IEvent>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        notes: { type: String, trim: true },
        location: { type: String, trim: true },
        eventType: { type: String, required: true, enum: EVENT_TYPES, default: 'general' },
        allDay: { type: Boolean, default: false },
        time: { type: String, match: TIME_PATTERN },
        startDate: { type: String, required: true, match: DATE_PATTERN },
        startPart: { type: String, required: true, enum: PARTS },
        endDate: { type: String, required: true, match: DATE_PATTERN },
        endPart: { type: String, required: true, enum: PARTS },
        recurrence: { type: recurrenceSchema, default: undefined },
    },
    { timestamps: true }
)

export default model<IEvent>('Event', eventSchema)
