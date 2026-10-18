import DatePicker, { type DatePickerValue } from '../DatePicker'
import { addDays, todayKey } from '../../lib/calendar'

interface Props {
    date: string
    onChange: (date: string) => void
}

export default function DashboardDateNav({ date, onChange }: Props) {
    const isToday = date === todayKey()

    return (
        // One tidy full-width row on phones: left-packing these wrapped "Today"
        // onto a line of its own, which read as a mistake.
        <div className="flex w-full items-center gap-2 lg:w-auto">
            <button
                type="button"
                onClick={() => onChange(addDays(date, -1))}
                aria-label="Previous day"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900"
            >
                <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
            </button>

            <div className="min-w-0 flex-1 lg:w-auto lg:flex-none">
                <DatePicker
                    value={date}
                    onChange={(v: DatePickerValue) => {
                        if (typeof v === 'string' && v) onChange(v)
                    }}
                />
            </div>

            <button
                type="button"
                onClick={() => onChange(addDays(date, 1))}
                aria-label="Next day"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-600 transition-colors hover:border-neutral-300 hover:text-neutral-900"
            >
                <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
            </button>

            <button
                type="button"
                onClick={() => onChange(todayKey())}
                disabled={isToday}
                className="h-11 shrink-0 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:text-neutral-900 disabled:opacity-40 disabled:hover:border-neutral-200"
            >
                Today
            </button>
        </div>
    )
}
