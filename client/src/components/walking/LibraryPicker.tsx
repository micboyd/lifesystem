import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Drawer from '../Drawer'
import Button from '../Button'
import TimePicker from '../TimePicker'
import { FIELD_HINT, FIELD_LABEL } from '../fieldStyles'
import { formatGoal, formatWalkKm, libraryTitle, SLOT_TIMES, walkEstimate, walkPart } from '../../lib/walking'
import { formatDateShort } from '../../lib/calendar'
import type { DayPart } from '../../lib/yourDay'
import { assignLibraryItem, type Walk, type WalkLibraryItem } from '../../services/walks'

const PART_LABEL: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

/** Put a library walk in a part of the day, or start a new one for that slot. */
export default function LibraryPicker({
    open,
    part,
    date,
    items,
    weightKg,
    onClose,
    onAssigned,
}: {
    open: boolean
    part: DayPart
    date: string
    items: WalkLibraryItem[]
    weightKg: number | null
    onClose: () => void
    onAssigned: (walk: Walk) => void
}) {
    const navigate = useNavigate()
    const [time, setTime] = useState<string | null>(SLOT_TIMES[part])
    const [busyId, setBusyId] = useState<string | null>(null)
    const [error, setError] = useState('')

    // Back to the slot's own time each time it opens on a slot.
    const [openFor, setOpenFor] = useState<DayPart | null>(null)
    const key = open ? part : null
    if (key !== openFor) {
        setOpenFor(key)
        if (key) {
            setTime(SLOT_TIMES[key])
            setError('')
        }
    }

    async function assign(item: WalkLibraryItem) {
        if (!time) return
        setBusyId(item._id)
        setError('')
        try {
            onAssigned(await assignLibraryItem(item._id, date, time))
            onClose()
        } catch {
            setError('Couldn’t add that walk. Check your connection and try again.')
        } finally {
            setBusyId(null)
        }
    }

    const elsewhere = time ? walkPart(time) !== part : false

    return (
        <Drawer open={open} onClose={onClose} size="lg" title={`Add to ${PART_LABEL[part].toLowerCase()} · ${formatDateShort(date)}`}>
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                    <span className={FIELD_LABEL}>Time</span>
                    <TimePicker value={time} onChange={setTime} />
                    {elsewhere && time && <p className={FIELD_HINT}>That time is in the {walkPart(time)}, so it’ll show there.</p>}
                </div>

                {error && (
                    <p role="alert" className="rounded-2xl bg-red-50/70 p-4 text-sm text-neutral-800">
                        {error}
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    <span className={FIELD_LABEL}>From your library</span>
                    {items.length === 0 ? (
                        <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600">Nothing here yet. Make a walk and it’ll be kept for next time.</p>
                    ) : (
                        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                            {items.map((item) => {
                                const e = walkEstimate(item, weightKg)
                                return (
                                    <li key={item._id}>
                                        <button
                                            type="button"
                                            disabled={!time || busyId !== null}
                                            onClick={() => void assign(item)}
                                            className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-neutral-50 disabled:opacity-50"
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15px] text-neutral-900">{libraryTitle(item)}</span>
                                                <span className="nums block truncate text-[13px] text-neutral-500">
                                                    {[e ? formatWalkKm(e.distanceM) : null, formatGoal(item.goal), item.route ? null : 'No route yet'].filter(Boolean).join(' · ')}
                                                </span>
                                            </span>
                                            <i className={`fa-solid ${busyId === item._id ? 'fa-spinner fa-spin' : 'fa-plus'} shrink-0 text-xs text-neutral-400`} aria-hidden="true" />
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <Button
                    variant="secondary"
                    fullWidth
                    icon="fa-solid fa-map-location-dot"
                    onClick={() => navigate(`/walking/new?date=${date}${time ? `&time=${time}` : ''}`)}
                >
                    Create a new walk
                </Button>
            </div>
        </Drawer>
    )
}
