import { useEffect, useState } from 'react'
import DatePicker, { type DateRange } from '../DatePicker'
import Button from '../Button'
import { listStatuses, createStatus, deleteStatus } from '../../services/dayStatus'
import { DAY_STATUS_OPTIONS, type DayStatus, type DayStatusType } from '../../types'
import { MONTHS } from '../../lib/calendar'

interface Props {
    date: string
    /** Start with the add form open (used when launched from the calendar). */
    defaultAdding?: boolean
}

function formatRange(startDate: string, endDate: string) {
    const fmt = (d: string) => {
        const [y, m, day] = d.split('-').map(Number)
        return `${day} ${MONTHS[m - 1]} ${y}`
    }
    return startDate === endDate ? fmt(startDate) : `${fmt(startDate)} → ${fmt(endDate)}`
}

export default function DayStatusSection({ date, defaultAdding = false }: Props) {
    const [records, setRecords] = useState<DayStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(defaultAdding)
    const [saving, setSaving] = useState(false)
    const [range, setRange] = useState<DateRange>({ start: date, end: date })
    const [selectedStatus, setSelectedStatus] = useState<DayStatusType | null>(null)

    useEffect(() => {
        let active = true
        listStatuses(date, date)
            .then((list) => active && setRecords(list))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [date])

    async function handleAdd() {
        if (!selectedStatus || !range.start || !range.end) return
        setSaving(true)
        try {
            const record = await createStatus(range.start, range.end, selectedStatus)
            setRecords((prev) => [...prev, record])
            setAdding(false)
            setRange({ start: date, end: date })
            setSelectedStatus(null)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        await deleteStatus(id)
        setRecords((prev) => prev.filter((r) => r._id !== id))
    }

    if (loading) return null

    return (
        <div className="flex flex-col gap-3">
            {/* Existing records */}
            {records.map((record) => {
                const opt = DAY_STATUS_OPTIONS.find((o) => o.value === record.status)!
                return (
                    <div
                        key={record._id}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${opt.bg} border-transparent`}
                    >
                        <div className="min-w-0">
                            <p className={`text-sm font-semibold ${opt.text}`}>{opt.label}</p>
                            <p className={`text-xs font-medium ${opt.text} opacity-70`}>
                                {formatRange(record.startDate, record.endDate)}
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(record._id)}
                            className="!px-2 !py-1 shrink-0 hover:!bg-black/10"
                        >
                            <i
                                className={`fa-solid fa-xmark text-xs ${opt.text}`}
                                aria-hidden="true"
                            />
                        </Button>
                    </div>
                )
            })}

            {/* Add form */}
            {adding ? (
                <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
                    {/* Status options */}
                    <div className="flex flex-col gap-2">
                        {DAY_STATUS_OPTIONS.map((opt) => {
                            const selected = selectedStatus === opt.value
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setSelectedStatus(opt.value)}
                                    className={[
                                        'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                                        selected
                                            ? `${opt.bg} border-transparent`
                                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
                                    ].join(' ')}
                                >
                                    <span
                                        className={[
                                            'grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors',
                                            selected
                                                ? `border-transparent ${opt.bg}`
                                                : 'border-neutral-300',
                                        ].join(' ')}
                                    >
                                        {selected && (
                                            <span
                                                className={`h-2 w-2 rounded-full ${opt.bg.replace('-100', '-500')}`}
                                            />
                                        )}
                                    </span>
                                    <span
                                        className={`text-sm font-semibold ${selected ? opt.text : 'text-neutral-700'}`}
                                    >
                                        {opt.label}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Date range */}
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Date range
                        </span>
                        <DatePicker
                            mode="range"
                            value={range}
                            onChange={(v) => {
                                if (v && typeof v === 'object' && 'start' in v) {
                                    setRange(v as DateRange)
                                }
                            }}
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button
                            onClick={handleAdd}
                            disabled={saving || !selectedStatus || !range.start || !range.end}
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setAdding(false)
                                setSelectedStatus(null)
                                setRange({ start: date, end: date })
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <Button
                    variant="ghost"
                    size="sm"
                    icon="fa-solid fa-plus"
                    onClick={() => setAdding(true)}
                >
                    Add leave or holiday
                </Button>
            )}
        </div>
    )
}
