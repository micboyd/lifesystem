import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * Dumps every nutrition collection, for all users, to one timestamped Extended
 * JSON file — ObjectIds and dates survive, so it can be restored exactly with
 * `mongoimport` per collection or a short script.
 *
 * Read-only. Run before the nutrition simplification migration, which deletes
 * the meal-prep collections.
 *
 * Output directory: BACKUP_DIR (defaults to <repo>/backups, which is gitignored).
 */
const COLLECTIONS = [
    'meals',
    'mealplanentries',
    'foods',
    'preprecipes',
    'foodbatches',
    'stockmovements',
    'prepcontainers',
    'nutritionphases',
    'dailyenergies',
    'progresscheckins',
    'progressphotos',
    'weightlogs',
]

const backupDir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), '../backups')

async function backup() {
    await connectDB()
    const db = mongoose.connection.db
    if (!db) throw new Error('No database handle')

    const existing = new Set((await db.listCollections().toArray()).map((c) => c.name))
    const dump: Record<string, unknown[]> = {}
    for (const name of COLLECTIONS) {
        dump[name] = existing.has(name) ? await db.collection(name).find({}).toArray() : []
        console.log(`${name.padEnd(18)} ${dump[name].length}`)
    }

    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(backupDir, `nutrition-backup-${stamp}.json`)
    fs.writeFileSync(file, mongoose.mongo.BSON.EJSON.stringify(dump, undefined, 2, { relaxed: false }))
    console.log(`\nWrote ${file}`)

    await mongoose.disconnect()
}

backup().catch((err) => {
    console.error('Backup failed:', err)
    process.exit(1)
})
