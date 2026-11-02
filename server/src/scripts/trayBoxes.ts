import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
import Meal, { IBoxPart } from '../models/Meal'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * One-off (2026-11-02): trays get "In each box" — what to weigh into a box.
 * Cooked rice (kept apart) is the tray's rice ÷ boxes; the rest of the tray
 * is estimated at 70% of its raw weight ÷ boxes, marked approx until weighed.
 * Trays that already have box parts are left alone.
 *
 * Dry run by default; pass --apply to write.
 */
const YIELD = 0.7
const to5 = (g: number) => Math.round(g / 5) * 5

async function run() {
    const apply = process.argv.includes('--apply')
    await connectDB()
    const trays = await Meal.find({ batchOf: { $gte: 2 } }).sort({ order: 1 })
    for (const t of trays) {
        if (t.box?.length) {
            console.log(`${t.name.padEnd(32)} already has box parts`)
            continue
        }
        const n = t.batchOf!
        const rice = t.ingredients.filter((i) => /^rice/i.test(i.name))
        const raw = t.ingredients.filter((i) => !/^rice/i.test(i.name)).reduce((a, i) => a + i.grams, 0)
        const box: IBoxPart[] = [
            { name: 'Tray, cooked', grams: to5((raw * YIELD) / n), approx: true },
            ...rice.map((r) => ({ name: r.name, grams: to5(r.grams / n) })),
        ].filter((p) => p.grams > 0)
        console.log(`${t.name.padEnd(32)} ${box.map((p) => `${p.approx ? '~' : ''}${p.grams} g ${p.name}`).join(' + ')}`)
        if (apply) await Meal.updateOne({ _id: t._id }, { $set: { box } })
    }
    if (!apply) console.log('\nDry run — pass --apply to write')
    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
