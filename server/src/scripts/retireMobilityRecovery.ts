import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { connectDB } from '../config/db'
dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Tidy the references left behind when Mobility & Recovery were removed from
 * the fitness module.
 *
 * Deletes planner entries of those kinds (the planner no longer shows them) and
 * strips them from saved training plans — their linked items, schedule rows,
 * weekly-template columns and weekly-use notes — so no plan holds a kind the
 * models no longer accept. The old `mobilities`, `recoveries` and `recoverylogs`
 * collections are left in place, unread.
 *
 *   npm run retire:mobility --prefix server
 */
async function run() {
    await connectDB()
    const db = mongoose.connection.db!
    const gone = { $in: ['mobility', 'recovery'] }

    const entries = await db.collection('fitnessplanentries').deleteMany({ kind: gone })
    await db
        .collection('fitnessplanentries')
        .updateMany({}, { $unset: { mobility: '', recovery: '', done: '' } })

    const plans = db.collection('trainingplans')
    const a = await plans.updateMany({}, {
        $pull: { items: { kind: gone }, schedule: { kind: gone } },
        $unset: { mobilityUse: '', recoveryUse: '' },
    } as never)
    const b = await plans.updateMany({ 'weeklyTemplate.0': { $exists: true } }, {
        $unset: { 'weeklyTemplate.$[].mobility': '', 'weeklyTemplate.$[].recovery': '' },
    } as never)
    console.log(
        `Planner: ${entries.deletedCount} entries removed; plans: ${a.modifiedCount} cleaned, ${b.modifiedCount} weekly templates`
    )

    await mongoose.disconnect()
}

run().catch((err) => {
    console.error('Cleanup failed:', err)
    process.exit(1)
})
