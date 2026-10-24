import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { connectDB } from '../config/db'
import { monthlyFromWeekly, isMonday } from '../lib/rowAmounts'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })

/**
 * One-off: turns month-sliced weekly budgets into true weekly budgets.
 *
 * For every budgeted row with budgetType 'weekly' and no weeklyAmount yet:
 *   • weeklyAmount = recurringAmount × 12 ÷ 52, to the nearest £
 *   • carryFrom    = CARRY_FROM (default 2026-10-19)
 *   • recurringAmount becomes weekly × 52 ÷ 12; months before the carry month
 *     keep the old figure via a pastAmounts boundary.
 *
 * Daily budgets are listed but left alone.
 *
 * DRY RUN by default; MIGRATE_CONFIRM=1 writes (after backing up every
 * financerows document to BACKUP_DIR, default <repo>/backups).
 */
const confirm = process.env.MIGRATE_CONFIRM === '1'
const carryFrom = process.env.CARRY_FROM ?? '2026-10-19'
const backupDir = process.env.BACKUP_DIR ?? path.resolve(process.cwd(), '../backups')

async function run() {
    if (!isMonday(carryFrom)) throw new Error(`CARRY_FROM must be a Monday, got ${carryFrom}`)
    const carryMonth = carryFrom.slice(0, 7)

    await connectDB()
    const db = mongoose.connection.db
    if (!db) throw new Error('No database handle')
    const rows = db.collection('financerows')

    const budgeted = await rows.find({ budgeted: true }).toArray()
    const todo = budgeted.filter((r) => r.budgetType === 'weekly' && r.weeklyAmount == null)
    const daily = budgeted.filter((r) => r.budgetType === 'daily')

    console.log(`Carry from ${carryFrom}\n`)
    console.log('Weekly budgets to convert:')
    const updates = todo.map((r) => {
        const monthly: number = r.recurringAmount ?? 0
        const weekly = Math.round((monthly * 12) / 52)
        const newMonthly = monthlyFromWeekly(weekly)
        const pastAmounts = (r.pastAmounts ?? []).filter((p: { beforeMonth: string }) => p.beforeMonth <= carryMonth)
        if (newMonthly !== monthly) pastAmounts.push({ beforeMonth: carryMonth, amount: monthly })
        console.log(`  ${String(r.name).padEnd(24)} £${monthly}/month → £${weekly}/week (£${newMonthly}/month)`)
        return {
            id: r._id,
            set: { weeklyAmount: weekly, pastWeeklyAmounts: [], carryFrom, recurringAmount: newMonthly, pastAmounts },
        }
    })
    if (!todo.length) console.log('  (none)')

    console.log('\nDaily budgets (left as they are):')
    for (const r of daily) console.log(`  ${String(r.name).padEnd(24)} £${r.recurringAmount ?? 0}/month`)
    if (!daily.length) console.log('  (none)')

    if (!confirm) {
        console.log('\nDry run — nothing written. Re-run with MIGRATE_CONFIRM=1 to apply.')
    } else if (updates.length) {
        fs.mkdirSync(backupDir, { recursive: true })
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const file = path.join(backupDir, `financerows-backup-${stamp}.json`)
        const all = await rows.find({}).toArray()
        fs.writeFileSync(file, mongoose.mongo.BSON.EJSON.stringify(all, undefined, 2, { relaxed: false }))
        console.log(`\nBacked up ${all.length} rows to ${file}`)
        for (const u of updates) await rows.updateOne({ _id: u.id }, { $set: u.set })
        console.log(`Converted ${updates.length} weekly budget(s).`)
    }

    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
