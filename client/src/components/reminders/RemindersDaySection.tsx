import { useEffect, useRef, useState } from 'react'
import Spinner from '../Spinner'
import RecurrencePicker from '../calendar/RecurrencePicker'
import DeleteRecurringEventDialog, {
    type DeleteScope,
} from '../calendar/DeleteRecurringEventDialog'
import { listReminders, createReminder, deleteReminder } from '../../services/reminders'
import { useInvalidate } from '../../context/DataSyncContext'
import type { Reminder, RecurrenceFrequency } from '../../types'

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
 * mindful of. Reminders can repeat (sharing the events' recurrence rules), in
 * which case the listed items include the recurring occurrences for this day.
 * Reused by the Day page and the calendar's reminders drawer.
 */
export default function RemindersDaySection({ date, onChange, autoFocus = false }: Props) {
    const invalidate = useInvalidate()
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date
    const [newText, setNewText] = useState('')
    const [adding, setAdding] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    // Recurrence options for the new reminder.
    const [recurring, setRecurring] = useState(false)
    const [frequency, setFrequency] = useState<RecurrenceFrequency>('weekly')
    const [endsOn, setEndsOn] = useState('')

    // Recurring reminder awaiting a this-one / whole-series delete choice.
    const [scopeReminder, setScopeReminder] = useState<Reminder | null>(null)

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

    function reload() {
        listReminders(date, date)
            .then(setReminders)
            .catch(() => setReminders([]))
    }

    async function handleAdd() {
        const text = newText.trim()
        if (!text || adding) return
        setAdding(true)
        try {
            await createReminder({
                date,
                text,
                recurrence: recurring ? { frequency, endsOn: endsOn || undefined } : undefined,
            })
            reload()
            invalidate('reminders')
            onChange?.()
            setNewText('')
            setRecurring(false)
            setEndsOn('')
            inputRef.current?.focus()
        } finally {
            setAdding(false)
        }
    }

    async function remove(reminder: Reminder, scope: DeleteScope = 'series') {
        // 'instance' records this day as an exception; 'series' (and any one-off)
        // deletes the master document outright.
        setReminders((prev) => prev.filter((r) => r._id !== reminder._id))
        try {
            await deleteReminder(reminder._id, scope === 'instance' ? reminder.date : undefined)
            invalidate('reminders')
            onChange?.()
        } catch {
            reload()
        }
    }

    function handleDelete(reminder: Reminder) {
        // Recurring reminders offer a this-one / whole-series choice; others go directly.
        if (reminder.recurrence) setScopeReminder(reminder)
        else remove(reminder, 'series')
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
                    {reminder.recurrence && (
                        <i
                            className="fa-solid fa-repeat shrink-0 text-[10px] text-neutral-300"
                            title="Repeats"
                            aria-hidden="true"
                        />
                    )}
                    <button
                        type="button"
                        onClick={() => handleDelete(reminder)}
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
            <div className="mt-1 flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 focus-within:border-neutral-400">
                <div className="flex items-center gap-2">
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

                <RecurrencePicker
                    enabled={recurring}
                    onEnabledChange={setRecurring}
                    frequency={frequency}
                    onFrequencyChange={setFrequency}
                    endsOn={endsOn}
                    onEndsOnChange={setEndsOn}
                    minEndDate={date}
                />
            </div>

            {scopeReminder && (
                <DeleteRecurringEventDialog
                    noun="reminder"
                    title={scopeReminder.text}
                    occurrenceDate={scopeReminder.date}
                    onClose={() => setScopeReminder(null)}
                    onConfirm={(scope) => {
                        remove(scopeReminder, scope)
                        setScopeReminder(null)
                    }}
                />
            )}
        </div>
    )
}
