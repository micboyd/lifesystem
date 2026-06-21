import { useEffect, useState } from 'react'
import Spinner from '../Spinner'
import { listValues, setValue } from '../../services/totals'
import { listCourses } from '../../services/courses'
import { projectCourses, type CourseProjection } from '../../lib/study'
import { todayKey } from '../../lib/calendar'
import type { TotalValue } from '../../types'

interface Props {
    date: string
    /** Id of the totals row configured as the study-hours source. */
    rowId: string
}

/**
 * Quick study-hours entry for a single day, reading/writing the configured
 * study totals row. Past days read as "logged" (count toward course progress);
 * today and future read as "planned" (add to the study bank).
 */
export default function StudyDaySection({ date, rowId }: Props) {
    const [value, setValueState] = useState<number | undefined>(undefined)
    const [text, setText] = useState('')
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [milestones, setMilestones] = useState<CourseProjection[]>([])
    const loading = loadedKey !== `${rowId}:${date}`

    useEffect(() => {
        let active = true
        const today = todayKey()
        const year = new Date().getFullYear()
        Promise.all([
            listValues(date, date),
            listValues(`${year - 1}-01-01`, `${year + 10}-12-31`),
            listCourses(),
        ])
            .then(([dayVs, allVs, courses]) => {
                if (!active) return
                const v = dayVs.find((x: TotalValue) => x.row === rowId)
                setValueState(v?.value)
                setText(v ? String(v.value) : '')

                const rowVs = allVs.filter((x: TotalValue) => x.row === rowId)
                const projection = projectCourses(courses, rowVs, today)
                setMilestones(
                    projection.courses.filter(
                        (p) => p.startDate === date || p.finishDate === date
                    )
                )
            })
            .catch(() => {
                if (!active) return
                setValueState(undefined)
                setText('')
            })
            .finally(() => {
                if (active) setLoadedKey(`${rowId}:${date}`)
            })
        return () => {
            active = false
        }
    }, [date, rowId])

    async function commit() {
        const trimmed = text.trim()
        let next: number | null
        if (trimmed === '') {
            next = null
        } else {
            const n = Number(trimmed)
            if (Number.isNaN(n) || n < 0) {
                setText(value === undefined ? '' : String(value))
                return
            }
            next = n
        }
        if ((next ?? undefined) === value) return
        setSaving(true)
        try {
            await setValue(rowId, date, next)
            setValueState(next ?? undefined)
        } catch {
            setText(value === undefined ? '' : String(value))
        } finally {
            setSaving(false)
        }
    }

    if (loading)
        return (
            <div className="grid place-items-center py-6">
                <Spinner />
            </div>
        )

    const isPast = date < todayKey()

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 p-3">
                <i
                    className="fa-solid fa-book-open-reader text-neutral-300"
                    aria-hidden="true"
                />
                <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    placeholder="0"
                    disabled={saving}
                    className="w-20 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-center text-sm tabular-nums text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-200 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-sm font-semibold text-neutral-600">hours</span>
                <span className="text-xs text-neutral-400">
                    {isPast
                        ? 'Logged — counts toward your courses.'
                        : 'Planned — adds to your study bank.'}
                </span>
            </div>

            {milestones.map((p) => {
                const isFinish = p.finishDate === date
                return (
                    <div
                        key={p.course._id + (isFinish ? '-finish' : '-start')}
                        className={[
                            'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold',
                            isFinish
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-blue-200 bg-blue-50 text-blue-700',
                        ].join(' ')}
                    >
                        <i
                            className={`fa-solid ${isFinish ? 'fa-flag-checkered' : 'fa-play'} text-xs`}
                            aria-hidden="true"
                        />
                        <span>
                            <span className="font-bold">{p.course.name}</span>
                            {isFinish ? ' planned to finish here' : ' planned to start here'}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
