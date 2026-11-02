import { useEffect, useMemo, useState } from 'react'
import { useDataVersion } from '../../context/DataSyncContext'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
    listBudgetTopUps,
    listCarryHistory,
} from '../../services/finances'
import { monthOf, carryInByRow } from '../../lib/budget'
import { spendSummary, type MonthBudgetData, type SpendSummary } from '../../lib/budgetDiscipline'
import type { FinanceGroup, FinanceRow } from '../../types'

export interface BudgetToday {
    loading: boolean
    summary: SpendSummary
    /** Today is excluded, so there's no allowance — not a £0 one. */
    dayOff: boolean
}

/**
 * What's safe to spend on `date`, pooled across every tracked budget through the
 * shared engine — so the dashboard agrees with Quick Log and the Budgets page.
 */
export function useBudgetToday(date: string): BudgetToday {
    const month = monthOf(date)
    const budgetVersion = useDataVersion('budget')
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [data, setData] = useState<MonthBudgetData>({ entries: [], spends: [], excluded: new Set() })
    // Derived loading — avoids a synchronous setState inside the fetch effect.
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const key = `${month}:${budgetVersion}`

    useEffect(() => {
        let active = true
        Promise.all([
            listGroups(),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
            listBudgetExclusions(month),
            listBudgetTopUps(month),
            listCarryHistory(month),
        ])
            .then(([g, r, e, s, x, t, history]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setData({
                    entries: e,
                    spends: s,
                    excluded: new Set(x.map((d) => d.date)),
                    topUps: t,
                    carryIn: carryInByRow(r, month, history),
                })
            })
            .finally(() => active && setLoadedKey(key))
        return () => {
            active = false
        }
    }, [month, key])

    const summary = useMemo(() => spendSummary(groups, rows, data, date), [groups, rows, data, date])
    return { loading: loadedKey !== key, summary, dayOff: data.excluded.has(date) }
}
