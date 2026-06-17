import { Schema, model, Document } from 'mongoose'

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface IUserSettings {
    wakeTime?: string
    bedTime?: string
    workStart?: string
    workEnd?: string
    showTotals?: boolean
    workDays?: number[]
    /** Id of the totals row whose hours feed the Study section. */
    studyRowId?: string
}

export interface IUser extends Document {
    name: string
    email: string
    password: string
    settings: IUserSettings
    createdAt: Date
}

const settingsSchema = new Schema<IUserSettings>(
    {
        wakeTime: { type: String, match: TIME_PATTERN },
        bedTime: { type: String, match: TIME_PATTERN },
        workStart: { type: String, match: TIME_PATTERN },
        workEnd: { type: String, match: TIME_PATTERN },
        showTotals: { type: Boolean, default: false },
        workDays: { type: [Number], default: undefined },
        studyRowId: { type: String },
    },
    { _id: false }
)

const userSchema = new Schema<IUser>(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true },
        settings: { type: settingsSchema, default: () => ({}) },
    },
    { timestamps: true }
)

export default model<IUser>('User', userSchema)
