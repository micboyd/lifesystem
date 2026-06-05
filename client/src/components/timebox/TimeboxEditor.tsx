import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import TimePicker from '../TimePicker'
import { formatDuration, timeToMinutes } from '../../lib/time'
import type { Timebox } from '../../types'
import type { TimeboxInput } from '../../services/timeboxes'

interface Props {
    open: boolean
    item: Timebox | null
    /** Pre-filled times when adding (e.g. from clicking a slot). */
    defaults: { startTime: string; endTime: string }
    /** Bounds from the user's wake/bed settings. */
    minTime: string
    maxTime: string
    saving: boolean
    /** True when the last save was rejected for overlapping another block. */
    conflict?: boolean
    onClose: () => void
    onSave: (input: TimeboxInput) => void
    onDelete: () => void
}

export default function TimeboxEditor({ open, item, defaults, minTime, maxTime, saving, conflict = false, onClose, onSave, onDelete }: Props) {
    const [title, setTitle] = useState('')
    const [startTime, setStartTime] = useState<string | null>(null)
    const [endTime, setEndTime] = useState<string | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!open) return
        setTitle(item?.title ?? '')
        setStartTime(item?.startTime ?? defaults.startTime)
        setEndTime(item?.endTime ?? defaults.endTime)
        setError('')
    }, [open, item, defaults])

    const duration =
        startTime && endTime && timeToMinutes(endTime) > timeToMinutes(startTime)
            ? formatDuration(timeToMinutes(endTime) - timeToMinutes(startTime))
            : null

    function handleSave() {
        if (!title.trim()) { setError('Give the block a title.'); return }
        if (!startTime || !endTime) { setError('Set a start and end time.'); return }
        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) { setError('End time must be after start.'); return }
        onSave({ title: title.trim(), startTime, endTime })
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            side="right"
            size="lg"
            title={item ? 'Edit block' : 'New block'}
            footer={
                <>
                    {item && (
                        <Button variant="ghost" size="sm" icon="fa-solid fa-trash-can" onClick={onDelete} disabled={saving}
                            className="mr-auto text-red-500 hover:bg-red-50 hover:text-red-600">
                            Remove
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button size="sm" icon="fa-solid fa-check" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Input
                    label="Title"
                    placeholder="What are you doing?"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setError('') }}
                    error={error}
                    autoFocus
                />
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Start</span>
                        <TimePicker value={startTime} onChange={setStartTime} minuteStep={5} minTime={minTime} maxTime={maxTime} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">End</span>
                        <TimePicker value={endTime} onChange={setEndTime} minuteStep={5} minTime={startTime ?? minTime} maxTime={maxTime} />
                    </div>
                </div>
                {duration && (
                    <p className="text-sm font-medium text-neutral-500">
                        <i className="fa-regular fa-clock mr-1.5 text-neutral-400" aria-hidden="true" />
                        Duration: <span className="font-semibold text-neutral-700">{duration}</span>
                    </p>
                )}
                {conflict && (
                    <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        That time overlaps another block — pick a free slot.
                    </p>
                )}
            </div>
        </Drawer>
    )
}
