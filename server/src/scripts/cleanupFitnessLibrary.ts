import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db'
import User from '../models/User'
import Exercise from '../models/Exercise'
import Workout, { IWorkoutExercise } from '../models/Workout'
import ConditioningSession from '../models/ConditioningSession'
import Mobility from '../models/Mobility'
import Recovery from '../models/Recovery'
import FitnessPlanEntry from '../models/FitnessPlanEntry'
import TrainingPlan from '../models/TrainingPlan'
import WorkoutLog from '../models/WorkoutLog'
import ConditioningLog from '../models/ConditioningLog'
import MobilityLog from '../models/MobilityLog'
import RecoveryLog from '../models/RecoveryLog'
import {
    EXERCISES_REMOVE_ALL,
    EXERCISES_KEEP_ONE,
    EXERCISE_REPOINT,
    WORKOUTS_REMOVE,
    CONDITIONING_REMOVE,
    MOBILITY_REMOVE,
    RECOVERY_REMOVE,
} from './fitnessCleanupList'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Removes the obsolete records identified by the fitness library audit — the
 * exercises, strength workouts, conditioning sessions, mobility routines and
 * recovery items superseded by the rebuilt prop/rugby/5K plan.
 *
 * DRY RUN by default: prints what it would delete, what still references those
 * records, and any listed name it could not find, then exits without writing.
 * Set CLEANUP_CONFIRM=1 to delete. Every matched document is written to a
 * timestamped backup JSON first, so a bad run can be restored with mongoimport.
 *
 * Whose library: CLEANUP_EMAIL (defaults to the seeded user).
 * Backup location: CLEANUP_BACKUP_DIR (defaults to the server directory).
 * Set CLEANUP_PRUNE_ORPHANS=1 to also delete planner entries and logs left
 * pointing at a deleted record. Off by default — the API already hides
 * unresolved planner entries, so they are dead weight rather than breakage.
 */
const email = process.env.CLEANUP_EMAIL ?? 'michael_boyd@live.co.uk'
const confirm = process.env.CLEANUP_CONFIRM === '1'
const pruneOrphans = process.env.CLEANUP_PRUNE_ORPHANS === '1'
const backupDir = process.env.CLEANUP_BACKUP_DIR ?? process.cwd()

type Doc = { _id: Types.ObjectId; name: string; createdAt?: Date }

/** Matched documents plus the listed names that found nothing. */
interface MatchResult {
    docs: Doc[]
    missing: string[]
}

/**
 * The slice of a Mongoose model this script needs. Declared structurally so one
 * lookup helper can serve five differently-typed library collections.
 */
interface LibraryModel {
    find(
        filter: Record<string, unknown>,
        projection: Record<string, 0 | 1>
    ): { lean(): Promise<unknown[]> }
}

/** Exact, trimmed name match — near-miss names in the list must not collide. */
async function matchByName(
    model: LibraryModel,
    userId: Types.ObjectId,
    names: string[]
): Promise<MatchResult> {
    const docs = (await model
        .find({ user: userId, name: { $in: names } }, { name: 1, createdAt: 1 })
        .lean()) as Doc[]
    const found = new Set(docs.map((d) => d.name))
    return { docs, missing: names.filter((n) => !found.has(n)) }
}

/**
 * For names kept in the library but duplicated: pick one survivor per name and
 * return the rest. The survivor is the record most referenced by workouts —
 * dropping the unreferenced twin keeps existing workouts intact — with the
 * oldest record as a tie-break.
 */
async function pickDuplicates(
    userId: Types.ObjectId,
    names: string[]
): Promise<{ remove: Doc[]; keep: Doc[]; missing: string[] }> {
    const { docs, missing } = await matchByName(Exercise as unknown as LibraryModel, userId, names)
    const refCounts = new Map<string, number>()
    const workouts = await Workout.find({ user: userId }, { exercises: 1 }).lean()
    for (const w of workouts) {
        for (const line of w.exercises ?? []) {
            const id = String(line.exercise)
            refCounts.set(id, (refCounts.get(id) ?? 0) + 1)
        }
    }

    const byName = new Map<string, Doc[]>()
    for (const d of docs) {
        const list = byName.get(d.name) ?? []
        list.push(d)
        byName.set(d.name, list)
    }

    const remove: Doc[] = []
    const keep: Doc[] = []
    for (const [, group] of byName) {
        const sorted = [...group].sort((a, b) => {
            const byRefs = (refCounts.get(String(b._id)) ?? 0) - (refCounts.get(String(a._id)) ?? 0)
            if (byRefs !== 0) return byRefs
            return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
        })
        keep.push(sorted[0])
        remove.push(...sorted.slice(1))
    }
    return { remove, keep, missing }
}

/**
 * Build removed-exercise-id -> surviving-exercise-id, covering both the
 * duplicate rows (twin of the same name) and the wording variants in
 * EXERCISE_REPOINT. Targets resolve to the record that survives the cleanup.
 */
function buildRepointMap(
    removedDocs: Doc[],
    dupeRemove: Doc[],
    dupeKeep: Doc[],
    survivorsByName: Map<string, Types.ObjectId>
): Map<string, Types.ObjectId> {
    const map = new Map<string, Types.ObjectId>()
    const keepByName = new Map(dupeKeep.map((d) => [d.name, d._id]))
    for (const d of dupeRemove) {
        const target = keepByName.get(d.name)
        if (target) map.set(String(d._id), target)
    }
    for (const d of removedDocs) {
        const targetName = EXERCISE_REPOINT[d.name]
        if (!targetName) continue
        const target = keepByName.get(targetName) ?? survivorsByName.get(targetName)
        if (target) map.set(String(d._id), target)
    }
    return map
}

function report(label: string, result: { docs: Doc[]; missing: string[] }) {
    const names = new Set(result.docs.map((d) => d.name))
    console.log(
        `\n${label}: ${result.docs.length} record(s) matched across ${names.size} name(s).`
    )
    if (result.missing.length) {
        console.log(`  ${result.missing.length} listed name(s) NOT found in the library:`)
        for (const n of result.missing) console.log(`    - ${n}`)
    }
    const dupes = [...names].filter(
        (n) => result.docs.filter((d) => d.name === n).length > 1
    )
    if (dupes.length) {
        console.log(`  ${dupes.length} name(s) matched more than one record:`)
        for (const n of dupes) {
            console.log(`    - ${n} (x${result.docs.filter((d) => d.name === n).length})`)
        }
    }
}

async function cleanup() {
    await connectDB()

    const user = await User.findOne({ email }, { email: 1 }).lean()
    if (!user) {
        console.error(`No user found with email: ${email}`)
        await mongoose.disconnect()
        process.exit(1)
    }
    const userId = user._id as Types.ObjectId
    console.log(`Cleaning fitness library for ${email}`)
    console.log(confirm ? 'MODE: DELETE (CLEANUP_CONFIRM=1)' : 'MODE: DRY RUN')

    // --- Match everything up front, before touching anything. ---
    const exercisesAll = await matchByName(Exercise as unknown as LibraryModel, userId, EXERCISES_REMOVE_ALL)
    const exercisesDupe = await pickDuplicates(userId, EXERCISES_KEEP_ONE)
    const workouts = await matchByName(Workout as unknown as LibraryModel, userId, WORKOUTS_REMOVE)
    const conditioning = await matchByName(
        ConditioningSession as unknown as LibraryModel,
        userId,
        CONDITIONING_REMOVE
    )
    // Mobility/recovery names are checked in their own collection AND in the
    // conditioning library, where sessions can carry a Mobility/Recovery category.
    const mobility = await matchByName(Mobility as unknown as LibraryModel, userId, MOBILITY_REMOVE)
    const mobilityInCond = await matchByName(
        ConditioningSession as unknown as LibraryModel,
        userId,
        MOBILITY_REMOVE
    )
    const recovery = await matchByName(Recovery as unknown as LibraryModel, userId, RECOVERY_REMOVE)
    const recoveryInCond = await matchByName(
        ConditioningSession as unknown as LibraryModel,
        userId,
        RECOVERY_REMOVE
    )

    report('Exercises (remove all records)', exercisesAll)
    report('Strength workouts', workouts)
    report('Conditioning sessions', conditioning)
    report('Mobility routines (Mobility library)', mobility)
    report('Mobility names found in the conditioning library', mobilityInCond)
    report('Recovery items (Recovery library)', recovery)
    report('Recovery names found in the conditioning library', recoveryInCond)

    console.log(
        `\nExercises (keep one of each duplicate): removing ${exercisesDupe.remove.length}, keeping ${exercisesDupe.keep.length}.`
    )
    for (const d of exercisesDupe.keep) console.log(`  KEEP:   "${d.name}" (${d._id})`)
    for (const d of exercisesDupe.remove) console.log(`  REMOVE: "${d.name}" (${d._id})`)
    if (exercisesDupe.missing.length) {
        console.log(`  NOT FOUND: ${exercisesDupe.missing.join(', ')}`)
    }

    const exerciseIds = [...exercisesAll.docs, ...exercisesDupe.remove].map((d) => d._id)
    const workoutIds = workouts.docs.map((d) => d._id)
    const sessionIds = [
        ...conditioning.docs,
        ...mobilityInCond.docs,
        ...recoveryInCond.docs,
    ].map((d) => d._id)
    const mobilityIds = mobility.docs.map((d) => d._id)
    const recoveryIds = recovery.docs.map((d) => d._id)

    // --- Re-point kept workouts off the exercises we're about to delete. ---
    const survivorsByName = new Map(
        (
            await Exercise.find({ user: userId, _id: { $nin: exerciseIds } }, { name: 1 }).lean()
        ).map((e) => [e.name, e._id as Types.ObjectId])
    )
    const removedNameById = new Map(
        [...exercisesAll.docs, ...exercisesDupe.remove].map((d) => [String(d._id), d.name])
    )
    const repoint = buildRepointMap(
        exercisesAll.docs,
        exercisesDupe.remove,
        exercisesDupe.keep,
        survivorsByName
    )

    const survivingWorkouts = await Workout.find(
        { user: userId, _id: { $nin: workoutIds }, 'exercises.exercise': { $in: exerciseIds } },
        { name: 1, exercises: 1 }
    ).lean()
    console.log(
        `\nKept workouts referencing a removed exercise: ${survivingWorkouts.length}`
    )
    const rewrites: { id: Types.ObjectId; exercises: IWorkoutExercise[] }[] = []
    let repointed = 0
    let stillDangling = 0
    for (const w of survivingWorkouts) {
        const lines = (w.exercises ?? []).map((l) => ({ ...l }))
        const changes: string[] = []
        for (const line of lines) {
            const fromName = removedNameById.get(String(line.exercise))
            if (!fromName) continue
            const target = repoint.get(String(line.exercise))
            if (target) {
                const toName =
                    [...survivorsByName.entries()].find(([, id]) => id.equals(target))?.[0] ??
                    exercisesDupe.keep.find((d) => d._id.equals(target))?.name ??
                    String(target)
                changes.push(`${fromName} -> ${toName}`)
                line.exercise = target
                repointed++
            } else {
                changes.push(`${fromName} -> (no target: line will dangle)`)
                stillDangling++
            }
        }
        console.log(`  "${w.name}": ${changes.join(', ')}`)
        rewrites.push({ id: w._id as Types.ObjectId, exercises: lines })

        // A re-point can land on an exercise the workout already lists. Both
        // lines are kept (they may prescribe different set schemes) but say so.
        const counts = new Map<string, number>()
        for (const l of lines) counts.set(String(l.exercise), (counts.get(String(l.exercise)) ?? 0) + 1)
        for (const [id, n] of counts) {
            if (n > 1) {
                const name =
                    [...survivorsByName.entries()].find(([, sid]) => String(sid) === id)?.[0] ?? id
                console.log(`      note: now lists "${name}" on ${n} lines`)
            }
        }
    }
    console.log(
        `  ${repointed} line(s) will be re-pointed; ${stillDangling} line(s) have no target.`
    )

    const planEntries = await FitnessPlanEntry.countDocuments({
        user: userId,
        $or: [
            { workout: { $in: workoutIds } },
            { session: { $in: sessionIds } },
            { mobility: { $in: mobilityIds } },
            { recovery: { $in: recoveryIds } },
        ],
    })
    const wLogs = await WorkoutLog.countDocuments({ user: userId, workout: { $in: workoutIds } })
    const cLogs = await ConditioningLog.countDocuments({
        user: userId,
        session: { $in: sessionIds },
    })
    const mLogs = await MobilityLog.countDocuments({
        user: userId,
        mobility: { $in: mobilityIds },
    })
    const rLogs = await RecoveryLog.countDocuments({
        user: userId,
        recovery: { $in: recoveryIds },
    })
    const allIds = [...workoutIds, ...sessionIds, ...mobilityIds, ...recoveryIds]
    const plans = await TrainingPlan.find(
        { user: userId, $or: [{ 'items.item': { $in: allIds } }, { 'schedule.item': { $in: allIds } }] },
        { name: 1 }
    ).lean()

    console.log('\nReferences to the records being removed:')
    console.log(`  Planner entries: ${planEntries}`)
    console.log(`  Completed logs:  workout ${wLogs}, conditioning ${cLogs}, mobility ${mLogs}, recovery ${rLogs}`)
    console.log(`  Training plans:  ${plans.length}${plans.length ? ' — ' + plans.map((p) => p.name).join(', ') : ''}`)
    console.log(
        pruneOrphans
            ? '  Planner entries and logs above WILL be deleted (CLEANUP_PRUNE_ORPHANS=1).'
            : '  Planner entries and logs above will be LEFT IN PLACE (set CLEANUP_PRUNE_ORPHANS=1 to remove them).'
    )
    console.log('  Training plans keep a name label per item, so they still read correctly.')

    const total =
        exerciseIds.length +
        workoutIds.length +
        sessionIds.length +
        mobilityIds.length +
        recoveryIds.length
    console.log(`\nTOTAL records to delete: ${total}`)
    console.log(
        `  exercises ${exerciseIds.length}, workouts ${workoutIds.length}, conditioning ${sessionIds.length}, mobility ${mobilityIds.length}, recovery ${recoveryIds.length}`
    )

    if (!confirm) {
        console.log('\nDRY RUN — nothing was changed. Re-run with CLEANUP_CONFIRM=1 to delete.')
        await mongoose.disconnect()
        return
    }

    // --- Back up the full documents before deleting anything. ---
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.resolve(backupDir, `fitness-cleanup-backup-${stamp}.json`)
    const backup = {
        email,
        takenAt: new Date().toISOString(),
        exercises: await Exercise.find({ _id: { $in: exerciseIds } }).lean(),
        workouts: await Workout.find({ _id: { $in: workoutIds } }).lean(),
        conditioning: await ConditioningSession.find({ _id: { $in: sessionIds } }).lean(),
        mobility: await Mobility.find({ _id: { $in: mobilityIds } }).lean(),
        recovery: await Recovery.find({ _id: { $in: recoveryIds } }).lean(),
        // Pre-rewrite copies of the kept workouts, so a bad re-point is undoable.
        repointedWorkouts: await Workout.find({
            _id: { $in: rewrites.map((r) => r.id) },
        }).lean(),
        // Completion history that CLEANUP_PRUNE_ORPHANS would delete. Backed up
        // unconditionally: unlike the library records these cannot be rebuilt
        // from the plan, so losing them to a mis-set flag is unrecoverable.
        workoutLogs: await WorkoutLog.find({ user: userId, workout: { $in: workoutIds } }).lean(),
        conditioningLogs: await ConditioningLog.find({
            user: userId,
            session: { $in: sessionIds },
        }).lean(),
        mobilityLogs: await MobilityLog.find({
            user: userId,
            mobility: { $in: mobilityIds },
        }).lean(),
        recoveryLogs: await RecoveryLog.find({
            user: userId,
            recovery: { $in: recoveryIds },
        }).lean(),
        planEntries: await FitnessPlanEntry.find({
            user: userId,
            $or: [
                { workout: { $in: workoutIds } },
                { session: { $in: sessionIds } },
                { mobility: { $in: mobilityIds } },
                { recovery: { $in: recoveryIds } },
            ],
        }).lean(),
    }
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
    console.log(`\nBackup written to ${backupPath}`)

    // Re-point first: the kept workouts must stop referencing the removed
    // exercises before those records go, so no window leaves a dangling line.
    if (rewrites.length) {
        await Workout.bulkWrite(
            rewrites.map((r) => ({
                updateOne: { filter: { _id: r.id }, update: { $set: { exercises: r.exercises } } },
            }))
        )
        console.log(`Re-pointed exercise lines in ${rewrites.length} workout(s).`)
    }

    const results = {
        exercises: (await Exercise.deleteMany({ _id: { $in: exerciseIds } })).deletedCount,
        workouts: (await Workout.deleteMany({ _id: { $in: workoutIds } })).deletedCount,
        conditioning: (await ConditioningSession.deleteMany({ _id: { $in: sessionIds } }))
            .deletedCount,
        mobility: (await Mobility.deleteMany({ _id: { $in: mobilityIds } })).deletedCount,
        recovery: (await Recovery.deleteMany({ _id: { $in: recoveryIds } })).deletedCount,
    }
    console.log('\nDeleted:', results)

    if (pruneOrphans) {
        const orphanEntries = await FitnessPlanEntry.deleteMany({
            user: userId,
            $or: [
                { workout: { $in: workoutIds } },
                { session: { $in: sessionIds } },
                { mobility: { $in: mobilityIds } },
                { recovery: { $in: recoveryIds } },
            ],
        })
        const orphanLogs = {
            workout: (await WorkoutLog.deleteMany({ user: userId, workout: { $in: workoutIds } }))
                .deletedCount,
            conditioning: (
                await ConditioningLog.deleteMany({ user: userId, session: { $in: sessionIds } })
            ).deletedCount,
            mobility: (
                await MobilityLog.deleteMany({ user: userId, mobility: { $in: mobilityIds } })
            ).deletedCount,
            recovery: (
                await RecoveryLog.deleteMany({ user: userId, recovery: { $in: recoveryIds } })
            ).deletedCount,
        }
        console.log('Pruned planner entries:', orphanEntries.deletedCount)
        console.log('Pruned logs:', orphanLogs)
    }

    await mongoose.disconnect()
}

cleanup().catch((err) => {
    console.error('Cleanup failed:', err)
    process.exit(1)
})
