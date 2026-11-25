import { recurringAmountForMonth, weeklyAmountForWeek, monthlyFromWeekly } from './rowAmounts'

/**
 * Finance plan import.
 *
 * A plan document says what each month should look like from a given month
 * onwards: which groups exist, what every row in them costs, which rows are
 * budgets and which rows stop. Groups and rows are matched by name (case and
 * surrounding spaces ignored), so re-importing a revised plan updates in place
 * rather than duplicating. Changes always apply "from this month onwards":
 * earlier months keep the amounts they showed.
 *
 * `planFinanceImport` is pure — it reads the current state and returns the
 * writes to make plus a summary — so the same call powers the preview and the
 * real import, and an invalid document is rejected before anything is written.
 */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export type GroupType = 'income' | 'expense' | 'savings'
export type BudgetType = 'daily' | 'weekly'

export interface PlanPastAmount {
    beforeMonth: string
    amount?: number
}
export interface PlanPastWeekly {
    beforeWeek: string
    amount: number
}

/** The slice of a stored group the planner reads. */
export interface ExistingGroup {
    _id: string
    name: string
    type: GroupType
    order: number
    startMonth?: string | null
    endMonth?: string | null
    skipMonths?: string[]
}

/** The slice of a stored row the planner reads. */
export interface ExistingRow {
    _id: string
    group: string
    name: string
    order: number
    recurring?: boolean
    month?: string | null
    recurringAmount?: number
    pastAmounts?: PlanPastAmount[]
    startMonth?: string | null
    endMonth?: string | null
    skipMonths?: string[]
    budgeted?: boolean
    budgetType?: BudgetType | null
    weeklyAmount?: number | null
    pastWeeklyAmounts?: PlanPastWeekly[]
    pot?: string | null
}

export interface ExistingPot {
    _id: string
    group: string
    name: string
}

export interface ExistingEntry {
    row: string
    month: string
    amount: number
}

/** A reference to a group: an existing id, or one created earlier in the same import. */
export type GroupRef = { id: string } | { newIndex: number }
export type PotRef = { id: string } | { newIndex: number } | null

export type ImportOp =
    | { kind: 'createGroup'; index: number; name: string; type: GroupType; startMonth: string | null; order: number }
    | { kind: 'updateGroup'; id: string; set: Record<string, unknown> }
    | { kind: 'createPot'; index: number; group: GroupRef; name: string; order: number }
    | {
          kind: 'createRow'
          group: GroupRef
          pot: PotRef
          name: string
          order: number
          recurring: boolean
          month: string | null
          startMonth: string | null
          recurringAmount: number
          budgeted: boolean
          budgetType: BudgetType | null
          weeklyAmount: number | null
      }
    | { kind: 'updateRow'; id: string; set: Record<string, unknown> }
    | { kind: 'clearEntry'; row: string; month: string }

export type ChangeAction = 'add' | 'change' | 'same' | 'end' | 'one-off' | 'reopen' | 'missing'

export interface ImportChange {
    group: string
    row: string
    action: ChangeAction
    /** Monthly amount the month showed before the import (where there was one). */
    from?: number
    /** Monthly amount the month shows after it. */
    to?: number
    /** Weekly budgets: £ per week after the import. */
    weekly?: number
    note?: string
}

export interface ImportSummary {
    month: string
    changes: ImportChange[]
    /** Rows already in the sheet that the plan doesn't mention — left exactly as they are. */
    untouched: { group: string; row: string; amount: number }[]
    groupsCreated: string[]
    totals: { income: number; expense: number; savings: number; leftOver: number }
    warnings: string[]
}

export interface ImportPlan {
    errors: string[]
    ops: ImportOp[]
    summary: ImportSummary
}

// ── Small helpers ─────────────────────────────────────────────────────────────

const key = (s: string) => s.trim().toLowerCase()
const round2 = (n: number) => Math.round(n * 100) / 100

export function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function ymd(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** The Monday of the week holding the 1st of `month` — where a weekly change takes effect. */
export function firstWeekOf(month: string): string {
    const d = new Date(`${month}-01T00:00:00Z`)
    const back = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - back)
    return ymd(d)
}

function prevWeek(week: string): string {
    const d = new Date(`${week}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 7)
    return ymd(d)
}

function inWindow(
    item: { startMonth?: string | null; endMonth?: string | null; skipMonths?: string[] },
    month: string
): boolean {
    if (item.startMonth && month < item.startMonth) return false
    if (item.endMonth && month > item.endMonth) return false
    return !(item.skipMonths ?? []).includes(month)
}

function rowVisible(row: ExistingRow, month: string): boolean {
    if (row.recurring === false) return row.month === month
    return inWindow(row, month)
}

function obj(v: unknown): Record<string, unknown> | null {
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null
}

function money(v: unknown): number | null | 'bad' {
    if (v === undefined || v === null) return null
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 'bad'
    return round2(v)
}

/** "from this month onwards" for a monthly amount: keep what earlier months showed. */
function onwardMonthly(row: ExistingRow, month: string, amount: number): PlanPastAmount[] {
    const prev = recurringAmountForMonth(row, addMonths(month, -1))
    const kept = (row.pastAmounts ?? []).filter((p) => p.beforeMonth <= month)
    // A row that only starts this month has no earlier months to protect.
    const startsHere = row.startMonth && row.startMonth >= month
    if (!startsHere && prev !== amount) kept.push({ beforeMonth: month, amount: prev })
    return kept
}

/** The same for a weekly budget, from the week holding the 1st. */
function onwardWeekly(row: ExistingRow, week: string, weekly: number): PlanPastWeekly[] {
    const prev = weeklyAmountForWeek(row, prevWeek(week))
    const kept = (row.pastWeeklyAmounts ?? []).filter((p) => p.beforeWeek <= week)
    if (prev !== weekly && row.weeklyAmount != null) kept.push({ beforeWeek: week, amount: prev })
    return kept
}

/** True when nothing after `month` would differ from the amount `month` shows now. */
function settledFrom(row: ExistingRow, month: string): boolean {
    return !(row.pastAmounts ?? []).some((p) => p.beforeMonth > month)
}

// ── The planner ───────────────────────────────────────────────────────────────

interface DocRow {
    name: string
    amount: number | null
    weekly: number | null
    budget: BudgetType | false | undefined
    oneOff: boolean
    end: boolean
    pot: string | null
}

export function planFinanceImport(
    doc: unknown,
    state: { groups: ExistingGroup[]; rows: ExistingRow[]; pots: ExistingPot[]; entries: ExistingEntry[] }
): ImportPlan {
    const errors: string[] = []
    const warnings: string[] = []
    const ops: ImportOp[] = []
    const changes: ImportChange[] = []
    const groupsCreated: string[] = []

    const root = obj(doc)
    const month = str(root?.month) ?? ''
    const emptySummary: ImportSummary = {
        month,
        changes,
        untouched: [],
        groupsCreated,
        totals: { income: 0, expense: 0, savings: 0, leftOver: 0 },
        warnings,
    }
    if (!root) return { errors: ['Expected a plan object.'], ops, summary: emptySummary }
    if (!MONTH_RE.test(month)) errors.push('"month" is required, as "YYYY-MM" — the first month the plan applies to.')
    const docGroups = Array.isArray(root.groups) ? root.groups : null
    if (!docGroups || !docGroups.length) errors.push('"groups" must be a list with at least one group.')
    if (errors.length) return { errors, ops, summary: emptySummary }

    // On an empty sheet there are no earlier months to protect, so new groups
    // show in every month rather than only from the plan's month — otherwise a
    // fresh plan for next month leaves this month blank.
    const freshSheet = state.groups.length === 0
    const newGroupStart = freshSheet ? null : month

    const week = firstWeekOf(month)
    const prevMonth = addMonths(month, -1)

    // Working copies the ops are applied to, so totals and later lookups see the result.
    const groups = state.groups.map((g) => ({ ...g, skipMonths: [...(g.skipMonths ?? [])] }))
    const rows = state.rows.map((r) => ({ ...r }))
    const entries = state.entries.filter((e) => e.month === month).map((e) => ({ ...e }))
    const newGroups: { name: string; type: GroupType; startMonth: string | null }[] = []
    const newRows: (ExistingRow & { groupKey: string })[] = []
    const pots = state.pots.map((p) => ({ ...p }))
    const newPots: { groupKey: string; name: string }[] = []

    let maxGroupOrder = Math.max(-1, ...groups.map((g) => g.order ?? 0))
    const seenGroups = new Set<string>()
    const touchedRowIds = new Set<string>()

    docGroups!.forEach((rawGroup, gi) => {
        const g = obj(rawGroup)
        const label = `Group ${gi + 1}`
        const name = str(g?.name)
        if (!g || !name) {
            errors.push(`${label}: "name" is required.`)
            return
        }
        const gLabel = `Group "${name}"`
        if (seenGroups.has(key(name))) {
            errors.push(`${gLabel} is listed twice.`)
            return
        }
        seenGroups.add(key(name))

        const typeRaw = g.type
        const type =
            typeRaw === 'income' || typeRaw === 'expense' || typeRaw === 'savings' ? (typeRaw as GroupType) : null
        if (typeRaw !== undefined && !type) errors.push(`${gLabel}: "type" must be income, expense or savings.`)

        const matches = groups.filter((x) => key(x.name) === key(name))
        if (matches.length > 1) {
            errors.push(`${gLabel}: you have ${matches.length} groups with this name — rename one first.`)
            return
        }
        const existing = matches[0]
        if (existing && type && existing.type !== type) {
            errors.push(`${gLabel} is a ${existing.type} group in the app, not ${type}.`)
            return
        }
        if (!existing && !type) {
            errors.push(`${gLabel} is new, so it needs a "type": income, expense or savings.`)
            return
        }
        const groupType = existing ? existing.type : type!

        // Resolve (or create) the group.
        let ref: GroupRef
        const groupKey = existing ? existing._id : `new:${key(name)}`
        if (existing) {
            ref = { id: existing._id }
            if (!inWindow(existing, month)) {
                const set: Record<string, unknown> = {}
                if (existing.endMonth && month > existing.endMonth) set.endMonth = null
                if (existing.startMonth && month < existing.startMonth) set.startMonth = month
                if ((existing.skipMonths ?? []).includes(month))
                    set.skipMonths = existing.skipMonths!.filter((m) => m !== month)
                ops.push({ kind: 'updateGroup', id: existing._id, set })
                Object.assign(existing, set)
                warnings.push(`${gLabel} was hidden in ${month}; it's shown again from then on.`)
            }
        } else {
            maxGroupOrder += 1
            const index = newGroups.length
            newGroups.push({ name, type: groupType, startMonth: newGroupStart })
            ops.push({ kind: 'createGroup', index, name, type: groupType, startMonth: newGroupStart, order: maxGroupOrder })
            groupsCreated.push(name)
            ref = { newIndex: index }
        }

        const existingRows = rows.filter((r) => r.group === groupKey)
        let maxRowOrder = Math.max(-1, ...existingRows.map((r) => r.order ?? 0))

        // ── Read the group's rows ──
        let docRows: DocRow[] = []
        if (groupType === 'savings') {
            // A savings group is one row; its amount sits on the group.
            if (g.rows !== undefined) {
                errors.push(`${gLabel} is a savings group — give it an "amount", not "rows".`)
                return
            }
            const amount = money(g.amount)
            if (amount === 'bad' || amount === null) {
                errors.push(`${gLabel}: "amount" must be a number of pounds, 0 or more.`)
                return
            }
            docRows = [{ name: existingRows[0]?.name ?? 'Savings', amount, weekly: null, budget: undefined, oneOff: false, end: false, pot: null }]
        } else {
            if (g.amount !== undefined) {
                errors.push(`${gLabel}: only savings groups take an "amount" — list "rows" instead.`)
                return
            }
            const list = Array.isArray(g.rows) ? g.rows : null
            if (!list) {
                errors.push(`${gLabel}: "rows" must be a list.`)
                return
            }
            const seenRows = new Set<string>()
            list.forEach((rawRow, ri) => {
                const r = obj(rawRow)
                const rName = str(r?.name)
                if (!r || !rName) {
                    errors.push(`${gLabel}, row ${ri + 1}: "name" is required.`)
                    return
                }
                const rLabel = `"${name} → ${rName}"`
                const oneOff = r.oneOff === true
                if (seenRows.has(`${key(rName)}|${oneOff}`)) {
                    errors.push(`${rLabel} is listed twice.`)
                    return
                }
                seenRows.add(`${key(rName)}|${oneOff}`)
                const end = r.end === true
                const amount = money(r.amount)
                const weekly = money(r.weekly)
                if (amount === 'bad') errors.push(`${rLabel}: "amount" must be a number of pounds, 0 or more.`)
                if (weekly === 'bad') errors.push(`${rLabel}: "weekly" must be a number of pounds, 0 or more.`)
                if (amount === 'bad' || weekly === 'bad') return
                const budgetRaw = r.budget
                const budget =
                    budgetRaw === 'daily' || budgetRaw === 'weekly'
                        ? (budgetRaw as BudgetType)
                        : budgetRaw === false
                          ? (false as const)
                          : undefined
                if (budgetRaw !== undefined && budget === undefined)
                    errors.push(`${rLabel}: "budget" must be "daily", "weekly" or false.`)
                if (end && (amount !== null || weekly !== null || oneOff))
                    errors.push(`${rLabel}: a row with "end": true takes no amount and can't be a one-off.`)
                else if (!end && amount === null && weekly === null)
                    errors.push(`${rLabel}: give an "amount" (per month) or a "weekly" budget, or "end": true to stop it.`)
                else if (amount !== null && weekly !== null)
                    errors.push(`${rLabel}: give "amount" or "weekly", not both.`)
                else if (weekly !== null && budget !== undefined && budget !== 'weekly')
                    errors.push(`${rLabel}: a "weekly" amount is a weekly budget — drop "budget" or set it to "weekly".`)
                else if (budget === 'weekly' && weekly === null && amount === null)
                    errors.push(`${rLabel}: a weekly budget needs a "weekly" amount (£ per week) or a monthly "amount".`)
                else if (oneOff && (budget || weekly !== null))
                    errors.push(`${rLabel}: a one-off can't be a budget.`)
                const pot = str(r.pot)
                // A monthly "amount" on a weekly budget keeps the month exact; the
                // weekly figure is derived from it (rounded to the penny).
                const weeklyFromAmount =
                    budget === 'weekly' && weekly === null && typeof amount === 'number' ? round2((amount * 12) / 52) : null
                docRows.push({
                    name: rName,
                    amount: amount as number | null,
                    weekly: weeklyFromAmount ?? (weekly as number | null),
                    budget,
                    oneOff,
                    end,
                    pot,
                })
            })
        }

        // ── Turn each row into writes ──
        for (const dr of docRows) {
            const rLabel = `"${name} → ${dr.name}"`
            const sameName = existingRows.filter((r) => key(r.name) === key(dr.name))
            const candidates = dr.oneOff
                ? sameName.filter((r) => r.recurring === false && r.month === month)
                : groupType === 'savings'
                  ? existingRows.slice(0, 1)
                  : sameName.filter((r) => r.recurring !== false)
            if (candidates.length > 1) {
                errors.push(`${rLabel}: there are ${candidates.length} rows with this name in the group — rename one first.`)
                continue
            }
            const row = candidates[0]

            // Pots, matched by name within the group.
            let potRef: PotRef = null
            let potKey: string | null = null
            if (dr.pot) {
                const found = pots.find((p) => p.group === groupKey && key(p.name) === key(dr.pot!))
                if (found) {
                    potRef = { id: found._id }
                    potKey = found._id
                } else {
                    const pending = newPots.findIndex((p) => p.groupKey === groupKey && key(p.name) === key(dr.pot!))
                    const index = pending >= 0 ? pending : newPots.length
                    if (pending < 0) {
                        newPots.push({ groupKey, name: dr.pot })
                        ops.push({ kind: 'createPot', index, group: ref, name: dr.pot, order: index })
                    }
                    potRef = { newIndex: index }
                    potKey = `newpot:${index}`
                }
            }

            if (dr.end) {
                if (!row) {
                    changes.push({ group: name, row: dr.name, action: 'missing', note: 'Not in the app — nothing to stop.' })
                    continue
                }
                const was = recurringAmountForMonth(row, month) ?? 0
                if (row.endMonth && row.endMonth < month) {
                    changes.push({ group: name, row: row.name, action: 'same', note: `Already stopped after ${row.endMonth}.` })
                    continue
                }
                ops.push({ kind: 'updateRow', id: row._id, set: { endMonth: prevMonth } })
                row.endMonth = prevMonth
                touchedRowIds.add(row._id)
                changes.push({ group: name, row: row.name, action: 'end', from: round2(was), to: 0 })
                continue
            }

            const isWeekly = dr.weekly !== null
            const monthly = dr.amount ?? monthlyFromWeekly(dr.weekly!)

            if (dr.oneOff) {
                if (row) {
                    const was = row.recurringAmount ?? 0
                    if (was !== monthly) ops.push({ kind: 'updateRow', id: row._id, set: { recurringAmount: monthly } })
                    row.recurringAmount = monthly
                    touchedRowIds.add(row._id)
                    changes.push({ group: name, row: row.name, action: was === monthly ? 'same' : 'change', from: was, to: monthly, note: 'One-off' })
                } else {
                    maxRowOrder += 1
                    ops.push({
                        kind: 'createRow', group: ref, pot: potRef, name: dr.name, order: maxRowOrder,
                        recurring: false, month, startMonth: null, recurringAmount: monthly,
                        budgeted: false, budgetType: null, weeklyAmount: null,
                    })
                    newRows.push({ _id: `new:${newRows.length}`, groupKey, group: groupKey, name: dr.name, order: maxRowOrder, recurring: false, month, recurringAmount: monthly, pot: potKey })
                    changes.push({ group: name, row: dr.name, action: 'one-off', to: monthly, note: `${month} only` })
                }
                continue
            }

            if (!row) {
                maxRowOrder += 1
                const budgetType: BudgetType | null = isWeekly ? 'weekly' : dr.budget || null
                ops.push({
                    kind: 'createRow', group: ref, pot: potRef, name: dr.name, order: maxRowOrder,
                    recurring: true, month: null, startMonth: existing ? month : null, recurringAmount: monthly,
                    budgeted: !!budgetType, budgetType, weeklyAmount: isWeekly ? dr.weekly : null,
                })
                newRows.push({ _id: `new:${newRows.length}`, groupKey, group: groupKey, name: dr.name, order: maxRowOrder, recurring: true, startMonth: month, recurringAmount: monthly, pot: potKey })
                changes.push({ group: name, row: dr.name, action: 'add', to: monthly, ...(isWeekly && { weekly: dr.weekly! }) })
                continue
            }

            // An existing recurring row: bring it into line from `month` on.
            if (!isWeekly && row.budgetType === 'weekly' && dr.budget === undefined) {
                errors.push(`${rLabel} is a weekly budget in the app — give "weekly" (£ per week), or "budget": "daily" / false to change it.`)
                continue
            }
            const set: Record<string, unknown> = {}
            let reopened = false
            if (row.endMonth && row.endMonth < month) {
                set.endMonth = null
                reopened = true
            }
            if ((row.skipMonths ?? []).includes(month)) {
                set.skipMonths = row.skipMonths!.filter((m) => m !== month)
                reopened = true
            }
            if (row.startMonth && row.startMonth > month) set.startMonth = month

            const before = recurringAmountForMonth(row, month) ?? 0
            const visibleBefore = rowVisible(row, month)
            const amountSame = before === monthly && settledFrom(row, month)
            if (!amountSame) {
                set.recurringAmount = monthly
                set.pastAmounts = onwardMonthly(row, month, monthly)
            }
            if (isWeekly) {
                if (row.weeklyAmount !== dr.weekly || row.budgetType !== 'weekly') {
                    set.weeklyAmount = dr.weekly
                    set.pastWeeklyAmounts = onwardWeekly(row, week, dr.weekly!)
                }
                if (!row.budgeted) set.budgeted = true
                if (row.budgetType !== 'weekly') set.budgetType = 'weekly'
            } else if (dr.budget !== undefined) {
                const bt = dr.budget || null
                if ((row.budgetType ?? null) !== bt) set.budgetType = bt
                if (!!row.budgeted !== !!bt) set.budgeted = !!bt
                if (bt !== 'weekly' && row.weeklyAmount != null) set.weeklyAmount = null
            }
            if (dr.pot && (row.pot ?? null) !== (potRef && 'id' in potRef ? potRef.id : potKey)) set.pot = potRef

            const entry = entries.find((e) => e.row === row._id)
            if (Object.keys(set).length) {
                ops.push({ kind: 'updateRow', id: row._id, set })
                Object.assign(row, set, { pot: potKey ?? row.pot })
            }
            touchedRowIds.add(row._id)
            if (entry && entry.amount !== monthly) {
                ops.push({ kind: 'clearEntry', row: row._id, month })
                entries.splice(entries.indexOf(entry), 1)
                warnings.push(`${rLabel} had a £${entry.amount.toFixed(2)} manual figure for ${month}; it's cleared so the plan's £${monthly.toFixed(2)} shows.`)
            }
            const shownBefore = entry ? entry.amount : visibleBefore ? before : undefined
            changes.push({
                group: name,
                row: row.name,
                action: reopened ? 'reopen' : amountSame && Object.keys(set).length === 0 && (!entry || entry.amount === monthly) ? 'same' : 'change',
                ...(shownBefore !== undefined && { from: round2(shownBefore) }),
                to: monthly,
                ...(isWeekly && { weekly: dr.weekly! }),
            })
        }
    })

    if (errors.length) return { errors, ops: [], summary: emptySummary }

    // ── What the month looks like afterwards ──
    const allGroups: { key: string; name: string; type: GroupType; visible: boolean }[] = [
        ...groups.map((g) => ({ key: g._id, name: g.name, type: g.type, visible: inWindow(g, month) })),
        ...newGroups.map((g) => ({ key: `new:${key(g.name)}`, name: g.name, type: g.type, visible: true })),
    ]
    const allRows = [...rows, ...newRows]
    const totals = { income: 0, expense: 0, savings: 0, leftOver: 0 }
    const untouched: ImportSummary['untouched'] = []
    for (const g of allGroups) {
        if (!g.visible) continue
        for (const r of allRows.filter((x) => x.group === g.key)) {
            if (!rowVisible(r, month)) continue
            const entry = entries.find((e) => e.row === r._id)
            const amount = entry ? entry.amount : (recurringAmountForMonth(r, month) ?? 0)
            totals[g.type] += amount
            if (!r._id.startsWith('new:') && !touchedRowIds.has(r._id)) untouched.push({ group: g.name, row: r.name, amount: round2(amount) })
        }
    }
    totals.income = round2(totals.income)
    totals.expense = round2(totals.expense)
    totals.savings = round2(totals.savings)
    totals.leftOver = round2(totals.income - totals.expense - totals.savings)

    return { errors, ops, summary: { month, changes, untouched, groupsCreated, totals, warnings } }
}
