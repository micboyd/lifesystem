import { Schema, model, Document } from 'mongoose'

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface IWeatherLocation {
    name: string
    latitude: number
    longitude: number
}

export interface IMacroGoals {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
}

/** Body composition targets the weigh-in trend is judged against. */
export interface IBodyGoals {
    /** Goal bodyweight in kilograms. */
    targetWeight?: number
    /**
     * Intended change per week in kilograms, signed: negative for a cut,
     * positive for a gain. The trend's actual rate is compared against this.
     */
    weeklyRate?: number
    /** Goal body fat, as a percentage of bodyweight. */
    targetBodyFat?: number
}

export interface IUserSettings {
    wakeTime?: string
    bedTime?: string
    workStart?: string
    workEnd?: string
    showTotals?: boolean
    workDays?: number[]
    /** Id of the totals row whose hours feed the Study section. */
    studyRowId?: string
    /** YYYY-MM-DD — all finance data before this date is hidden. */
    financeStartDate?: string
    /** Saved location the weather forecast is based on. */
    weatherLocation?: IWeatherLocation
    /** Per-day macro targets, tracked against the weekly meal plan. */
    macroGoals?: IMacroGoals
    /** Bodyweight and body fat targets, plus the intended rate of change. */
    bodyGoals?: IBodyGoals
}

export interface IUser extends Document {
    name: string
    email: string
    password: string
    settings: IUserSettings
    createdAt: Date
}

const weatherLocationSchema = new Schema<IWeatherLocation>(
    {
        name: { type: String, required: true },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
    },
    { _id: false }
)

const macroGoalsSchema = new Schema<IMacroGoals>(
    {
        calories: { type: Number, min: 0 },
        protein: { type: Number, min: 0 },
        carbs: { type: Number, min: 0 },
        fat: { type: Number, min: 0 },
    },
    { _id: false }
)

const bodyGoalsSchema = new Schema<IBodyGoals>(
    {
        targetWeight: { type: Number, min: 0 },
        // Signed — negative for a cut — so no min bound here.
        weeklyRate: { type: Number },
        targetBodyFat: { type: Number, min: 0, max: 100 },
    },
    { _id: false }
)

const settingsSchema = new Schema<IUserSettings>(
    {
        wakeTime: { type: String, match: TIME_PATTERN },
        bedTime: { type: String, match: TIME_PATTERN },
        workStart: { type: String, match: TIME_PATTERN },
        workEnd: { type: String, match: TIME_PATTERN },
        showTotals: { type: Boolean, default: false },
        workDays: { type: [Number], default: undefined },
        studyRowId: { type: String },
        financeStartDate: { type: String },
        weatherLocation: { type: weatherLocationSchema, default: undefined },
        macroGoals: { type: macroGoalsSchema, default: undefined },
        bodyGoals: { type: bodyGoalsSchema, default: undefined },
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
