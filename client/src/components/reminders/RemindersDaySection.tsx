import { useEffect, useRef, useState } from 'react'
import Spinner from '../Spinner'
import {
    listReminders,
    createReminder,
    deleteReminder,
} from '../../services/reminders'
import { useInvalidate } from '../../context/DataSyncContext'
import type { Reminder } from '../../types'

interface Props {
    date: string
    /** Notifies the parent (e.g. the calendar) whenever the list changes. */
    onChange?: () => void
    /** Autofocus the input on mount — handy when opened from the calendar. */
    autoFocus?: boolean
}

/**
 * Inline add / list / delete for a single day's reminders. A reminder is just a
 * short note that "sits on" a day — no time, no completion, just something to be
 * mindful of. Reused by the Day page and the calendar's reminders drawer.
 */
export default function RemindersDaySection({ date, onChange, autoFocus = false }: Props) {
    const invalidate = useInvalidate()
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date
    const [newText, setNewText] = useState('')
    const [adding, setAdding] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        let active = true
        listReminders(date, date)
            .then((list) => active && setReminders(list))
            .catch(() => active && setReminders([]))
            .finally(() => {
                if (active) setLoadedDate(date)
            })
        return () => {
            active = false
        }
    }, [date])

    useEffect(() => {
        if (autoFocus && !loading) inputRef.current?.focus()
    }, [autoFocus, loading])

    async function handleAdd() {
        const text = newText.trim()
        if (!text || adding) return
        setAdding(true)
        try {
            const reminder = await createReminder(date, text)
            setReminders((prev) => [...prev, reminder])
            invalidate('reminders')
            onChange?.()
            setNewText('')
            inputRef.current?.focus()
        } finally {
            setAdding(false)
        }
    }

    async function remove(id: string) {
        setReminders((prev) => prev.filter((r) => r._id !== id))
        try {
            await deleteReminder(id)
            invalidate('reminders')
            onChange?.()
        } catch {
            /* refetch could go here */
        }
    }

    if (loading)
        return (
            <div className="grid place-items-center py-6">
                <Spinner />
            </div>
        )

    return (
        <div className="flex flex-col gap-1">
            {/* Reminder rows */}
            {reminders.map((reminder) => (
                <div
                    key={reminder._id}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50"
                >
                    <i
                        className="fa-solid fa-bell shrink-0 text-xs text-amber-500"
                        aria-hidden="true"
                    />
                    <span className="flex-1 text-sm font-medium text-neutral-800">
                        {reminder.text}
                    </span>
                    <button
                        type="button"
                        onClick={() => remove(reminder._id)}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-300 opacity-0 transition-all hover:bg-neutral-200 hover:text-neutral-600 group-hover:opacity-100"
                        aria-label="Delete reminder"
                    >
                        <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                    </button>
                </div>
            ))}

            {reminders.length === 0 && (
                <p className="px-3 py-2 text-sm text-neutral-400">Nothing to be mindful of yet.</p>
            )}

            {/* Quick add */}
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 focus-within:border-neutral-400 focus-within:ring-2 focus-within:ring-neutral-200">
                <i className="fa-solid fa-plus text-xs text-neutral-300" aria-hidden="true" />
                <input
                    ref={inputRef}
                    type="text"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAdd()
                    }}
                    placeholder="Add a reminder…"
                    className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 outline-none"
                />
                {newText.trim() && (
                    <button
                        type="button"
                        onClick={handleAdd}
                        disabled={adding}
                        className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                    >
                        Add
                    </button>
                )}
            </div>
        </div>
    )
}
