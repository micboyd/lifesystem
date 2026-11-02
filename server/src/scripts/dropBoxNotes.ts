import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Batches and boxes are gone from Nutrition (2026-11-01): a batch is now a
 * calculator that saves an ordinary meal. This removes the "eating from this
 * box" notes left on the plan — they have no macros, so they'd show as empty
 * meals. Eaten plates keep their name and macros and are left alone.
 *
 * Dry run by default; pass --apply to delete. Back up first
 * (`npm run nutrition:backup`).
 */
async function run() {
    const apply = process.argv.includes('--apply')
    await connectDB()
    const entries = mongoose.connection.db!.collection('mealplanentries')
    const filter = { box: { $exists: true, $ne: null }, status: { $ne: 'eaten' } }
    const notes = await entries.find(filter).sort({ date: 1 }).toArray()
    for (const n of notes) console.log(`${n.date} ${String(n.slot).padEnd(9)} ${n.name} (${n.status})`)
    console.log(`\n${notes.length} box note(s)`)
    if (apply && notes.length) {
        const { deletedCount } = await entries.deleteMany(filter)
        console.log(`Deleted ${deletedCount}`)
    } else if (notes.length) console.log('Dry run — pass --apply to delete')
    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
