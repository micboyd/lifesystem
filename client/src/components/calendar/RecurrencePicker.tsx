import Switch from '../Switch'
import DatePicker from '../DatePicker'
import {
    RECURRENCE_FREQUENCIES,
    RECURRENCE_LABELS,
    type RecurrenceFrequency,
} from '../../types'

interface RecurrencePickerProps {
    enabled: boolean
    onEnabledChange: (enabled: boolean) => void
    frequency: RecurrenceFrequency
    onFrequencyChange: (frequency: RecurrenceFrequency) => void
    /** Empty string means "no end date". */
    endsOn: string
    onEndsOnChange: (endsOn: string) => void
    /** Earliest selectable end date (usually the item's start/end date). */
    minEndDate?: string
}

/**
 * Shared "Repeats" control: an on/off switch plus frequency chips and an
 * optional end date. Used by the event editor and the reminders editor so they
 * share one recurrence vocabulary (including "last weekday of the month").
 */
export default function RecurrencePicker({
    enabled,
    onEnabledChange,
    frequency,
    onFrequencyChange,
    endsOn,
    onEndsOnChange,
    minEndDate,
}: RecurrencePickerProps) {
    return (
        <div className="flex flex-col gap-3">
            <Switch checked={enabled} onChange={onEnabledChange} label="Repeats" />
            {enabled && (
                <>
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                        {RECURRENCE_FREQUENCIES.map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => onFrequencyChange(f)}
                                className={[
                                    'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                                    frequency === f
                                        ? 'bg-neutral-950 text-white'
                                        : 'text-neutral-500 hover:text-neutral-900',
                                ].join(' ')}
                            >
                                {RECURRENCE_LABELS[f]}
                            </button>
                        ))}
                    </div>
                    {frequency === 'lastWeekday' && (
                        <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <i className="fa-solid fa-circle-info text-[10px]" aria-hidden="true" />
                            Repeats on the last weekday (Mon–Fri) of each month.
                        </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Ends on{' '}
                            <span className="normal-case font-normal text-neutral-300">
                                (optional)
                            </span>
                        </span>
                        <DatePicker
                            value={endsOn || null}
                            minDate={minEndDate}
                            onChange={(v) => onEndsOnChange(typeof v === 'string' && v ? v : '')}
                            placeholder="No end date"
                        />
                    </div>
                </>
            )}
        </div>
    )
}
