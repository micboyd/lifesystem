import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FinanceGroup from '../models/FinanceGroup'
import FinanceRow from '../models/FinanceRow'
import FinancePot from '../models/FinancePot'
import FinanceEntry from '../models/FinanceEntry'
import FinancePaid from '../models/FinancePaid'
import FinanceSubItem from '../models/FinanceSubItem'
import BudgetSpend from '../models/BudgetSpend'
import BudgetTopUp from '../models/BudgetTopUp'
import BudgetExclusion from '../models/BudgetExclusion'
import ExclusionBudget from '../models/ExclusionBudget'
import StarlingExclusion from '../models/StarlingExclusion'
import SavingsTarget from '../models/SavingsTarget'

/**
 * Everything that makes up the user's finance plan: the monthly sheet, the
 * budgets hanging off its rows, and the savings plans. Bank-side data (the
 * Starling statement cache, good/bad reviews, event unlinks) is left alone —
 * it comes from the bank, not from the plan.
 */
const COLLECTIONS = {
    groups: FinanceGroup,
    pots: FinancePot,
    rows: FinanceRow,
    entries: FinanceEntry,
    paid: FinancePaid,
    subItems: FinanceSubItem,
    budgetSpends: BudgetSpend,
    budgetTopUps: BudgetTopUp,
    budgetExclusions: BudgetExclusion,
    exclusionBudgets: ExclusionBudget,
    starlingExclusions: StarlingExclusion,
    savingsTargets: SavingsTarget,
} as const

type Key = keyof typeof COLLECTIONS

/**
 * POST /api/finances/clear-all — wipe the finance plan back to a blank sheet.
 * Needs `{ confirm: 'CLEAR' }` so a stray request can't do it. Responds with a
 * copy of everything removed, which the client saves as a backup file.
 */
export async function clearAllFinances(req: AuthRequest, res: Response) {
    if (req.body?.confirm !== 'CLEAR') {
        res.status(400).json({ message: 'Type CLEAR to confirm.' })
        return
    }
    const user = req.userId!
    const keys = Object.keys(COLLECTIONS) as Key[]

    // Read first so the backup holds exactly what is about to go.
    const docs = await Promise.all(keys.map((k) => (COLLECTIONS[k] as typeof FinanceGroup).find({ user }).lean()))
    const backup = Object.fromEntries(keys.map((k, i) => [k, docs[i]])) as Record<Key, unknown[]>

    const results = await Promise.all(keys.map((k) => (COLLECTIONS[k] as typeof FinanceGroup).deleteMany({ user })))
    const removed = Object.fromEntries(keys.map((k, i) => [k, results[i].deletedCount ?? 0])) as Record<Key, number>

    res.json({
        message: 'Finances cleared',
        data: { removed, backup: { exportedAt: new Date().toISOString(), ...backup } },
    })
}
