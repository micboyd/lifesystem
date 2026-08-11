import { useEffect, useState } from 'react'
import { formatMonthRange } from '../../lib/calendar'
import { CALENDAR_COLORS, CALENDAR_COLOR_CLASSES } from '../../types'
import type { CalendarColor, MonthNote } from '../../types'
import { createMonthNote, updateMonthNote, deleteMonthNote } from '../../services/monthNotes'
import Modal from '../Modal'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'

interface Props {
    open: boolean
    /** The flag being edited, or null to create a new one. */
    note: MonthNote | null
    /** YYYY-MM a new flag starts and ends on — the month the add button was pressed from. */
    defaultMonth: string
    onClose: () => void
    onSaved: () => void
}

export default function MonthNoteEditor({ open, note, defaultMonth, onClose, onSaved }: Props) {
    const [label, setLabel] = useState('')
    const [startMonth, setStartMonth] = useState(defaultMonth)
    const [endMonth, setEndMonth] = useState(defaultMonth)
    const [color, setColor] = useState<CalendarColor>('neutral')
    const [body, setBody] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)

    // Reset the form each time the modal opens, so a previous edit never bleeds
    // into the next one.
    useEffect(() => {
        if (!open) return
        setLabel(note?.label ?? '')
        setStartMonth(note?.startMonth ?? defaultMonth)
        setEndMonth(note?.endMonth ?? defaultMonth)
        setColor(note?.color ?? 'neutral')
        setBody(note?.note ?? '')
        setError('')
        setConfirmingDelete(false)
    }, [open, note, defaultMonth])

    async function save() {
        if (!label.trim()) {
            setError('Give the flag a label.')
            return
        }
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(endMonth)) {
            setError('Both months must be set.')
            return
        }
        if (startMonth > endMonth) {
            setError('The first month cannot be after the last.')
            return
        }
        setSaving(true)
        setError('')
        const input = {
            startMonth,
            endMonth,
            label: label.trim(),
            note: body.trim() || undefined,
            color,
        }
        try {
            if (note) await updateMonthNote(note._id, input)
            else await createMonthNote(input)
            onSaved()
            onClose()
        } catch {
            setError('Could not save the flag.')
        } finally {
            setSaving(false)
        }
    }

    async function remove() {
        if (!note) return
        setSaving(true)
        try {
            await deleteMonthNote(note._id)
            onSaved()
            onClose()
        } catch {
            setError('Could not delete the flag.')
            setSaving(false)
        }
    }

    const spanValid =
        /^\d{4}-\d{2}$/.test(startMonth) && /^\d{4}-\d{2}$/.test(endMonth) && startMonth <= endMonth

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={note ? 'Edit month flag' : 'Flag months'}
            footer={
                <>
                    {note &&
                        (confirmingDelete ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={remove}
                                className="mr-auto rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                            >
                                Really delete?
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => setConfirmingDelete(true)}
                                className="mr-auto rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                                Delete
                            </button>
                        ))}
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <Input
                    label="Label"
                    value={label}
                    maxLength={60}
                    placeholder="No booze"
                    onChange={(e) => setLabel(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="From"
                        type="month"
                        value={startMonth}
                        onChange={(e) => {
                            setStartMonth(e.target.value)
                            // Dragging the start past the end carries the end with
                            // it, rather than leaving an invalid range on screen.
                            if (e.target.value > endMonth) setEndMonth(e.target.value)
                        }}
                    />
                    <Input
                        label="To"
                        type="month"
                        value={endMonth}
                        onChange={(e) => setEndMonth(e.target.value)}
                    />
                </div>

                {spanValid && (
                    <p className="-mt-2 text-xs text-neutral-500">
                        Covers {formatMonthRange(startMonth, endMonth)}.
                    </p>
                )}

                <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Colour
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {CALENDAR_COLORS.map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                aria-label={c}
                                title={c}
                                className={[
                                    'h-6 w-6 rounded-full transition-transform hover:scale-110',
                                    CALENDAR_COLOR_CLASSES[c].dot,
                                    color === c ? 'ring-2 ring-neutral-900 ring-offset-2' : '',
                                ].join(' ')}
                            />
                        ))}
                    </div>
                </div>

                <Textarea
                    label="Note"
                    rows={3}
                    value={body}
                    placeholder="Optional — why this month is flagged"
                    onChange={(e) => setBody(e.target.value)}
                />

                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        </Modal>
    )
}
