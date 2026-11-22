import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Meals a nutrition plan put on the planner whose plan has since been deleted
 * (before deleting a plan took its meals with it, 2026-11-21). Still-planned
 * ones are removed; eaten/skipped ones stay but lose the dead plan link.
 *
 * Dry run by default; pass --apply. Back up first (`npm run nutrition:backup`).
 */
async function run() {
    const apply = process.argv.includes('--apply')
    await connectDB()
    const db = mongoose.connection.db!
    const entries = db.collection('mealplanentries')
    const live = new Set((await db.collection('nutritionphases').find({}, { projection: { _id: 1 } }).toArray()).map((p) => String(p._id)))
    const linked = await entries.find({ plan: { $exists: true, $ne: null } }).sort({ date: 1 }).toArray()
    const orphans = linked.filter((e) => !live.has(String(e.plan)))
    const toDelete = orphans.filter((e) => e.status === 'planned' && !e.extra)
    const toUnlink = orphans.filter((e) => !toDelete.includes(e))

    const byPlan = new Map<string, typeof orphans>()
    for (const e of orphans) byPlan.set(String(e.plan), [...(byPlan.get(String(e.plan)) ?? []), e])
    for (const [plan, rows] of byPlan) {
        console.log(`Deleted plan ${plan}: ${rows.length} meals, ${rows[0].date} → ${rows[rows.length - 1].date}`)
        for (const e of rows) console.log(`  ${e.date} ${String(e.slot).padEnd(9)} ${e.name} (${e.status})`)
    }
    console.log(`\n${toDelete.length} still planned → remove · ${toUnlink.length} eaten/skipped → keep, unlink`)
    if (apply) {
        const { deletedCount } = await entries.deleteMany({ _id: { $in: toDelete.map((e) => e._id) } })
        const { modifiedCount } = await entries.updateMany({ _id: { $in: toUnlink.map((e) => e._id) } }, { $unset: { plan: 1 } })
        console.log(`Deleted ${deletedCount}, unlinked ${modifiedCount}`)
    } else console.log('Dry run — pass --apply')
    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
