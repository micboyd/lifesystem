import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import mongoose, { Types } from 'mongoose'
import { connectDB } from '../config/db'
import User from '../models/User'
import ConditioningSession from '../models/ConditioningSession'
import ConditioningLog from '../models/ConditioningLog'
import FitnessPlanEntry from '../models/FitnessPlanEntry'
import TrainingPlan from '../models/TrainingPlan'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Empties one user's conditioning library — every ConditioningSession — and
 * tidies what pointed at it, the same way deleting a single session in the app
 * does:
 *
 *  - planner entries placing one of those sessions are deleted (they would
 *    otherwise point at nothing);
 *  - completion logs are kept but unlinked (`session: null`) — they hold a
 *    name/category snapshot, so history survives.
 *
 * Training plans are left alone. Any that link these sessions are listed so you
 * can re-import them (the importer recreates sessions by name).
 *
 * DRY RUN by default; set WIPE_CONFIRM=1 to delete. Everything removed is
 * written to a timestamped backup JSON first, keyed to match
 * restoreFitnessCleanup.ts ("conditioning", "planEntries"), so it can be put
 * back with:  RESTORE_FILE=<file> RESTORE_CATEGORIES=conditioning,planEntries
 * RESTORE_CONFIRM=1 npm run fitness:restore
 * (Restoring does not re-link logs; the backup's "unlinkedLogs" records which
 * log pointed at which session if you ever need to.)
 *
 * WIPE_EMAIL      whose library to clear (defaults to the seeded user).
 * WIPE_BACKUP_DIR where the backup lands (defaults to the server directory).
 */
const email = process.env.WIPE_EMAIL ?? 'michael_boyd@live.co.uk'
const confirm = process.env.WIPE_CONFIRM === '1'
const backupDir = process.env.WIPE_BACKUP_DIR ?? process.cwd()

async function wipe() {
    await connectDB()

    const user = await User.findOne({ email }, { email: 1 }).lean()
    if (!user) {
        console.error(`No user found with email: ${email}`)
        await mongoose.disconnect()
        process.exit(1)
    }
    const userId = user._id as Types.ObjectId

    // Say which database this is pointed at — the one thing worth checking
    // before a prod delete.
    const conn = mongoose.connection
    console.log(`Database: ${conn.host}/${conn.name}`)
    console.log(`Clearing the conditioning library for ${email}`)
    console.log(confirm ? 'MODE: DELETE (WIPE_CONFIRM=1)\n' : 'MODE: DRY RUN\n')

    const sessions = await ConditioningSession.find({ user: userId }).lean()
    const ids = sessions.map((s) => s._id)
    const entryFilter = { user: userId, session: { $in: ids } }
    const logFilter = { user: userId, session: { $in: ids } }

    const entryCount = await FitnessPlanEntry.countDocuments(entryFilter)
    const logCount = await ConditioningLog.countDocuments(logFilter)
    const plans = await TrainingPlan.find(
        { user: userId, 'items.item': { $in: ids } },
        { name: 1 }
    ).lean()

    console.log(`  Conditioning sessions   ${String(ids.length).padStart(5)}  (delete)`)
    console.log(`  Planner entries         ${String(entryCount).padStart(5)}  (delete)`)
    console.log(`  Conditioning logs       ${String(logCount).padStart(5)}  (keep, unlink)`)
    if (plans.length) {
        console.log(`\nTraining plans linking these sessions (left as-is — re-import to rebuild):`)
        for (const p of plans) console.log(`  - ${p.name}`)
    }

    if (!confirm) {
        console.log('\nDRY RUN — nothing was changed. Re-run with WIPE_CONFIRM=1 to delete.')
        await mongoose.disconnect()
        return
    }
    if (ids.length === 0) {
        console.log('\nLibrary already empty — nothing to do.')
        await mongoose.disconnect()
        return
    }

    // Back up everything before anything changes.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.resolve(backupDir, `conditioning-wipe-backup-${stamp}.json`)
    const backup = {
        email,
        takenAt: new Date().toISOString(),
        conditioning: sessions,
        planEntries: await FitnessPlanEntry.find(entryFilter).lean(),
        unlinkedLogs: (await ConditioningLog.find(logFilter, { session: 1 }).lean()).map((l) => ({
            _id: l._id,
            session: l.session,
        })),
    }
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2))
    console.log(`\nBackup written to ${backupPath}`)

    const entries = await FitnessPlanEntry.deleteMany(entryFilter)
    const logs = await ConditioningLog.updateMany(logFilter, { $set: { session: null } })
    const removed = await ConditioningSession.deleteMany({ user: userId, _id: { $in: ids } })

    console.log('\nDone:', {
        sessionsDeleted: removed.deletedCount,
        plannerEntriesDeleted: entries.deletedCount,
        logsUnlinked: logs.modifiedCount,
    })
    console.log(
        `Restore with: RESTORE_FILE=${path.basename(backupPath)} ` +
            'RESTORE_CATEGORIES=conditioning,planEntries RESTORE_CONFIRM=1 npm run fitness:restore'
    )

    await mongoose.disconnect()
}

wipe().catch((err) => {
    console.error('Wipe failed:', err)
    process.exit(1)
})
