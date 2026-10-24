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

export const SEXES = ['male', 'female'] as const
export type Sex = (typeof SEXES)[number]

/**
 * The fixed facts BMR is worked out from (with the trend weight on the day).
 * Set once in Profile.
 */
export interface IBodyProfile {
    heightCm?: number
    /** "YYYY-MM-DD" — so age stays right by itself. */
    birthDate?: string
    sex?: Sex
}

export const TRAINING_AGES = ['beginner', 'intermediate', 'advanced'] as const
export const CREATINE_USE = ['no', 'new', 'already'] as const
export const PROTEIN_HABITS = ['always', 'mostly', 'rarely'] as const
export const SLEEP_BANDS = ['under6', '6to7', '7to8', 'over8'] as const
export const ACTIVITY_LEVELS = ['low', 'some', 'active', 'very'] as const

/**
 * The Timeline quiz: how closely the plans will really be followed, and the
 * few facts the plans themselves don't say (creatine, sleep, protein, steps).
 * Adherences are fractions, 0.5–1.
 */
export interface ITimelineQuiz {
    trainingAdherence: number
    nutritionAdherence: number
    trainingAge: (typeof TRAINING_AGES)[number]
    creatine: (typeof CREATINE_USE)[number]
    /** Daily grams, when taking or starting it. */
    creatineDoseG?: number
    /** A 20 g/day loading week first. Only meaningful for 'new'. */
    creatineLoading?: boolean
    /** "YYYY-MM-DD" a new course starts. Only meaningful for 'new'. */
    creatineStart?: string
    protein: (typeof PROTEIN_HABITS)[number]
    sleep: (typeof SLEEP_BANDS)[number]
    activity: (typeof ACTIVITY_LEVELS)[number]
    /** Known body fat, used when no recent reading is logged. */
    bodyFatPct?: number
    /** ISO timestamp the quiz was last answered. */
    answeredAt: string
}

export interface IUserSettings {
    wakeTime?: string
    bedTime?: string
    workStart?: string
    workEnd?: string
    showTotals?: boolean
    workDays?: number[]
    /** YYYY-MM-DD — all finance data before this date is hidden. */
    financeStartDate?: string
    /** £ a month the user aims to keep back; drives the Statement's savings plan. */
    savingsGoal?: number
    /** Saved location the weather forecast is based on. */
    weatherLocation?: IWeatherLocation
    /** Per-day macro targets, tracked against the weekly meal plan. */
    macroGoals?: IMacroGoals
    /** Bodyweight and body fat targets, plus the intended rate of change. */
    bodyGoals?: IBodyGoals
    /** Height, date of birth and sex — what BMR is calculated from. */
    bodyProfile?: IBodyProfile
    /** Answers to the Timeline quiz. */
    timelineQuiz?: ITimelineQuiz
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

const bodyProfileSchema = new Schema<IBodyProfile>(
    {
        heightCm: { type: Number, min: 0 },
        birthDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        sex: { type: String, enum: SEXES },
    },
    { _id: false }
)

const timelineQuizSchema = new Schema<ITimelineQuiz>(
    {
        trainingAdherence: { type: Number, min: 0.5, max: 1, required: true },
        nutritionAdherence: { type: Number, min: 0.5, max: 1, required: true },
        trainingAge: { type: String, enum: TRAINING_AGES, required: true },
        creatine: { type: String, enum: CREATINE_USE, required: true },
        creatineDoseG: { type: Number, min: 0, max: 30 },
        creatineLoading: { type: Boolean },
        creatineStart: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        protein: { type: String, enum: PROTEIN_HABITS, required: true },
        sleep: { type: String, enum: SLEEP_BANDS, required: true },
        activity: { type: String, enum: ACTIVITY_LEVELS, required: true },
        bodyFatPct: { type: Number, min: 3, max: 60 },
        answeredAt: { type: String, required: true },
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
        financeStartDate: { type: String },
        savingsGoal: { type: Number, min: 0 },
        weatherLocation: { type: weatherLocationSchema, default: undefined },
        macroGoals: { type: macroGoalsSchema, default: undefined },
        bodyGoals: { type: bodyGoalsSchema, default: undefined },
        bodyProfile: { type: bodyProfileSchema, default: undefined },
        timelineQuiz: { type: timelineQuizSchema, default: undefined },
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
