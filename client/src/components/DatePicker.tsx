import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export interface DateRange {
    start: string
    end: string
}

export type DatePickerValue = string | DateRange | null

/** Either a list of ISO "YYYY-MM-DD" strings, or a predicate over a Date. */
export type DateMatcher = string[] | ((date: Date) => boolean)

type DayStatus = 'normal' | 'disabled' | 'error'

interface DatePickerProps {
    mode?: 'single' | 'range'
    value?: DatePickerValue
    defaultValue?: DatePickerValue
    onChange?: (value: DatePickerValue) => void
    placeholder?: string
    /** Disables the whole control. */
    disabled?: boolean
    /** Earliest selectable date (ISO "YYYY-MM-DD"); earlier days are disabled. */
    minDate?: string
    /** Latest selectable date (ISO "YYYY-MM-DD"); later days are disabled. */
    maxDate?: string
    /** Dates that can't be selected (greyed out). */
    disabledDates?: DateMatcher
    /** Dates flagged as errors — shown in red and not selectable. */
    errorDates?: DateMatcher
    className?: string
}

interface PickerDay {
    date: Date
    isCurrentMonth: boolean
    isToday: boolean
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YEARS_PER_PAGE = 12

type CalendarView = 'days' | 'months' | 'years'

function toISO(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

function parseISO(value?: string | null): Date | null {
    return value ? new Date(`${value}T00:00:00`) : null
}

function sameDay(a: Date, b: Date): boolean {
    return a.toDateString() === b.toDateString()
}

function startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
}

function formatLong(date: Date): string {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatShort(date: Date): string {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function normalizeMatcher(matcher?: DateMatcher): (date: Date) => boolean {
    if (!matcher) return () => false
    if (typeof matcher === 'function') return matcher
    const set = new Set(matcher)
    return (date) => set.has(toISO(date))
}

function parseValue(
    mode: 'single' | 'range',
    value: DatePickerValue,
): { single: Date | null; start: Date | null; end: Date | null } {
    if (mode === 'range') {
        const v = (value as DateRange | null) ?? null
        return { single: null, start: parseISO(v?.start), end: parseISO(v?.end) }
    }
    return { single: parseISO(value as string | null), start: null, end: null }
}

function buildCalendar(viewDate: Date): PickerDay[] {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const today = new Date()

    const firstDow = new Date(year, month, 1).getDay()
    const leadDays = firstDow === 0 ? 6 : firstDow - 1
    const start = new Date(year, month, 1 - leadDays)

    return Array.from({ length: 42 }, (_, i) => {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
        return {
            date,
            isCurrentMonth: date.getMonth() === month,
            isToday: sameDay(date, today),
        }
    })
}

export default function DatePicker({
    mode = 'single',
    value,
    defaultValue,
    onChange,
    placeholder = mode === 'range' ? 'Select a date range' : 'Select a date',
    disabled = false,
    minDate,
    maxDate,
    disabledDates,
    errorDates,
    className = '',
}: DatePickerProps) {
    const isRange = mode === 'range'
    const isControlled = value !== undefined
    const initial = parseValue(mode, isControlled ? value : (defaultValue ?? null))

    const [open, setOpen] = useState(false)
    const [viewDate, setViewDate] = useState(() =>
        startOfMonth(initial.single ?? initial.start ?? new Date()),
    )
    const [selectedDate, setSelectedDate] = useState<Date | null>(initial.single)
    const [rangeStart, setRangeStart] = useState<Date | null>(initial.start)
    const [rangeEnd, setRangeEnd] = useState<Date | null>(initial.end)
    const [rangeSelecting, setRangeSelecting] = useState<'start' | 'end'>(
        initial.start && !initial.end ? 'end' : 'start',
    )
    const [hoverDate, setHoverDate] = useState<Date | null>(null)
    const [view, setView] = useState<CalendarView>('days')
    const containerRef = useRef<HTMLDivElement>(null)

    // Reconcile internal state with a controlled value during render
    // (React's endorsed "adjust state when a prop changes" pattern).
    const valueKey = isControlled ? JSON.stringify(value ?? null) : ''
    const [lastValueKey, setLastValueKey] = useState(valueKey)
    if (isControlled && valueKey !== lastValueKey) {
        const p = parseValue(mode, value ?? null)
        setSelectedDate(p.single)
        setRangeStart(p.start)
        setRangeEnd(p.end)
        setRangeSelecting(p.start && !p.end ? 'end' : 'start')
        setLastValueKey(valueKey)
    }

    // Close on outside click.
    useEffect(() => {
        if (!open) return
        function handle(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    const days = useMemo(() => buildCalendar(viewDate), [viewDate])

    const matchDisabled = useMemo(() => normalizeMatcher(disabledDates), [disabledDates])
    const matchError = useMemo(() => normalizeMatcher(errorDates), [errorDates])
    const minD = useMemo(() => parseISO(minDate), [minDate])
    const maxD = useMemo(() => parseISO(maxDate), [maxDate])

    function dayStatus(date: Date): DayStatus {
        if (matchError(date)) return 'error'
        if (matchDisabled(date)) return 'disabled'
        if (minD && date < minD) return 'disabled'
        if (maxD && date > maxD) return 'disabled'
        return 'normal'
    }

    const hasValue = isRange ? !!(rangeStart || rangeEnd) : !!selectedDate
    const monthLabel = viewDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

    const triggerLabel = (() => {
        if (isRange) {
            if (!rangeStart && !rangeEnd) return ''
            const s = rangeStart ? formatShort(rangeStart) : '…'
            const e = rangeEnd ? formatShort(rangeEnd) : '…'
            return `${s} → ${e}`
        }
        return selectedDate ? formatLong(selectedDate) : ''
    })()

    const rangeHint = (() => {
        if (!isRange) return ''
        if (rangeSelecting === 'start') return 'Select start date'
        return rangeStart
            ? `From ${formatShort(rangeStart)} — select end date`
            : 'Select end date'
    })()

    // Visual range bounds, accounting for hover preview and reversed selection.
    const { vStart, vEnd } = (() => {
        if (!rangeStart) return { vStart: null as Date | null, vEnd: null as Date | null }
        const end = rangeEnd ?? (rangeSelecting === 'end' ? hoverDate : null)
        if (!end) return { vStart: rangeStart, vEnd: null as Date | null }
        return rangeStart <= end
            ? { vStart: rangeStart, vEnd: end }
            : { vStart: end, vEnd: rangeStart }
    })()

    function isInRange(day: PickerDay) {
        return !!vStart && !!vEnd && day.date >= vStart && day.date <= vEnd
    }
    function isVisualStart(day: PickerDay) {
        return !!vStart && sameDay(day.date, vStart)
    }
    function isVisualEnd(day: PickerDay) {
        return !!vEnd && sameDay(day.date, vEnd)
    }

    function emitSingle(date: Date | null) {
        onChange?.(date ? toISO(date) : '')
    }
    function emitRange(s: Date | null, e: Date | null) {
        onChange?.({ start: s ? toISO(s) : '', end: e ? toISO(e) : '' })
    }

    function toggle() {
        if (disabled) return
        if (open) {
            setOpen(false)
            return
        }
        const base = (isRange ? rangeStart : selectedDate) ?? new Date()
        setViewDate(startOfMonth(base))
        setHoverDate(null)
        setView('days')
        setRangeSelecting(isRange && rangeStart && !rangeEnd ? 'end' : 'start')
        setOpen(true)
    }

    function goPrev() {
        const y = viewDate.getFullYear()
        const m = viewDate.getMonth()
        if (view === 'days') setViewDate(new Date(y, m - 1, 1))
        else if (view === 'months') setViewDate(new Date(y - 1, m, 1))
        else setViewDate(new Date(y - YEARS_PER_PAGE, m, 1))
    }

    function goNext() {
        const y = viewDate.getFullYear()
        const m = viewDate.getMonth()
        if (view === 'days') setViewDate(new Date(y, m + 1, 1))
        else if (view === 'months') setViewDate(new Date(y + 1, m, 1))
        else setViewDate(new Date(y + YEARS_PER_PAGE, m, 1))
    }

    // Header label drills up: days -> months -> years.
    function cycleHeaderView() {
        setView((v) => (v === 'days' ? 'months' : 'years'))
    }

    function selectMonth(monthIndex: number) {
        setViewDate(new Date(viewDate.getFullYear(), monthIndex, 1))
        setView('days')
    }

    function selectYear(year: number) {
        setViewDate(new Date(year, viewDate.getMonth(), 1))
        setView('months')
    }

    function goToday() {
        setViewDate(startOfMonth(new Date()))
        setView('days')
    }

    function selectDate(day: PickerDay) {
        if (dayStatus(day.date) !== 'normal') return

        if (!isRange) {
            setSelectedDate(day.date)
            emitSingle(day.date)
            setOpen(false)
            return
        }

        if (rangeSelecting === 'start') {
            setRangeStart(day.date)
            setRangeEnd(null)
            setRangeSelecting('end')
        } else if (rangeStart && day.date >= rangeStart) {
            setRangeEnd(day.date)
            emitRange(rangeStart, day.date)
            setRangeSelecting('start')
            setOpen(false)
        } else {
            // Clicked before the start — treat as a new start.
            setRangeStart(day.date)
            setRangeEnd(null)
        }
    }

    function clearValue(event: ReactMouseEvent) {
        event.stopPropagation()
        if (isRange) {
            setRangeStart(null)
            setRangeEnd(null)
            setRangeSelecting('start')
            emitRange(null, null)
        } else {
            setSelectedDate(null)
            emitSingle(null)
        }
    }

    function dayClass(day: PickerDay): string {
        const base =
            'relative z-10 grid h-8 w-8 place-items-center rounded-full text-xs transition-colors duration-100 '

        const status = dayStatus(day.date)
        if (status === 'error')
            return base + 'cursor-not-allowed bg-red-50 font-medium text-red-500 line-through'
        if (status === 'disabled')
            return base + 'cursor-not-allowed font-normal text-neutral-300 line-through decoration-neutral-200'

        if (!isRange) {
            if (selectedDate && sameDay(day.date, selectedDate))
                return base + 'bg-neutral-950 font-bold text-white'
            if (day.isToday)
                return base + 'border-2 border-neutral-950 font-bold text-neutral-900 hover:bg-neutral-100'
            if (day.isCurrentMonth) return base + 'font-medium text-neutral-700 hover:bg-neutral-100'
            return base + 'font-normal text-neutral-300 hover:bg-neutral-50'
        }

        const start = isVisualStart(day)
        const end = isVisualEnd(day)
        const inRange = isInRange(day)

        if (start || end) return base + 'bg-neutral-950 font-bold text-white'
        if (day.isToday && !inRange)
            return base + 'border-2 border-neutral-950 font-bold text-neutral-900 hover:bg-neutral-200'
        if (inRange)
            return (
                base +
                (day.isCurrentMonth
                    ? 'font-medium text-neutral-900 hover:bg-neutral-200'
                    : 'font-normal text-neutral-500')
            )
        if (day.isCurrentMonth) return base + 'font-medium text-neutral-700 hover:bg-neutral-100'
        return base + 'font-normal text-neutral-300 hover:bg-neutral-50'
    }

    const today = new Date()
    const yearPageStart =
        Math.floor(viewDate.getFullYear() / YEARS_PER_PAGE) * YEARS_PER_PAGE
    const yearPage = Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearPageStart + i)
    const headerLabel =
        view === 'days'
            ? monthLabel
            : view === 'months'
              ? String(viewDate.getFullYear())
              : `${yearPageStart} – ${yearPageStart + YEARS_PER_PAGE - 1}`

    const gridCellClass = (selected: boolean, isCurrent: boolean) =>
        [
            'h-9 rounded-xl text-sm transition-colors duration-150',
            selected
                ? 'bg-neutral-950 font-semibold text-white'
                : isCurrent
                  ? 'border border-neutral-950 font-semibold text-neutral-900 hover:bg-neutral-100'
                  : 'font-medium text-neutral-700 hover:bg-neutral-100',
        ].join(' ')

    const triggerClasses = [
        'group flex w-full items-center gap-3 rounded-xl border bg-neutral-50 py-2.5 pl-4 pr-3 text-sm outline-none transition-all duration-150',
        open
            ? 'border-neutral-400 bg-white ring-2 ring-neutral-200'
            : 'border-neutral-200 hover:border-neutral-300 hover:bg-white',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ].join(' ')

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Trigger */}
            <button type="button" onClick={toggle} disabled={disabled} className={triggerClasses}>
                <i className="fa-regular fa-calendar shrink-0 text-sm text-neutral-400" aria-hidden="true" />
                <span
                    className={`flex-1 text-left ${hasValue ? 'font-semibold text-neutral-900' : 'font-normal text-neutral-400'}`}
                >
                    {hasValue ? triggerLabel : placeholder}
                </span>
                {hasValue && !disabled ? (
                    <span
                        onClick={clearValue}
                        role="button"
                        aria-label="Clear"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors duration-150 hover:bg-neutral-200 hover:text-neutral-600"
                    >
                        <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
                    </span>
                ) : (
                    <i
                        className={`fa-solid fa-chevron-down shrink-0 text-[10px] text-neutral-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div
                    className={`absolute left-0 top-full z-50 mt-2 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xl ${isRange ? 'w-80' : 'w-72'}`}
                >
                    {/* Header nav */}
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={goPrev}
                            aria-label="Previous"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neutral-200 text-neutral-500 transition-colors duration-150 hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={cycleHeaderView}
                            disabled={view === 'years'}
                            className="flex-1 rounded-lg py-1 text-sm font-bold text-neutral-900 transition-colors duration-150 hover:bg-neutral-100 disabled:cursor-default disabled:hover:bg-transparent"
                        >
                            {headerLabel}
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            aria-label="Next"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-neutral-200 text-neutral-500 transition-colors duration-150 hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
                        </button>
                    </div>

                    {/* Days view */}
                    {view === 'days' && (
                        <>
                            {isRange && (
                                <p className="mb-3 text-center text-[11px] font-medium text-neutral-400">
                                    {rangeHint}
                                </p>
                            )}

                            <div className="mb-1 grid grid-cols-7">
                                {WEEKDAYS.map((d) => (
                                    <div
                                        key={d}
                                        className="py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-neutral-400"
                                    >
                                        {d}
                                    </div>
                                ))}
                            </div>

                            <div
                                className="grid grid-cols-7"
                                onMouseLeave={() => setHoverDate(null)}
                            >
                                {days.map((day) => (
                                    <div
                                        key={day.date.toISOString()}
                                        className="relative flex h-9 items-center justify-center"
                                    >
                                        {isRange && isInRange(day) && (
                                            <>
                                                {!isVisualStart(day) && (
                                                    <div className="pointer-events-none absolute inset-y-0.5 left-0 right-1/2 bg-neutral-100" />
                                                )}
                                                {!isVisualEnd(day) && (
                                                    <div className="pointer-events-none absolute inset-y-0.5 left-1/2 right-0 bg-neutral-100" />
                                                )}
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            disabled={dayStatus(day.date) !== 'normal'}
                                            onClick={() => selectDate(day)}
                                            onMouseEnter={() => {
                                                if (
                                                    isRange &&
                                                    rangeSelecting === 'end' &&
                                                    dayStatus(day.date) === 'normal'
                                                )
                                                    setHoverDate(day.date)
                                            }}
                                            className={dayClass(day)}
                                        >
                                            {day.date.getDate()}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Months view */}
                    {view === 'months' && (
                        <div className="grid grid-cols-3 gap-1">
                            {MONTHS.map((label, i) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => selectMonth(i)}
                                    className={gridCellClass(
                                        i === viewDate.getMonth(),
                                        i === today.getMonth() &&
                                            viewDate.getFullYear() === today.getFullYear(),
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Years view */}
                    {view === 'years' && (
                        <div className="grid grid-cols-3 gap-1">
                            {yearPage.map((yr) => (
                                <button
                                    key={yr}
                                    type="button"
                                    onClick={() => selectYear(yr)}
                                    className={gridCellClass(
                                        yr === viewDate.getFullYear(),
                                        yr === today.getFullYear(),
                                    )}
                                >
                                    {yr}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Footer */}
                    <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                        <button
                            type="button"
                            onClick={goToday}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-regular fa-calendar-check" aria-hidden="true" />
                            Today
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
