import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * One-off: moves plan entries to the simple shape — each carries the name and
 * macros of its meal, status is planned or eaten, and "Log more" food is an
 * `extra`. Library meals and weighed plates become planned meals; off-plan
 * food becomes an extra; skipped entries go.
 *
 * Also drops `recipes`, `batches` and `foodentries`, the short-lived copies
 * from the recipe/batch approach this replaces.
 *
 * DRY RUN by default; MIGRATE_CONFIRM=1 writes. Run `npm run nutrition:backup` first.
 */
const confirm = process.env.MIGRATE_CONFIRM === '1'

type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Macros = { calories: number; protein: number; carbs: number; fat: number }

const m = (x: Raw | undefined, k = 1): Macros => ({
    calories: (x?.calories ?? 0) * k,
    protein: (x?.protein ?? 0) * k,
    carbs: (x?.carbs ?? 0) * k,
    fat: (x?.fat ?? 0) * k,
})

async function run() {
    await connectDB()
    const db = mongoose.connection.db
    if (!db) throw new Error('No database handle')
    const entries = db.collection('mealplanentries')
    const meals = new Map((await db.collection('meals').find({}).toArray()).map((x) => [String(x._id), x]))

    const todo = await entries.find({ name: { $exists: false } }).toArray()
    const updates: { id: unknown; set: Raw }[] = []
    const removals: unknown[] = []
    let orphans = 0

    for (const e of todo) {
        const servings = e.servings ?? 1
        let set: Raw
        if (e.status === 'skipped') {
            removals.push(e._id)
            continue
        }
        if (e.meal) {
            const meal = meals.get(String(e.meal))
            if (!meal) {
                orphans++
                removals.push(e._id)
                continue
            }
            set = { name: meal.name, macros: m(meal.macros, servings), extra: false }
        } else if (e.adhoc) {
            set = { name: e.adhoc.name, macros: m(e.adhoc.macros, servings), extra: true }
        } else if (e.buffet) {
            const comps: Raw[] = e.buffet.components ?? []
            const total = comps.reduce(
                (a, c) => ({
                    calories: a.calories + (c.macros?.calories ?? 0),
                    protein: a.protein + (c.macros?.protein ?? 0),
                    carbs: a.carbs + (c.macros?.carbs ?? 0),
                    fat: a.fat + (c.macros?.fat ?? 0),
                }),
                m(undefined)
            )
            set = { name: e.buffet.name || comps.map((c) => c.name).join(' + ') || 'Meal', macros: total, extra: false }
        } else {
            removals.push(e._id)
            continue
        }
        set.status = e.status === 'eaten' ? 'eaten' : 'planned'
        updates.push({ id: e._id, set })
        console.log(`  ${e.date} ${e.slot.padEnd(9)} ${set.status.padEnd(7)} ${Math.round(set.macros.calories)} kcal  ${set.name}`)
    }

    console.log(
        `\n${updates.length} entr(ies) to convert, ${removals.length} to remove (${orphans} pointing at a deleted meal).`
    )
    const extraCollections = ['recipes', 'batches', 'foodentries']
    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name))
    for (const c of extraCollections) {
        if (existing.has(c)) console.log(`Collection "${c}": ${await db.collection(c).countDocuments()} doc(s) — to drop.`)
    }

    if (!confirm) {
        console.log('\nDry run — nothing written. Re-run with MIGRATE_CONFIRM=1 to write.')
    } else {
        for (const u of updates) {
            await entries.updateOne(
                { _id: u.id as never },
                { $set: u.set, $unset: { adhoc: '', buffet: '', servings: '', clientKey: '' } }
            )
        }
        if (removals.length) await entries.deleteMany({ _id: { $in: removals as never[] } })
        for (const c of extraCollections) if (existing.has(c)) await db.collection(c).drop()
        console.log('\nWritten.')
    }
    await mongoose.disconnect()
}

run().catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
})
