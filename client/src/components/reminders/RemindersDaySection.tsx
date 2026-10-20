import { useEffect, useRef, useState } from 'react'
import Spinner from '../Spinner'
import RecurrencePicker from '../calendar/RecurrencePicker'
import DeleteRecurringEventDialog, {
    type DeleteScope,
} from '../calendar/DeleteRecurringEventDialog'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { listReminders, createReminder, deleteReminder } from '../../services/reminders'
import { listDaysUntil, createDaysUntil, deleteDaysUntil } from '../../services/daysUntil'
import { useInvalidate } from '../../context/DataSyncContext'
import { todayKey, parseDateKey } from '../../lib/calendar'
import type { Reminder, RecurrenceFrequency, DaysUntilItem } from '../../types'

interface Props {
    date: string
    /** Notifies the parent (e.g. the calendar) whenever the list changes. */
    onChange?: () => void
    /** Autofocus the input on mount — handy when opened from the calendar. */
    autoFocus?: boolean
    /** Show a "X days away" line at the top (used in the calendar drawer). */
    showDaysAway?: boolean
}

/** Relative-day label for a YYYY-MM-DD date, e.g. "3 days away" / "Today". */
function daysAwayLabel(date: string): string {
    const a = parseDateKey(todayKey())
    const b = parseDateKey(date)
    const diff = Math.round(
        (Date.UTC(b.year, b.month, b.day) - Date.UTC(a.year, a.month, a.day)) / 86_400_000
    )
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
    return diff > 0 ? `${diff} days away` : `${Math.abs(diff)} days ago`
}

/**
 * Inline add / list / delete for a single day's reminders. A reminder is just a
 * short note that "sits on" a day — no time, no completion, just something to be
 * mindful of. Reminders can repeat (sharing the events' recurrence rules), in
 * which case the listed items include the recurring occurrences for this day.
 * Reused by the Day page and the calendar's reminders drawer.
 */
export default function RemindersDaySection({
    date,
    onChange,
    autoFocus = false,
    showDaysAway = false,
}: Props) {
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

    // Countdowns made from reminders, so each row can show whether it's counting.
    const [countdowns, setCountdowns] = useState<DaysUntilItem[]>([])
    useEffect(() => {
        listDaysUntil()
            .then((list) => setCountdowns(list.filter((c) => c.reminder)))
            .catch(() => setCountdowns([]))
    }, [])

    /** The countdown for this reminder — for a one-off, only one on this exact date. */
    function countdownFor(reminder: Reminder): DaysUntilItem | undefined {
        return countdowns.find(
            (c) => c.reminder === reminder._id && (c.followNext || c.targetDate === reminder.date)
        )
    }

    async function addCountdown(reminder: Reminder, followNext: boolean) {
        const created = await createDaysUntil({
            label: reminder.text,
            targetDate: reminder.date,
            icon: 'fa-solid fa-hourglass-end',
            color: 'amber',
            reminder: reminder._id,
            followNext,
        })
        setCountdowns((prev) => [...prev, created])
    }

    async function removeCountdown(countdown: DaysUntilItem) {
        setCountdowns((prev) => prev.filter((c) => c._id !== countdown._id))
        try {
            await deleteDaysUntil(countdown._id)
        } catch {
            setCountdowns((prev) => [...prev, countdown])
        }
    }

    function countdownMenu(reminder: Reminder, countdown: DaysUntilItem | undefined): MenuEntry[] {
        if (countdown)
            return [
                { label: 'View countdowns', icon: 'fa-solid fa-hourglass-half', href: '/days-until' },
                'divider',
                {
                    label: 'Remove countdown',
                    icon: 'fa-solid fa-xmark',
                    danger: true,
                    onClick: () => removeCountdown(countdown),
                },
            ]
        if (reminder.recurrence)
            return [
                {
                    label: 'Count down to the next one',
                    icon: 'fa-solid fa-repeat',
                    onClick: () => addCountdown(reminder, true),
                },
                {
                    label: 'Count down to this date',
                    icon: 'fa-solid fa-calendar-day',
                    onClick: () => addCountdown(reminder, false),
                },
            ]
        return [
            {
                label: 'Add to countdowns',
                icon: 'fa-solid fa-hourglass-end',
                onClick: () => addCountdown(reminder, false),
            },
        ]
    }

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
            {showDaysAway && (
                <p className="mb-2 flex items-center gap-1.5 px-3 text-xs font-semibold text-amber-600">
                    <i className="fa-regular fa-clock text-[11px]" aria-hidden="true" />
                    {daysAwayLabel(date)}
                </p>
            )}

            {/* Reminder rows */}
            {reminders.map((reminder) => {
                const countdown = countdownFor(reminder)
                return (
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
                            className="fa-solid fa-repeat shrink-0 text-[11px] text-neutral-300"
                            title="Repeats"
                            aria-hidden="true"
                        />
                    )}
                    <DropdownMenu
                        align="right"
                        size="medium"
                        items={countdownMenu(reminder, countdown)}
                        trigger={
                            <button
                                type="button"
                                aria-label={countdown ? 'Countdown options' : 'Add to countdowns'}
                                title={
                                    countdown
                                        ? countdown.followNext
                                            ? 'Counting down to the next one'
                                            : 'Counting down'
                                        : 'Add to countdowns'
                                }
                                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-all hover:bg-neutral-200 ${
                                    countdown
                                        ? 'text-amber-500'
                                        : 'text-neutral-300 hover:text-neutral-600 sm:opacity-0 sm:group-hover:opacity-100'
                                }`}
                            >
                                <i className="fa-solid fa-hourglass-half text-[11px]" aria-hidden="true" />
                            </button>
                        }
                    />
                    <button
                        type="button"
                        onClick={() => handleDelete(reminder)}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-300 opacity-100 transition-all hover:bg-neutral-200 hover:text-neutral-600 sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Delete reminder"
                    >
                        <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                    </button>
                </div>
                )
            })}

            {reminders.length === 0 && (
                <p className="px-3 py-2 text-sm text-neutral-500">Nothing to be mindful of yet.</p>
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
                        className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-500 outline-none"
                    />
                    {newText.trim() && (
                        <button
                            type="button"
                            onClick={handleAdd}
                            disabled={adding}
                            className="inline-flex items-center justify-center rounded-[10px] bg-neutral-900 px-3 h-8 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
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
