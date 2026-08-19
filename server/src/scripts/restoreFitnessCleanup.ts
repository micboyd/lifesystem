import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
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
 * Puts back what cleanupFitnessLibrary.ts removed, from the backup JSON it
 * wrote. Documents go back with their original _ids, so every reference to
 * them — planner entries, training plan items, workout exercise lines —
 * resolves again without further repair.
 *
 * DRY RUN by default. Set RESTORE_CONFIRM=1 to write.
 *
 * RESTORE_FILE       path to the backup JSON (required).
 * RESTORE_CATEGORIES comma-separated subset, e.g. "conditioning,recovery".
 *                    Defaults to everything the backup holds except
 *                    "repointedWorkouts", which is opt-in.
 * RESTORE_NAMES      comma-separated exact names, to bring back just a few.
 *
 */
const file = process.env.RESTORE_FILE
const confirm = process.env.RESTORE_CONFIRM === '1'
const nameFilter = process.env.RESTORE_NAMES?.split(',').map((n) => n.trim()).filter(Boolean)

const LIBRARY_CATEGORIES = [
    'exercises',
    'workouts',
    'conditioning',
    'mobility',
    'recovery',
] as const
const LOG_CATEGORIES = [
    'workoutLogs',
    'conditioningLogs',
    'mobilityLogs',
    'recoveryLogs',
] as const
/**
 * Restored by default. Everything a wipe or cleanup removed goes back, since
 * putting a deleted record where it was cannot clobber anything.
 */
const DEFAULT_CATEGORIES = [
    ...LIBRARY_CATEGORIES,
    ...LOG_CATEGORIES,
    'planEntries',
    'planNotes',
    'trainingPlans',
] as const
/**
 * Opt-in only: repointedWorkouts overwrites workouts that still exist, reverting
 * the exercise re-pointing. Meaningful alongside a full exercise restore, but on
 * its own it re-creates the dangling lines the re-point fixed.
 */
const ALL_CATEGORIES = [...DEFAULT_CATEGORIES, 'repointedWorkouts'] as const
type Category = (typeof ALL_CATEGORIES)[number]

/**
 * The slice of a Mongoose model this script needs, declared structurally so one
 * lookup table can hold six differently-typed collections.
 */
interface RestorableModel {
    find(
        filter: Record<string, unknown>,
        projection: Record<string, 0 | 1>
    ): { lean(): Promise<{ _id: unknown }[]> }
    insertMany(docs: unknown[], options: { ordered: boolean }): Promise<unknown[]>
}

const MODELS: Record<Category, RestorableModel> = {
    exercises: Exercise as unknown as RestorableModel,
    workouts: Workout as unknown as RestorableModel,
    conditioning: ConditioningSession as unknown as RestorableModel,
    mobility: Mobility as unknown as RestorableModel,
    recovery: Recovery as unknown as RestorableModel,
    workoutLogs: WorkoutLog as unknown as RestorableModel,
    conditioningLogs: ConditioningLog as unknown as RestorableModel,
    mobilityLogs: MobilityLog as unknown as RestorableModel,
    recoveryLogs: RecoveryLog as unknown as RestorableModel,
    planEntries: FitnessPlanEntry as unknown as RestorableModel,
    planNotes: FitnessPlanNote as unknown as RestorableModel,
    trainingPlans: TrainingPlan as unknown as RestorableModel,
    repointedWorkouts: Workout as unknown as RestorableModel,
}

interface BackupDoc {
    _id: string
    name?: string
}

async function restore() {
    if (!file) {
        console.error('Set RESTORE_FILE to the backup JSON path.')
        process.exit(1)
    }
    const backup = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')) as Record<
        string,
        BackupDoc[] | string
    >
    console.log(`Backup: ${file}`)
    console.log(`  taken ${backup.takenAt as string} for ${backup.email as string}`)

    const requested = process.env.RESTORE_CATEGORIES?.split(',').map((c) => c.trim()) ?? [
        ...DEFAULT_CATEGORIES,
    ]
    const categories = requested.filter((c): c is Category =>
        (ALL_CATEGORIES as readonly string[]).includes(c)
    )
    const unknown = requested.filter((c) => !(ALL_CATEGORIES as readonly string[]).includes(c))
    if (unknown.length) console.log(`  ignoring unknown category: ${unknown.join(', ')}`)

    await connectDB()
    console.log(confirm ? 'MODE: RESTORE (RESTORE_CONFIRM=1)' : 'MODE: DRY RUN')

    let totalInserted = 0
    let totalPresent = 0
    for (const category of categories) {
        const docs = (backup[category] as BackupDoc[] | undefined) ?? []
        const wanted = nameFilter
            ? docs.filter((d) => d.name && nameFilter.includes(d.name))
            : docs
        if (!wanted.length) {
            console.log(`\n${category}: nothing to restore.`)
            continue
        }

        const model = MODELS[category]
        const ids = wanted.map((d) => d._id)
        const existing = await model.find({ _id: { $in: ids } }, { _id: 1 }).lean()
        const present = new Set(existing.map((e) => String(e._id)))
        const missing = wanted.filter((d) => !present.has(String(d._id)))

        console.log(
            `\n${category}: ${wanted.length} in backup — ${missing.length} to restore, ${present.size} already present.`
        )
        for (const d of missing.slice(0, 10)) console.log(`  + ${d.name ?? d._id}`)
        if (missing.length > 10) console.log(`  … and ${missing.length - 10} more`)

        totalPresent += present.size
        if (!confirm || !missing.length) {
            totalInserted += missing.length
            continue
        }

        // insertMany with the original _ids; ordered:false so one clash can't
        // abort the rest of the batch.
        const res = await model.insertMany(missing, { ordered: false })
        console.log(`  restored ${res.length}`)
        totalInserted += res.length
    }

    // repointedWorkouts holds pre-cleanup copies of workouts that still exist,
    // so they need overwriting rather than inserting.
    if (categories.includes('repointedWorkouts') && confirm) {
        const docs = (backup.repointedWorkouts as BackupDoc[] | undefined) ?? []
        for (const d of docs) {
            await Workout.replaceOne({ _id: d._id }, d as never, { upsert: true })
        }
        console.log(`\nrepointedWorkouts: reverted ${docs.length} workout(s) to pre-cleanup state.`)
    }

    console.log(
        confirm
            ? `\nRestored ${totalInserted} record(s). ${totalPresent} were already present.`
            : `\nDRY RUN — nothing written. ${totalInserted} record(s) would be restored. Re-run with RESTORE_CONFIRM=1.`
    )
    await mongoose.disconnect()
}

restore().catch((err) => {
    console.error('Restore failed:', err)
    process.exit(1)
})
