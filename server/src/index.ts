import 'express-async-errors' // routes async rejections to the error middleware below

import type { NextFunction, Request, Response } from 'express'

import DayStatus from './models/DayStatus'
import BudgetSpend from './models/BudgetSpend'
import EventModel from './models/Event'
import { ensureDefaultCalendar } from './lib/calendars'
import { connectDB } from './config/db'
import cors from 'cors'
import birthdayRoutes from './routes/birthdayRoutes'
import calendarRoutes from './routes/calendarRoutes'
import checklistRoutes from './routes/checklistRoutes'
import conditioningRoutes from './routes/conditioningRoutes'
import conditioningLogRoutes from './routes/conditioningLogRoutes'
import daysSinceRoutes from './routes/daysSinceRoutes'
import goalRoutes from './routes/goalRoutes'
import courseRoutes from './routes/courseRoutes'
import dayStatusRoutes from './routes/dayStatusRoutes'
import dotenv from 'dotenv'
import eventRoutes from './routes/eventRoutes'
import exerciseRoutes from './routes/exerciseRoutes'
import express from 'express'
import financeRoutes from './routes/financeRoutes'
import fitnessPlanRoutes from './routes/fitnessPlanRoutes'
import habitRoutes from './routes/habitRoutes'
import lifePlanRoutes from './routes/lifePlanRoutes'
import mealRoutes from './routes/mealRoutes'
import mealPlanRoutes from './routes/mealPlanRoutes'
import mobilityRoutes from './routes/mobilityRoutes'
import mobilityLogRoutes from './routes/mobilityLogRoutes'
import monthNoteRoutes from './routes/monthNoteRoutes'
import noteRoutes from './routes/noteRoutes'
import nutritionPhaseRoutes from './routes/nutritionPhaseRoutes'
import path from 'path'
import recoveryRoutes from './routes/recoveryRoutes'
import recoveryLogRoutes from './routes/recoveryLogRoutes'
import reminderRoutes from './routes/reminderRoutes'
import savingsTargetRoutes from './routes/savingsTargetRoutes'
import taskRoutes from './routes/taskRoutes'
import timeboxRoutes from './routes/timeboxRoutes'
import totalsRoutes from './routes/totalsRoutes'
import trainingPlanRoutes from './routes/trainingPlanRoutes'
import userRoutes from './routes/userRoutes'
import weightLogRoutes from './routes/weightLogRoutes'
import dailyEnergyRoutes from './routes/dailyEnergyRoutes'
import workoutRoutes from './routes/workoutRoutes'
import workoutLogRoutes from './routes/workoutLogRoutes'
import Workout from './models/Workout'
import FitnessPlanEntry from './models/FitnessPlanEntry'
import MealPlanEntry from './models/MealPlanEntry'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

// Fail fast at boot if required secrets are missing, rather than 500ing on
// the first request that needs them.
const REQUIRED_ENV = ['MONGO_URI', 'JWT_SECRET'] as const
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key])
if (missingEnv.length > 0) {
    console.error(`Missing required environment variables: ${missingEnv.join(', ')}`)
    process.exit(1)
}

const app = express()
const PORT = process.env.PORT ?? 5000

const allowedOrigins = [
    'http://localhost:5173',
    'https://mb-lifesystem.netlify.app',
    'https://adminlife.co',
]

app.use(cors({ origin: allowedOrigins, credentials: true }))
// A pasted training plan is a whole season in one document — the bundled sample
// is already 78 kB — so the 100 kB default is far too tight for /api/plans/import.
app.use(express.json({ limit: '5mb' }))

app.use('/api/users', userRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/calendars', calendarRoutes)
app.use('/api/habits', habitRoutes)
app.use('/api/day-status', dayStatusRoutes)
app.use('/api/month-notes', monthNoteRoutes)
app.use('/api/reminders', reminderRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/timeboxes', timeboxRoutes)
app.use('/api/totals', totalsRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/finances', financeRoutes)
app.use('/api/birthdays', birthdayRoutes)
app.use('/api/days-since', daysSinceRoutes)
app.use('/api/goals', goalRoutes)
app.use('/api/conditioning', conditioningRoutes)
app.use('/api/conditioning-logs', conditioningLogRoutes)
app.use('/api/exercises', exerciseRoutes)
app.use('/api/workouts', workoutRoutes)
app.use('/api/workout-logs', workoutLogRoutes)
app.use('/api/weight-logs', weightLogRoutes)
app.use('/api/daily-energy', dailyEnergyRoutes)
app.use('/api/meals', mealRoutes)
app.use('/api/meal-plan', mealPlanRoutes)
app.use('/api/fitness-plan', fitnessPlanRoutes)
app.use('/api/plans', trainingPlanRoutes)
app.use('/api/recovery', recoveryRoutes)
app.use('/api/recovery-logs', recoveryLogRoutes)
app.use('/api/mobility', mobilityRoutes)
app.use('/api/mobility-logs', mobilityLogRoutes)
app.use('/api/notes', noteRoutes)
app.use('/api/checklists', checklistRoutes)
app.use('/api/savings-targets', savingsTargetRoutes)
app.use('/api/life-plans', lifePlanRoutes)
app.use('/api/nutrition-phases', nutritionPhaseRoutes)

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
})

// Terminal error handler. Thanks to express-async-errors, rejected promises in
// async route handlers reach here too, so a thrown DB error returns a 500
// instead of leaving the request hanging.
//
// Errors raised before a route runs — body-parser rejecting an oversized or
// malformed JSON body — carry their own status and a message meant for the
// caller. Passing those through matters: reporting a 413 as "Something went
// wrong" sends you hunting through a plan document for a fault that isn't there.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err)
    if (res.headersSent) return
    const e = err as { status?: number; statusCode?: number; expose?: boolean; message?: string }
    const status = e?.status ?? e?.statusCode
    if (e?.expose === true && typeof status === 'number' && status >= 400 && status < 500) {
        res.status(status).json({ message: e.message ?? 'Bad request' })
        return
    }
    res.status(500).json({ message: 'Something went wrong' })
})

connectDB()
    .then(async () => {
        // One-time migration: drop the old unique { user, date } index from DayStatus
        // (replaced by startDate/endDate in the new schema).
        try {
            await DayStatus.collection.dropIndex('user_1_date_1')
            console.log('DayStatus: dropped stale date index')
        } catch {
            // Index already gone — nothing to do.
        }

        // One-time migration: the daily-spend log moved from one amount per
        // row/day to many transactions, so the old UNIQUE { user, row, date }
        // index must go — otherwise a second transaction on the same day fails.
        try {
            await BudgetSpend.collection.dropIndex('user_1_row_1_date_1')
            console.log('BudgetSpend: dropped stale unique index')
        } catch {
            // Already dropped or never existed.
        }

        // One-time migration: the starlingFeedItemUid unique index was `sparse`,
        // which still enforces uniqueness on documents where the field is explicitly
        // null (only truly-absent fields are skipped) — so moving or manually
        // logging a second spend collided with the first as soon as one existed.
        // Dropping it lets Mongoose recreate it as a partial index (defined on the
        // schema), which correctly excludes null/absent values entirely.
        try {
            await BudgetSpend.collection.dropIndex('user_1_starlingFeedItemUid_1')
            console.log('BudgetSpend: dropped stale sparse starlingFeedItemUid index')
        } catch {
            // Already dropped or never existed.
        }

        // One-time migration: workout exercises moved from a bare array of exercise
        // ids to `{ exercise, sets?, reps? }` sub-documents. Convert any workout
        // still holding raw ids so Mongoose can cast it under the new schema.
        try {
            const cursor = Workout.collection.find({ 'exercises.0': { $exists: true } })
            let migrated = 0
            for await (const doc of cursor) {
                const ex = doc.exercises as unknown[]
                const first = ex[0]
                const alreadyNew =
                    first && typeof first === 'object' && 'exercise' in (first as object)
                if (alreadyNew) continue
                const converted = ex
                    .filter((id) => id != null)
                    .map((id) => ({ exercise: id }))
                await Workout.collection.updateOne(
                    { _id: doc._id },
                    { $set: { exercises: converted } }
                )
                migrated++
            }
            if (migrated > 0) console.log(`Workout: migrated ${migrated} workout(s) to sets/reps shape`)
        } catch (err) {
            console.error('Workout exercises migration failed:', err)
        }

        // One-time migration: the planner gained morning/afternoon/evening slots.
        // Plan entries predating that have no `part`; drop them all into the
        // morning slot so they still show up under the new day layout.
        try {
            const { modifiedCount } = await FitnessPlanEntry.updateMany(
                { part: { $exists: false } },
                { $set: { part: 'morning' } }
            )
            if (modifiedCount > 0)
                console.log(`FitnessPlanEntry: assigned ${modifiedCount} entr(ies) to the morning slot`)
        } catch (err) {
            console.error('FitnessPlanEntry part migration failed:', err)
        }

        // One-time migration: meal plan entries gained an eaten/skipped status.
        // Anything planned before that has no `status` at all, and the planner
        // keys its tick control off the value — so backfill rather than rely on
        // the schema default only applying on hydrate.
        try {
            const { modifiedCount } = await MealPlanEntry.updateMany(
                { status: { $exists: false } },
                { $set: { status: 'planned' } }
            )
            if (modifiedCount > 0)
                console.log(`MealPlanEntry: marked ${modifiedCount} entr(ies) as planned`)
        } catch (err) {
            console.error('MealPlanEntry status backfill failed:', err)
        }

        // One-time migration: events predate calendars. Every event now belongs
        // to exactly one, and slot-conflict checks match on it, so anything left
        // unassigned would sit outside the exclusivity rule entirely.
        try {
            const userIds = await EventModel.distinct('user', { calendar: { $exists: false } })
            for (const userId of userIds) {
                const fallback = await ensureDefaultCalendar(userId)
                const { modifiedCount } = await EventModel.updateMany(
                    { user: userId, calendar: { $exists: false } },
                    { $set: { calendar: fallback._id } }
                )
                console.log(
                    `Event: assigned ${modifiedCount} event(s) to the "${fallback.name}" calendar`
                )
            }
        } catch (err) {
            console.error('Event calendar backfill failed:', err)
        }

        app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
    })
    .catch((err) => {
        console.error('Failed to connect to the database:', err)
        process.exit(1)
    })
