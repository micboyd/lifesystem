import { useMemo, useState } from 'react'
import TimePicker from '../TimePicker'
import Drawer from '../Drawer'
import Button from '../Button'
import { FIELD_LABEL, FIELD_HINT } from '../fieldStyles'
import type { CleaningHome } from '../../types'
import { DAY_SHORT, dowOf, mondayOf, timeboxBlocks, type Schedule } from '../../lib/cleaning'
import { addDays, todayKey, MONTHS } from '../../lib/calendar'
import { formatDuration, timeToMinutes } from '../../lib/time'

const RANGES = [
    { weeks: 1, label: 'Rest of this week' },
    { weeks: 2, label: 'Next 2 weeks' },
    { weeks: 4, label: 'Next 4 weeks' },
]

function shortDate(date: string) {
    const [, m, d] = date.split('-').map(Number)
    return `${DAY_SHORT[dowOf(date)]} ${d} ${MONTHS[m - 1].slice(0, 3)}`
}

/**
 * Put the cleaning days into Timebox as blocks, each listing its jobs.
 * Sending again replaces the cleaning blocks already there for those dates.
 */
export default function TimeboxSendDrawer({
    open,
    home,
    schedule,
    onClose,
    onSend,
}: {
    open: boolean
    home: CleaningHome
    schedule: Schedule
    onClose: () => void
    onSend: (from: string, to: string, startTime: string, blocks: ReturnType<typeof timeboxBlocks>) => Promise<void>
}) {
    const [weeks, setWeeks] = useState(1)
    const [startTime, setStartTime] = useState(home.startTime)
    const [sending, setSending] = useState(false)
    // Reset to the saved start time each time it opens (during render, not in an effect).
    const [shownOpen, setShownOpen] = useState(false)
    if (open !== shownOpen) {
        setShownOpen(open)
        if (open) setStartTime(home.startTime)
    }

    const from = todayKey()
    const to = addDays(mondayOf(from), weeks * 7 - 1)
    const blocks = useMemo(
        () => timeboxBlocks(schedule, { from, to, cycleStart: home.cycleStart, startTime }),
        [schedule, from, to, home.cycleStart, startTime]
    )

    async function send() {
        setSending(true)
        try {
            await onSend(from, to, startTime, blocks)
        } finally {
            setSending(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="lg"
            title="Add to Timebox"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={send} disabled={sending || blocks.length === 0} icon="fa-solid fa-table-list">
                        {sending ? 'Adding…' : `Add ${blocks.length} ${blocks.length === 1 ? 'block' : 'blocks'}`}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>How far ahead</span>
                    <div className="flex flex-wrap gap-2">
                        {RANGES.map((r) => (
                            <button
                                key={r.weeks}
                                type="button"
                                onClick={() => setWeeks(r.weeks)}
                                className={`h-9 rounded-full px-3.5 text-[13px] transition-colors ${
                                    weeks === r.weeks
                                        ? 'bg-neutral-900 text-white'
                                        : 'border border-hairline bg-white text-neutral-700 hover:border-neutral-300'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex w-40 flex-col gap-1.5">
                    <span className={FIELD_LABEL}>Start time</span>
                    <TimePicker value={startTime} onChange={(v) => v && setStartTime(v)} />
                </div>

                <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>Blocks</span>
                    {blocks.length === 0 ? (
                        <p className="text-[13px] text-neutral-500">No cleaning days left in this range.</p>
                    ) : (
                        <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-hairline bg-white">
                            {blocks.map((b) => (
                                <li key={b.date} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
                                    <span className="min-w-0">
                                        <span className="block text-[14px] text-neutral-900">{shortDate(b.date)}</span>
                                        <span className="block truncate text-[12px] text-neutral-500">
                                            {b.notes.split('\n').length} jobs · {b.title.replace(/^Cleaning · /, '')}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-[13px] nums text-neutral-600">
                                        {b.startTime}–{b.endTime}
                                        <span className="text-neutral-400">
                                            {' '}
                                            · {formatDuration(timeToMinutes(b.endTime) - timeToMinutes(b.startTime))}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className={FIELD_HINT}>
                        Each block lists its jobs in its notes. Sending again replaces cleaning blocks already added for these dates.
                    </p>
                </div>
            </div>
        </Drawer>
    )
}
