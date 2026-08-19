import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db'
import User from '../models/User'
import Exercise from '../models/Exercise'
import Workout from '../models/Workout'
import ConditioningSession from '../models/ConditioningSession'
import Mobility from '../models/Mobility'
import Recovery from '../models/Recovery'
import FitnessPlanEntry from '../models/FitnessPlanEntry'
import FitnessPlanNote from '../models/FitnessPlanNote'
import TrainingPlan from '../models/TrainingPlan'
import WorkoutLog from '../models/WorkoutLog'
import ConditioningLog from '../models/ConditioningLog'
import MobilityLog from '../models/MobilityLog'
import RecoveryLog from '../models/RecoveryLog'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Empties one user's fitness module completely — every library, every planned
 * item, every completion log — back to a clean slate to rebuild on. Nutrition
 * (meals, meal plan, nutrition phases) and weight logs are deliberately out of
 * scope: they are separate modules that happen to sit near fitness.
 *
 * DRY RUN by default; set WIPE_CONFIRM=1 to delete. Everything removed is
 * written to a timestamped backup JSON first, keyed to match
 * restoreFitnessCleanup.ts so the whole wipe can be put back.
 *
 * WIPE_EMAIL      whose fitness data to clear (defaults to the seeded user).
 * WIPE_BACKUP_DIR where the backup lands (defaults to the server directory).
 */
const email = process.env.WIPE_EMAIL ?? 'michael_boyd@live.co.uk'
const confirm = process.env.WIPE_CONFIRM === '1'
const backupDir = process.env.WIPE_BACKUP_DIR ?? process.cwd()

/**
 * The slice of a Mongoose model this script needs, declared structurally so one
 * table can hold twelve differently-typed collections.
 */
interface WipeableModel {
    find(filter: Record<string, unknown>): { lean(): Promise<unknown[]> }
    countDocuments(filter: Record<string, unknown>): Promise<number>
    deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>
}

/** Backup key -> collection. Keys match restoreFitnessCleanup.ts categories. */
const TARGETS: { key: string; label: string; model: WipeableModel }[] = [
    { key: 'exercises', label: 'Exercises', model: Exercise as unknown as WipeableModel },
    { key: 'workouts', label: 'Strength workouts', model: Workout as unknown as WipeableModel },
    {
        key: 'conditioning',
        label: 'Conditioning sessions',
        model: ConditioningSession as unknown as WipeableModel,
    },
    { key: 'mobility', label: 'Mobility routines', model: Mobility as unknown as WipeableModel },
    { key: 'recovery', label: 'Recovery items', model: Recovery as unknown as WipeableModel },
    {
        key: 'planEntries',
        label: 'Planner entries',
        model: FitnessPlanEntry as unknown as WipeableModel,
    },
    {
        key: 'planNotes',
        label: 'Fitness plan notes',
        model: FitnessPlanNote as unknown as WipeableModel,
    },
    {
        key: 'trainingPlans',
        label: 'Training plans',
        model: TrainingPlan as unknown as WipeableModel,
    },
    { key: 'workoutLogs', label: 'Workout logs', model: WorkoutLog as unknown as WipeableModel },
    {
        key: 'conditioningLogs',
        label: 'Conditioning logs',
        model: ConditioningLog as unknown as WipeableModel,
    },
    { key: 'mobilityLogs', label: 'Mobility logs', model: MobilityLog as unknown as WipeableModel },
    { key: 'recoveryLogs', label: 'Recovery logs', model: RecoveryLog as unknown as WipeableModel },
]

async function wipe() {
    await connectDB()

    const user = await User.findOne({ email }, { email: 1 }).lean()
    if (!user) {
        console.error(`No user found with email: ${email}`)
        await mongoose.disconnect()
        process.exit(1)
    }
    const userId = user._id as Types.ObjectId
    const scope = { user: userId }

    console.log(`Clearing the fitness module for ${email}`)
    console.log(confirm ? 'MODE: DELETE (WIPE_CONFIRM=1)' : 'MODE: DRY RUN')
    console.log('Out of scope: meals, meal plan, nutrition phases, weight logs.\n')

    let total = 0
    for (const t of TARGETS) {
        const count = await t.model.countDocuments(scope)
        total += count
        console.log(`  ${t.label.padEnd(22)} ${String(count).padStart(5)}`)
    }
    console.log(`  ${'TOTAL'.padEnd(22)} ${String(total).padStart(5)}`)

    if (!confirm) {
        console.log('\nDRY RUN — nothing was changed. Re-run with WIPE_CONFIRM=1 to delete.')
        await mongoose.disconnect()
        return
    }
    if (total === 0) {
        console.log('\nAlready empty — nothing to do.')
        await mongoose.disconnect()
        return
    }

    // Back up every document before anything is removed.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.resolve(backupDir, `fitness-wipe-backup-${stamp}.json`)
    const backup: Record<string, unknown> = { email, takenAt: new Date().toISOString() }
    for (const t of TARGETS) backup[t.key] = await t.model.find(scope).lean()
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
    console.log(`\nBackup written to ${backupPath}`)

    const deleted: Record<string, number> = {}
    for (const t of TARGETS) {
        deleted[t.key] = (await t.model.deleteMany(scope)).deletedCount
    }
    console.log('\nDeleted:', deleted)
    console.log(
        `Total removed: ${Object.values(deleted).reduce((a, b) => a + b, 0)}. ` +
            `Restore with: RESTORE_FILE=${path.basename(backupPath)} npm run fitness:restore`
    )

    await mongoose.disconnect()
}

wipe().catch((err) => {
    console.error('Wipe failed:', err)
    process.exit(1)
})
