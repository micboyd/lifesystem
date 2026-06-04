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
    const containerRef = useRef<HTMLDivElement>(null)
    const hourColRef = useRef<HTMLDivElement>(null)
    const minuteColRef = useRef<HTMLDivElement>(null)

    const step = Math.min(Math.max(Math.floor(minuteStep) || 5, 1), 60)
    const minM = useMemo(() => {
        const t = parseTime(minTime)
        return t ? toMinutes(t) : null
    }, [minTime])
    const maxM = useMemo(() => {
        const t = parseTime(maxTime)
        return t ? toMinutes(t) : null
    }, [maxTime])

    const hours = useMemo(
        () => (use12Hour ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i)),
        [use12Hour],
    )
    const minutes = useMemo(
        () => Array.from({ length: Math.ceil(60 / step) }, (_, i) => i * step),
        [step],
    )

    // For 12-hour mode we need an AM/PM toggle; default to the current value's period or AM.
    const [period, setPeriod] = useState<'AM' | 'PM'>(current && current.hour >= 12 ? 'PM' : 'AM')

    // Keep the period in sync when a controlled value changes underneath us.
    const valueKey = isControlled ? (value ?? '') : ''
    const [lastValueKey, setLastValueKey] = useState(valueKey)
    if (isControlled && valueKey !== lastValueKey) {
        setPeriod(current && current.hour >= 12 ? 'PM' : 'AM')
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

    // Scroll the selected hour/minute into view when opening.
    useEffect(() => {
        if (!open) return
        const scrollSelected = (col: HTMLDivElement | null) => {
            const selected = col?.querySelector<HTMLElement>('[data-selected="true"]')
            selected?.scrollIntoView({ block: 'center' })
        }
        scrollSelected(hourColRef.current)
        scrollSelected(minuteColRef.current)
    }, [open])

    function isDisabled(time: ParsedTime): boolean {
        const m = toMinutes(time)
        if (minM !== null && m < minM) return true
        if (maxM !== null && m > maxM) return true
        return false
    }

    function displayHour(hour24: number): number {
        if (!use12Hour) return hour24
        return hour24 % 12 === 0 ? 12 : hour24 % 12
    }

    function commit(time: ParsedTime) {
        if (isDisabled(time)) return
        if (!isControlled) setInternal(time)
        onChange?.(toISO(time))
    }

    function selectHour(displayValue: number) {
        let hour24 = displayValue
        if (use12Hour) {
            hour24 = period === 'PM' ? (displayValue % 12) + 12 : displayValue % 12
        }
        commit({ hour: hour24, minute: current?.minute ?? 0 })
    }

    function selectMinute(minute: number) {
        const hour = current?.hour ?? (use12Hour ? (period === 'PM' ? 12 : 0) : 0)
        commit({ hour, minute })
    }

    function selectPeriod(next: 'AM' | 'PM') {
        setPeriod(next)
        if (!current) return
        const base = current.hour % 12
        const hour24 = next === 'PM' ? base + 12 : base
        commit({ hour: hour24, minute: current.minute })
    }

    function clearValue(event: ReactMouseEvent) {
        event.stopPropagation()
        if (!isControlled) setInternal(null)
        onChange?.(null)
    }

    function selectNow() {
        const now = new Date()
        const rounded = Math.round(now.getMinutes() / step) * step
        const minute = rounded >= 60 ? 0 : rounded
        const hour = rounded >= 60 ? (now.getHours() + 1) % 24 : now.getHours()
        const time = { hour, minute }
        if (isDisabled(time)) return
        setPeriod(hour >= 12 ? 'PM' : 'AM')
        commit(time)
    }

    const hasValue = !!current
    const currentDisplayHour = current ? displayHour(current.hour) : null

    const triggerClasses = [
        'group flex w-full items-center gap-3 rounded-xl border bg-neutral-50 py-2.5 pl-4 pr-3 text-sm outline-none transition-all duration-150',
        open
            ? 'border-neutral-400 bg-white ring-2 ring-neutral-200'
            : 'border-neutral-200 hover:border-neutral-300 hover:bg-white',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ].join(' ')

    const colItemClass = (selected: boolean, itemDisabled: boolean) =>
        [
            'w-full rounded-lg px-3 py-1.5 text-center text-sm tabular-nums transition-colors duration-100',
            itemDisabled
                ? 'cursor-not-allowed font-normal text-neutral-300 line-through'
                : selected
                  ? 'bg-neutral-950 font-semibold text-white'
                  : 'font-medium text-neutral-700 hover:bg-neutral-100',
        ].join(' ')

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => !disabled && setOpen((o) => !o)}
                disabled={disabled}
                className={triggerClasses}
            >
                <i className="fa-regular fa-clock shrink-0 text-sm text-neutral-400" aria-hidden="true" />
                <span
                    className={`flex-1 text-left ${hasValue ? 'font-semibold text-neutral-900' : 'font-normal text-neutral-400'}`}
                >
                    {hasValue ? formatDisplay(current!, use12Hour) : placeholder}
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
                    className={`absolute top-full z-50 mt-2 w-56 rounded-2xl border border-neutral-100 bg-white p-3 shadow-xl ${
                        align === 'right' ? 'right-0' : 'left-0'
                    }`}
                >
                    <div className="flex gap-2">
                        {/* Hours */}
                        <div className="flex-1">
                            <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                Hour
                            </p>
                            <div
                                ref={hourColRef}
                                className="max-h-48 space-y-0.5 overflow-y-auto pr-1"
                            >
                                {hours.map((h) => {
                                    const hour24 = use12Hour
                                        ? period === 'PM'
                                            ? (h % 12) + 12
                                            : h % 12
                                        : h
                                    const itemDisabled = isDisabled({
                                        hour: hour24,
                                        minute: current?.minute ?? 0,
                                    })
                                    const selected = currentDisplayHour === h
                                    return (
                                        <button
                                            key={h}
                                            type="button"
                                            data-selected={selected}
                                            disabled={itemDisabled}
                                            onClick={() => selectHour(h)}
                                            className={colItemClass(selected, itemDisabled)}
                                        >
                                            {use12Hour ? h : String(h).padStart(2, '0')}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Minutes */}
                        <div className="flex-1">
                            <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                Min
                            </p>
                            <div
                                ref={minuteColRef}
                                className="max-h-48 space-y-0.5 overflow-y-auto pr-1"
                            >
                                {minutes.map((m) => {
                                    const itemDisabled = isDisabled({
                                        hour: current?.hour ?? (use12Hour ? (period === 'PM' ? 12 : 0) : 0),
                                        minute: m,
                                    })
                                    const selected = current?.minute === m
                                    return (
                                        <button
                                            key={m}
                                            type="button"
                                            data-selected={selected}
                                            disabled={itemDisabled}
                                            onClick={() => selectMinute(m)}
                                            className={colItemClass(selected, itemDisabled)}
                                        >
                                            {String(m).padStart(2, '0')}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* AM/PM */}
                        {use12Hour && (
                            <div className="flex flex-col gap-0.5">
                                <p className="mb-1 text-center text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                    &nbsp;
                                </p>
                                {(['AM', 'PM'] as const).map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => selectPeriod(p)}
                                        className={[
                                            'rounded-lg px-3 py-1.5 text-center text-sm transition-colors duration-100',
                                            period === p
                                                ? 'bg-neutral-950 font-semibold text-white'
                                                : 'font-medium text-neutral-700 hover:bg-neutral-100',
                                        ].join(' ')}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2">
                        <button
                            type="button"
                            onClick={selectNow}
                            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-regular fa-clock" aria-hidden="true" />
                            Now
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
