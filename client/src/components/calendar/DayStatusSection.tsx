import { useEffect, useState } from 'react'
import DatePicker, { type DateRange } from '../DatePicker'
import { Card } from '../Card'
import Button from '../Button'
import {
    listStatuses,
    createStatus,
    updateStatus,
    deleteStatus,
} from '../../services/dayStatus'
import { DAY_STATUS_OPTIONS, type DayStatus, type DayStatusType } from '../../types'
import { MONTHS } from '../../lib/calendar'

interface Props {
    date: string
    /**
     * Start with the form open (used when launched from the calendar). If the
     * day already has leave, that leave opens for editing with its real range.
     */
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
    // The record the form is editing; null means the form adds a new one.
    const [editingId, setEditingId] = useState<string | null>(null)

    function startEdit(record: DayStatus) {
        setEditingId(record._id)
        setRange({ start: record.startDate, end: record.endDate })
        setSelectedStatus(record.status)
        setAdding(true)
    }

    function closeForm() {
        setAdding(false)
        setEditingId(null)
        setRange({ start: date, end: date })
        setSelectedStatus(null)
    }

    useEffect(() => {
        let active = true
        listStatuses(date, date)
            .then((list) => {
                if (!active) return
                setRecords(list)
                // Opened on a day that already has leave: edit that leave, not a new one-day entry.
                if (defaultAdding && list.length > 0) startEdit(list[0])
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date])

    async function handleSave() {
        if (!selectedStatus || !range.start || !range.end) return
        setSaving(true)
        try {
            if (editingId) {
                const record = await updateStatus(editingId, range.start, range.end, selectedStatus)
                setRecords((prev) => prev.map((r) => (r._id === record._id ? record : r)))
            } else {
                const record = await createStatus(range.start, range.end, selectedStatus)
                setRecords((prev) => [...prev, record])
            }
            closeForm()
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        await deleteStatus(id)
        setRecords((prev) => prev.filter((r) => r._id !== id))
        if (editingId === id) closeForm()
    }

    if (loading) return null

    return (
        <div className="flex flex-col gap-3">
            {/* Existing records */}
            {records.map((record) => {
                const opt = DAY_STATUS_OPTIONS.find((o) => o.value === record.status)!
                const editing = editingId === record._id
                return (
                    <div
                        key={record._id}
                        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${opt.bg} ${editing ? 'border-neutral-900' : 'border-transparent'}`}
                    >
                        <button
                            type="button"
                            onClick={() => startEdit(record)}
                            className="min-w-0 flex-1 text-left"
                            aria-label={`Edit ${opt.label}`}
                        >
                            <p className={`text-sm font-semibold ${opt.text}`}>{opt.label}</p>
                            <p className={`text-xs font-medium ${opt.text} opacity-70`}>
                                {formatRange(record.startDate, record.endDate)}
                            </p>
                        </button>
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
                <Card className="flex flex-col gap-4">
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
                        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
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
                            onClick={handleSave}
                            disabled={saving || !selectedStatus || !range.start || !range.end}
                        >
                            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save'}
                        </Button>
                        <Button variant="ghost" onClick={closeForm}>
                            Cancel
                        </Button>
                    </div>
                </Card>
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
