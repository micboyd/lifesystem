import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'

export type TimePickerValue = string | null

interface TimePickerProps {
    /** Controlled value as 24-hour "HH:mm" (e.g. "14:30"). */
    value?: TimePickerValue
    /** Uncontrolled initial value as 24-hour "HH:mm". */
    defaultValue?: TimePickerValue
    onChange?: (value: TimePickerValue) => void
    placeholder?: string
    /** Display the dropdown and trigger in 12-hour (AM/PM) format. */
    use12Hour?: boolean
    /** Which edge of the trigger the dropdown is anchored to. Defaults to "left". */
    align?: 'left' | 'right'
    /** Minute increment between selectable options. Defaults to 5. */
    minuteStep?: number
    /** Earliest selectable time, inclusive ("HH:mm"). Earlier times are disabled. */
    minTime?: string
    /** Latest selectable time, inclusive ("HH:mm"). Later times are disabled. */
    maxTime?: string
    disabled?: boolean
    className?: string
}

interface ParsedTime {
    hour: number
    minute: number
}

function parseTime(value?: string | null): ParsedTime | null {
    if (!value) return null
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return { hour, minute }
}

function toMinutes(time: ParsedTime): number {
    return time.hour * 60 + time.minute
}

function toISO(time: ParsedTime): string {
    return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
}

function formatDisplay(time: ParsedTime, use12Hour: boolean): string {
    if (!use12Hour) return toISO(time)
    const period = time.hour < 12 ? 'AM' : 'PM'
    const hour12 = time.hour % 12 === 0 ? 12 : time.hour % 12
    return `${hour12}:${String(time.minute).padStart(2, '0')} ${period}`
}

// Common times shown in the quick-select grid (24h internally)
const QUICK_TIMES: ParsedTime[] = [8, 9, 10, 12, 13, 14, 17, 18, 20].map((h) => ({ hour: h, minute: 0 }))

export default function TimePicker({
    value,
    defaultValue,
    onChange,
    placeholder = 'Select a time',
    use12Hour = false,
    align = 'left',
    minuteStep = 5,
    minTime,
    maxTime,
    disabled = false,
    className = '',
}: TimePickerProps) {
    const isControlled = value !== undefined
    const [internal, setInternal] = useState<ParsedTime | null>(() =>
        parseTime(isControlled ? value : (defaultValue ?? null)),
    )
    const current = isControlled ? parseTime(value) : internal

    const [open, setOpen] = useState(false)
    const [period, setPeriod] = useState<'AM' | 'PM'>(current && current.hour >= 12 ? 'PM' : 'AM')

    // Inline draft editing for the spinner digits
    const [hourDraft, setHourDraft] = useState<string | null>(null)
    const [minuteDraft, setMinuteDraft] = useState<string | null>(null)

    const containerRef = useRef<HTMLDivElement>(null)
    const hourInputRef = useRef<HTMLInputElement>(null)
    const minuteInputRef = useRef<HTMLInputElement>(null)

    const step = Math.min(Math.max(Math.floor(minuteStep) || 5, 1), 60)

    const minM = useMemo(() => { const t = parseTime(minTime); return t ? toMinutes(t) : null }, [minTime])
    const maxM = useMemo(() => { const t = parseTime(maxTime); return t ? toMinutes(t) : null }, [maxTime])
    const minutes = useMemo(() => Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step), [step])

    // Sync period when controlled value changes
    const valueKey = isControlled ? (value ?? '') : ''
    const [lastValueKey, setLastValueKey] = useState(valueKey)
    if (isControlled && valueKey !== lastValueKey) {
        setPeriod(current && current.hour >= 12 ? 'PM' : 'AM')
        setLastValueKey(valueKey)
    }

    // Close on outside click
    useEffect(() => {
        if (!open) return
        function handle(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    // Focus hour input when it mounts
    useEffect(() => { if (hourDraft !== null) hourInputRef.current?.focus() }, [hourDraft])
    useEffect(() => { if (minuteDraft !== null) minuteInputRef.current?.focus() }, [minuteDraft])

    function isDisabled(time: ParsedTime): boolean {
        const m = toMinutes(time)
        if (minM !== null && m < minM) return true
        if (maxM !== null && m > maxM) return true
        return false
    }

    function commit(time: ParsedTime) {
        if (isDisabled(time)) return
        if (!isControlled) setInternal(time)
        onChange?.(toISO(time))
    }

    // Derived display hour (1-12 for 12h, 0-23 for 24h)
    const displayHour = current
        ? use12Hour ? (current.hour % 12 === 0 ? 12 : current.hour % 12) : current.hour
        : null

    // ── Hour controls ──────────────────────────────────────────────────────────

    function incrementHour() {
        if (use12Hour) {
            const dh = displayHour ?? 11
            const next = dh === 12 ? 1 : dh + 1
            commit({ hour: period === 'PM' ? (next % 12) + 12 : next % 12, minute: current?.minute ?? 0 })
        } else {
            commit({ hour: ((current?.hour ?? -1) + 1) % 24, minute: current?.minute ?? 0 })
        }
    }

    function decrementHour() {
        if (use12Hour) {
            const dh = displayHour ?? 2
            const next = dh === 1 ? 12 : dh - 1
            commit({ hour: period === 'PM' ? (next % 12) + 12 : next % 12, minute: current?.minute ?? 0 })
        } else {
            commit({ hour: ((current?.hour ?? 0) - 1 + 24) % 24, minute: current?.minute ?? 0 })
        }
    }

    function commitHourDraft() {
        if (hourDraft === null) return
        const n = parseInt(hourDraft, 10)
        let hour24: number
        if (use12Hour) {
            if (isNaN(n) || n < 1 || n > 12) { setHourDraft(null); return }
            hour24 = period === 'PM' ? (n % 12) + 12 : n % 12
        } else {
            if (isNaN(n) || n < 0 || n > 23) { setHourDraft(null); return }
            hour24 = n
        }
        commit({ hour: hour24, minute: current?.minute ?? 0 })
        setHourDraft(null)
    }

    // ── Minute controls ────────────────────────────────────────────────────────

    function incrementMinute() {
        const curMin = current?.minute ?? -1
        const next = minutes.find((m) => m > curMin) ?? minutes[0]
        commit({ hour: current?.hour ?? 0, minute: next })
    }

    function decrementMinute() {
        const curMin = current?.minute ?? step + 1
        const prev = [...minutes].reverse().find((m) => m < curMin) ?? minutes[minutes.length - 1]
        commit({ hour: current?.hour ?? 0, minute: prev })
    }

    function commitMinuteDraft() {
        if (minuteDraft === null) return
        const n = parseInt(minuteDraft, 10)
        if (isNaN(n) || n < 0 || n > 59) { setMinuteDraft(null); return }
        const snapped = Math.min(Math.round(n / step) * step, 59)
        commit({ hour: current?.hour ?? 0, minute: snapped })
        setMinuteDraft(null)
    }

    // ── Period / quick / now ───────────────────────────────────────────────────

    function selectPeriod(next: 'AM' | 'PM') {
        setPeriod(next)
        if (!current) return
        commit({ hour: next === 'PM' ? (current.hour % 12) + 12 : current.hour % 12, minute: current.minute })
    }

    function selectQuickTime(t: ParsedTime) {
        if (isDisabled(t)) return
        setPeriod(t.hour >= 12 ? 'PM' : 'AM')
        commit(t)
    }

    function selectNow() {
        const now = new Date()
        const rounded = Math.round(now.getMinutes() / step) * step
        const minute = rounded >= 60 ? 0 : rounded
        const hour = rounded >= 60 ? (now.getHours() + 1) % 24 : now.getHours()
        const t = { hour, minute }
        if (isDisabled(t)) return
        setPeriod(hour >= 12 ? 'PM' : 'AM')
        commit(t)
    }

    function clearValue(e: ReactMouseEvent) {
        e.stopPropagation()
        if (!isControlled) setInternal(null)
        onChange?.(null)
    }

    function formatQuickLabel(t: ParsedTime): string {
        if (!use12Hour) return toISO(t)
        const p = t.hour < 12 ? 'AM' : 'PM'
        const h = t.hour % 12 === 0 ? 12 : t.hour % 12
        return t.minute === 0 ? `${h} ${p}` : `${h}:${String(t.minute).padStart(2, '0')} ${p}`
    }

    const hasValue = !!current
    const quickTimes = QUICK_TIMES.filter((t) => !isDisabled(t))

    const triggerClasses = [
        'group flex w-full items-center gap-3 rounded-xl border bg-neutral-50 py-2.5 pl-4 pr-3 text-sm outline-none transition-all duration-150',
        open ? 'border-neutral-400 bg-white ring-2 ring-neutral-200' : 'border-neutral-200 hover:border-neutral-300 hover:bg-white',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ].join(' ')

    const spinnerBtn = 'grid h-7 w-7 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 active:bg-neutral-200'

    const digitDisplay = 'h-12 w-14 rounded-xl border border-neutral-100 text-center text-2xl font-bold tabular-nums text-neutral-900 transition-colors hover:border-neutral-300 hover:bg-neutral-50'
    const digitInput   = 'h-12 w-14 rounded-xl border border-neutral-950 bg-white text-center text-2xl font-bold tabular-nums text-neutral-900 focus:outline-none'

    return (
        <div ref={containerRef} className={`relative ${className}`}>

            {/* ── Trigger ── */}
            <button
                type="button"
                onClick={() => !disabled && setOpen((o) => !o)}
                disabled={disabled}
                className={triggerClasses}
            >
                <i className="fa-solid fa-clock shrink-0 text-sm text-neutral-400" aria-hidden="true" />
                <span className={`flex-1 text-left whitespace-nowrap ${hasValue ? 'font-semibold text-neutral-900' : 'font-normal text-neutral-400'}`}>
                    {hasValue ? formatDisplay(current!, use12Hour) : placeholder}
                </span>
                {hasValue && !disabled ? (
                    <span
                        onClick={clearValue}
                        role="button"
                        aria-label="Clear"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-200 hover:text-neutral-600"
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

            {/* ── Dropdown ── */}
            {open && (
                <div
                    className={[
                        'absolute top-full z-50 mt-2 rounded-2xl border border-neutral-100 bg-white shadow-xl',
                        align === 'right' ? 'right-0' : 'left-0',
                        use12Hour ? 'w-72' : 'w-60',
                    ].join(' ')}
                >
                    {/* Spinner */}
                    <div className="flex items-center justify-center gap-2 px-5 pt-4 pb-3">

                        {/* Hours */}
                        <div className="flex flex-col items-center gap-1">
                            <button type="button" onClick={incrementHour} className={spinnerBtn}>
                                <i className="fa-solid fa-chevron-up text-xs" aria-hidden="true" />
                            </button>
                            {hourDraft !== null ? (
                                <input
                                    ref={hourInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={hourDraft}
                                    onChange={(e) => setHourDraft(e.target.value)}
                                    onBlur={commitHourDraft}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitHourDraft()
                                        if (e.key === 'Escape') setHourDraft(null)
                                    }}
                                    className={digitInput}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setHourDraft(displayHour !== null ? String(displayHour) : '')}
                                    className={digitDisplay}
                                >
                                    {displayHour !== null ? String(displayHour).padStart(2, '0') : '--'}
                                </button>
                            )}
                            <button type="button" onClick={decrementHour} className={spinnerBtn}>
                                <i className="fa-solid fa-chevron-down text-xs" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Separator */}
                        <span className="mb-0.5 text-2xl font-bold text-neutral-200 select-none">:</span>

                        {/* Minutes */}
                        <div className="flex flex-col items-center gap-1">
                            <button type="button" onClick={incrementMinute} className={spinnerBtn}>
                                <i className="fa-solid fa-chevron-up text-xs" aria-hidden="true" />
                            </button>
                            {minuteDraft !== null ? (
                                <input
                                    ref={minuteInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    value={minuteDraft}
                                    onChange={(e) => setMinuteDraft(e.target.value)}
                                    onBlur={commitMinuteDraft}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitMinuteDraft()
                                        if (e.key === 'Escape') setMinuteDraft(null)
                                    }}
                                    className={digitInput}
                                />
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setMinuteDraft(current !== null ? String(current.minute) : '')}
                                    className={digitDisplay}
                                >
                                    {current !== null ? String(current.minute).padStart(2, '0') : '--'}
                                </button>
                            )}
                            <button type="button" onClick={decrementMinute} className={spinnerBtn}>
                                <i className="fa-solid fa-chevron-down text-xs" aria-hidden="true" />
                            </button>
                        </div>

                        {/* AM / PM */}
                        {use12Hour && (
                            <div className="flex flex-col gap-1 ml-2">
                                {(['AM', 'PM'] as const).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => selectPeriod(p)}
                                        className={[
                                            'rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                                            period === p
                                                ? 'bg-neutral-950 text-white'
                                                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900',
                                        ].join(' ')}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Quick select */}
                    {quickTimes.length > 0 && (
                        <div className="border-t border-neutral-100 px-3 py-2.5">
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                Quick select
                            </p>
                            <div className="grid grid-cols-3 gap-1">
                                {quickTimes.map((t) => {
                                    const selected = current?.hour === t.hour && current?.minute === t.minute
                                    return (
                                        <button
                                            key={`${t.hour}:${t.minute}`}
                                            type="button"
                                            onClick={() => selectQuickTime(t)}
                                            className={[
                                                'rounded-lg py-1.5 text-xs font-medium transition-colors',
                                                selected
                                                    ? 'bg-neutral-950 font-semibold text-white'
                                                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                                            ].join(' ')}
                                        >
                                            {formatQuickLabel(t)}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-neutral-100 px-3 py-2">
                        <button
                            type="button"
                            onClick={selectNow}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-clock text-[10px]" aria-hidden="true" />
                            Now
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
