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
    /** Leave out the "Repeats" switch — the caller shows its own (e.g. a setting row). */
    bare?: boolean
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
    bare = false,
}: RecurrencePickerProps) {
    return (
        <div className="flex flex-col gap-3">
            {!bare && <Switch checked={enabled} onChange={onEnabledChange} label="Repeats" />}
            {enabled && (
                <>
                    <div className="flex flex-wrap gap-2">
                        {RECURRENCE_FREQUENCIES.map((f) => (
                            <button
                                key={f}
                                type="button"
                                onClick={() => onFrequencyChange(f)}
                                aria-pressed={frequency === f}
                                className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                    frequency === f
                                        ? 'bg-neutral-900 text-neutral-50'
                                        : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                                }`}
                            >
                                {RECURRENCE_LABELS[f]}
                            </button>
                        ))}
                    </div>
                    {frequency === 'lastWeekday' && (
                        <p className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <i className="fa-solid fa-circle-info text-[11px]" aria-hidden="true" />
                            Repeats on the last weekday (Mon–Fri) of each month.
                        </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[13px] font-medium text-neutral-700">
                            Ends on <span className="font-normal text-neutral-500">(optional)</span>
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
