import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDataVersion } from '../../context/DataSyncContext'
import { listHabits, listLogs } from '../../services/habits'
import { listGoals } from '../../services/goals'
import { listDaysSince } from '../../services/daysSince'
import { listValues } from '../../services/totals'
import { listCourses } from '../../services/courses'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
} from '../../services/finances'
import { monthOf } from '../../lib/budget'
import { addDays, todayKey } from '../../lib/calendar'
import { summariseDiscipline, type MonthBudgetData } from '../../lib/budgetDiscipline'
import { computeHabitStreak } from '../../lib/habits'
import { projectCourses } from '../../lib/study'
import { computePacing } from '../../lib/pacing'
import {
    budgetDomainStatus,
    habitsDomainStatus,
    goalsDomainStatus,
    daysSinceDomainStatus,
    studyDomainStatus,
    type DomainStatus,
    type TrafficLightStatus,
} from '../../lib/statusOverview'
import type { FinanceGroup, FinanceRow, Goal, DaysSinceItem, HabitDef, HabitLog, Course, TotalValue } from '../../types'

const PILL_CLASS: Record<TrafficLightStatus, string> = {
    green: 'bg-emerald-50 text-emerald-700',
    yellow: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    neutral: 'bg-neutral-100 text-neutral-500',
}

interface LoadedData {
    groups: FinanceGroup[]
    rows: FinanceRow[]
    byMonth: Map<string, MonthBudgetData>
    habits: HabitDef[]
    logs: HabitLog[]
    goals: Goal[]
    daysSinceItems: DaysSinceItem[]
    courses: Course[]
    values: TotalValue[]
}

function StatusPill({ domain }: { domain: DomainStatus }) {
    return (
        <Link
            to={domain.href}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-opacity hover:opacity-80 ${PILL_CLASS[domain.status]}`}
        >
            <i className={`${domain.icon} text-[11px]`} aria-hidden="true" />
            {domain.label}
            <span className="opacity-70">·</span>
            {domain.detail}
        </Link>
    )
}

export default function StatusOverviewStrip() {
    const { user } = useAuth()
    const studyRowId = user?.settings?.studyRowId ?? ''
    const budgetVersion = useDataVersion('budget')
    const habitsVersion = useDataVersion('habits')
    const [data, setData] = useState<LoadedData | null>(null)

    const today = todayKey()
    const from = addDays(today, -29)
    const months = Array.from(new Set([monthOf(from), monthOf(today)]))

    useEffect(() => {
        let active = true
        Promise.all([
            listGroups(),
            listRows(),
            Promise.all(
                months.map((m) =>
                    Promise.all([listEntries(m), listBudgetSpends({ month: m }), listBudgetExclusions(m)]).then(
                        ([entries, spends, exclusions]) =>
                            [m, { entries, spends, excluded: new Set(exclusions.map((d) => d.date)) }] as [
                                string,
                                MonthBudgetData,
                            ]
                    )
                )
            ),
            listHabits(),
            listLogs(addDays(today, -30), today),
            listGoals(),
            listDaysSince(),
            listCourses(),
            listValues(`${new Date().getFullYear() - 1}-01-01`, `${new Date().getFullYear() + 10}-12-31`),
        ]).then(([groups, rows, monthEntries, habits, logs, goals, daysSinceItems, courses, values]) => {
            if (!active) return
            setData({
                groups,
                rows,
                byMonth: new Map(monthEntries),
                habits,
                logs,
                goals,
                daysSinceItems,
                courses,
                values,
            })
        })
        return () => {
            active = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetVersion, habitsVersion])

    if (!data) return null

    const discipline = summariseDiscipline(from, today, data.groups, data.rows, data.byMonth)
    const habitStreak = computeHabitStreak(data.habits, data.logs, today)
    const rowValues = studyRowId ? data.values.filter((v) => v.row === studyRowId) : []
    const pacing = studyRowId
        ? computePacing(projectCourses(data.courses, rowValues, today), rowValues, today)
        : null

    const domains = [
        budgetDomainStatus(discipline),
        habitsDomainStatus(habitStreak),
        goalsDomainStatus(data.goals, today),
        daysSinceDomainStatus(data.daysSinceItems, today),
        studyDomainStatus(pacing),
    ]

    return (
        <div className="flex flex-wrap gap-2.5">
            {domains.map((d) => (
                <StatusPill key={d.key} domain={d} />
            ))}
        </div>
    )
}
