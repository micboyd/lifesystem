import { useCallback, useEffect, useRef, useState } from 'react'
import Spinner from '../Spinner'
import { listHabits, listLogs, checkHabit, uncheckHabit, createHabit } from '../../services/habits'
import { useInvalidate } from '../../context/DataSyncContext'
import type { HabitDef, HabitLog } from '../../types'

interface Props {
    date: string
    /** Compact mode for the dashboard widget — hides add-new form. */
    compact?: boolean
}

export default function HabitsDaySection({ date, compact = false }: Props) {
    const invalidate = useInvalidate()
    const [habits, setHabits] = useState<HabitDef[]>([])
    const [logs, setLogs] = useState<HabitLog[]>([])
    // Derive loading from which date has finished loading — avoids a synchronous
    // setState inside the fetch effect (which React 19 flags as cascading renders).
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date
    const [toggling, setToggling] = useState<Set<string>>(new Set())
    const [adding, setAdding] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [saving, setSaving] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => {
        const [defs, dayLogs] = await Promise.all([listHabits(), listLogs(date, date)])
        return { defs, dayLogs }
    }, [date])

    useEffect(() => {
        let active = true
        load()
            .then(({ defs, dayLogs }) => {
                if (!active) return
                setHabits(defs.filter((h) => h.active))
                setLogs(dayLogs)
            })
            .catch(() => {
                if (active) setHabits([])
            })
            .finally(() => {
                if (active) setLoadedDate(date)
            })
        return () => {
            active = false
        }
    }, [load, date])

    useEffect(() => {
        if (adding) inputRef.current?.focus()
    }, [adding])

    function isCompleted(habitId: string) {
        return logs.some((l) => l.habit === habitId && l.completed)
    }

    async function toggle(habit: HabitDef) {
        if (toggling.has(habit._id)) return
        setToggling((s) => new Set(s).add(habit._id))
        try {
            if (isCompleted(habit._id)) {
                await uncheckHabit(habit._id, date)
                setLogs((prev) => prev.filter((l) => l.habit !== habit._id))
            } else {
                const log = await checkHabit(habit._id, date)
                setLogs((prev) => [...prev.filter((l) => l.habit !== habit._id), log])
            }
            invalidate('habits')
        } finally {
            setToggling((s) => {
                const n = new Set(s)
                n.delete(habit._id)
                return n
            })
        }
    }

    async function handleAdd() {
        if (!newName.trim()) return
        setSaving(true)
        try {
            const habit = await createHabit(newName.trim(), newDesc.trim() || undefined)
            setHabits((prev) => [...prev, habit])
            invalidate('habits')
            setNewName('')
            setNewDesc('')
            setAdding(false)
        } finally {
            setSaving(false)
        }
    }

    const done = habits.filter((h) => isCompleted(h._id)).length
    const total = habits.length

    if (loading)
        return (
            <div className="grid place-items-center py-6">
                <Spinner />
            </div>
        )

    return (
        <div className="flex flex-col gap-1">
            {/* Progress header */}
            {total > 0 && (
                <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-neutral-400">
                        {done}/{total} completed
                    </span>
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-neutral-100">
                        <div
                            className="h-full rounded-full bg-neutral-800 transition-all duration-300"
                            style={{ width: total ? `${(done / total) * 100}%` : '0%' }}
                        />
                    </div>
                </div>
            )}

            {/* Habit rows */}
            {habits.length === 0 && !adding ? (
                <p className="py-2 text-sm text-neutral-300">No habits yet.</p>
            ) : (
                habits.map((habit) => {
                    const completed = isCompleted(habit._id)
                    const busy = toggling.has(habit._id)
                    return (
                        <button
                            key={habit._id}
                            type="button"
                            onClick={() => toggle(habit)}
                            disabled={busy}
                            className={[
                                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                                completed ? 'bg-neutral-50' : 'hover:bg-neutral-50',
                            ].join(' ')}
                        >
                            {/* Checkbox */}
                            <span
                                className={[
                                    'grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors',
                                    completed
                                        ? 'border-neutral-800 bg-neutral-800'
                                        : 'border-neutral-300',
                                ].join(' ')}
                            >
                                {completed && (
                                    <i
                                        className="fa-solid fa-check text-[9px] text-white"
                                        aria-hidden="true"
                                    />
                                )}
                            </span>

                            <div className="min-w-0 flex-1">
                                <p
                                    className={[
                                        'truncate text-sm font-semibold',
                                        completed
                                            ? 'text-neutral-400 line-through'
                                            : 'text-neutral-800',
                                    ].join(' ')}
                                >
                                    {habit.name}
                                </p>
                                {habit.description && !compact && (
                                    <p className="truncate text-xs text-neutral-400">
                                        {habit.description}
                                    </p>
                                )}
                            </div>
                        </button>
                    )
                })
            )}

            {/* Add new habit inline form */}
            {!compact &&
                (adding ? (
                    <div className="mt-1 flex flex-col gap-2 rounded-xl border border-neutral-200 p-3">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Habit name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAdd()
                                if (e.key === 'Escape') setAdding(false)
                            }}
                            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-200"
                        />
                        <input
                            type="text"
                            placeholder="Description (optional)"
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAdd()
                                if (e.key === 'Escape') setAdding(false)
                            }}
                            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-neutral-200"
                        />
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleAdd}
                                disabled={saving || !newName.trim()}
                                className="rounded-full bg-neutral-950 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                            >
                                {saving ? 'Adding…' : 'Add'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAdding(false)
                                    setNewName('')
                                    setNewDesc('')
                                }}
                                className="rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="mt-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                        Add habit
                    </button>
                ))}
        </div>
    )
}
