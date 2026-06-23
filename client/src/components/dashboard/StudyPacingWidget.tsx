import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardFooter } from '../Card'
import Spinner from '../Spinner'
import { useAuth } from '../../context/AuthContext'
import { listValues } from '../../services/totals'
import { listCourses } from '../../services/courses'
import { projectCourses } from '../../lib/study'
import { computePacing, type CoursePacing, type PacingStatus } from '../../lib/pacing'
import { MONTHS, parseDateKey, todayKey } from '../../lib/calendar'
import type { Course, TotalValue } from '../../types'

/** Wide window: past entries (recent pace) + a long projection horizon. */
function bankRange(): { from: string; to: string } {
    const year = new Date().getFullYear()
    return { from: `${year - 1}-01-01`, to: `${year + 10}-12-31` }
}

function fmtHours(n: number): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return '0h'
    return `${Number.isInteger(v) ? v : v.toFixed(1)}h`
}

/** "12 Aug" / "12 Aug 27" when not the current year. */
function fmtShort(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const base = `${day} ${MONTHS[month].slice(0, 3)}`
    return year === new Date().getFullYear() ? base : `${base} ${String(year).slice(2)}`
}

const STATUS_PILL: Record<PacingStatus, { cls: string; label: string; icon: string }> = {
    'on-track': { cls: 'bg-emerald-50 text-emerald-700', label: 'On track', icon: 'fa-solid fa-check' },
    behind: { cls: 'bg-amber-50 text-amber-700', label: 'Behind', icon: 'fa-solid fa-arrow-trend-down' },
    overdue: { cls: 'bg-red-50 text-red-600', label: 'Overdue', icon: 'fa-solid fa-triangle-exclamation' },
    'no-target': { cls: 'bg-neutral-100 text-neutral-500', label: 'No target', icon: 'fa-regular fa-flag' },
    done: { cls: 'bg-emerald-50 text-emerald-700', label: 'Done', icon: 'fa-solid fa-check' },
}

function PacingRow({ p }: { p: CoursePacing }) {
    const pill = STATUS_PILL[p.status]
    const isBlock = p.course.kind === 'block'
    return (
        <div className="flex items-start justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutral-900">
                    {p.course.name || (isBlock ? 'Untitled block' : 'Untitled course')}
                </p>
                <p className="mt-0.5 text-xs text-neutral-400">
                    {fmtHours(p.remainingHours)} to go
                    {p.targetDate && (
                        <>
                            {' · target '}
                            <span className="font-medium text-neutral-500">
                                {fmtShort(p.targetDate)}
                            </span>
                        </>
                    )}
                    {p.status === 'behind' && Number.isFinite(p.neededPacePerDay) && (
                        <>
                            {' · need '}
                            <span className="font-semibold text-amber-700">
                                {fmtHours(p.neededPacePerDay)}/day
                            </span>
                        </>
                    )}
                    {(p.status === 'on-track' || p.status === 'no-target') && p.projectedFinish && (
                        <>
                            {' · finish ~'}
                            <span className="font-medium text-neutral-500">
                                {fmtShort(p.projectedFinish)}
                            </span>
                        </>
                    )}
                </p>
            </div>
            <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}
            >
                <i className={`${pill.icon} text-[10px]`} aria-hidden="true" />
                {pill.label}
            </span>
        </div>
    )
}

export default function StudyPacingWidget() {
    const { user } = useAuth()
    const studyRowId = user?.settings?.studyRowId ?? ''
    const [values, setValues] = useState<TotalValue[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        const { from, to } = bankRange()
        Promise.all([listValues(from, to), listCourses()])
            .then(([vs, cs]) => {
                if (!active) return
                setValues(vs)
                setCourses(cs)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [])

    const today = todayKey()
    const rowValues = studyRowId ? values.filter((v) => v.row === studyRowId) : []
    const projection = projectCourses(courses, rowValues, today)
    const pacing = computePacing(projection, rowValues, today)

    // Show unfinished courses, behind/overdue first so problems surface.
    const active = pacing.courses
        .filter((c) => c.status !== 'done')
        .sort((a, b) => {
            const rank = (s: string) => (s === 'overdue' ? 0 : s === 'behind' ? 1 : s === 'no-target' ? 2 : 3)
            return rank(a.status) - rank(b.status)
        })
    const shown = active.slice(0, 4)

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Study pacing</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        {pacing.pacePerDay > 0
                            ? `${fmtHours(pacing.pacePerDay)}/day over the last 4 weeks`
                            : 'Are you on track for your targets?'}
                    </p>
                </div>
                <Link
                    to="/study"
                    className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Open
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-10">
                    <Spinner />
                </div>
            ) : !studyRowId ? (
                <p className="py-4 text-sm text-neutral-400">
                    Pick a study hours row on the{' '}
                    <Link
                        to="/study"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Study page
                    </Link>{' '}
                    to project pacing.
                </p>
            ) : active.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    {courses.length === 0
                        ? 'No courses yet. Add one on the Study page.'
                        : 'All courses complete — nothing left to pace.'}
                </p>
            ) : (
                <>
                    {pacing.behindCount > 0 && (
                        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-700">
                            <i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />
                            {pacing.behindCount} course{pacing.behindCount !== 1 ? 's' : ''} behind
                            target at your current pace
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        {shown.map((p) => (
                            <PacingRow key={p.course._id} p={p} />
                        ))}
                    </div>
                    {active.length > shown.length && (
                        <p className="mt-2 text-xs text-neutral-400">
                            +{active.length - shown.length} more on the Study page
                        </p>
                    )}
                </>
            )}

            <CardFooter>
                <Link
                    to="/study"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-graduation-cap text-xs" aria-hidden="true" />
                    View study plan
                </Link>
            </CardFooter>
        </Card>
    )
}
