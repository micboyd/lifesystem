import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import RoomJobsEditor from './RoomJobsEditor'
import type { CleaningRoom } from '../../types'
import { CUSTOM_ICON, ROOM_PRESETS, newKey, roomFromPreset } from '../../lib/cleaning'

/** Edit one room's jobs — or, with no room, add a new one starting from a type. */
export default function RoomDrawer({
    open,
    room,
    takenNames,
    onClose,
    onSave,
    onDelete,
}: {
    open: boolean
    room: CleaningRoom | null
    /** Other rooms' names, to number a new one ("Bedroom 2"). */
    takenNames: string[]
    onClose: () => void
    onSave: (room: CleaningRoom) => void
    onDelete: (key: string) => void
}) {
    const [draft, setDraft] = useState<CleaningRoom | null>(room)
    // Start from the room each time it opens (during render, not in an effect).
    const [shownOpen, setShownOpen] = useState(false)
    if (open !== shownOpen) {
        setShownOpen(open)
        if (open) setDraft(room)
    }

    const isNew = !room
    const pickKind = (kind: string) => {
        const preset = ROOM_PRESETS.find((p) => p.kind === kind)
        const label = preset?.label ?? 'Room'
        const taken = new Set(takenNames.map((n) => n.toLowerCase()))
        let name = label
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${label} ${n}`
        setDraft(preset ? roomFromPreset(preset, name) : { key: newKey('r'), name: '', kind: 'custom', tasks: [] })
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="xl"
            title={isNew ? 'Add a room' : draft?.name || 'Room'}
            footer={
                <>
                    {!isNew && room && (
                        <Button variant="danger" className="mr-auto" onClick={() => onDelete(room.key)}>
                            Remove room
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => draft && draft.name.trim() && onSave(draft)} disabled={!draft || !draft.name.trim()}>
                        {isNew ? 'Add room' : 'Save'}
                    </Button>
                </>
            }
        >
            {isNew && (
                <div className="mb-6 flex flex-wrap gap-2">
                    {[...ROOM_PRESETS.map((p) => ({ kind: p.kind, label: p.label, icon: p.icon })), { kind: 'custom', label: 'Other', icon: CUSTOM_ICON }].map(
                        (p) => (
                            <button
                                key={p.kind}
                                type="button"
                                onClick={() => pickKind(p.kind)}
                                className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-[13px] transition-colors ${
                                    draft?.kind === p.kind
                                        ? 'bg-neutral-900 text-white'
                                        : 'border border-hairline bg-white text-neutral-700 hover:border-neutral-300'
                                }`}
                            >
                                <i className={`fa-solid ${p.icon} text-[11px]`} aria-hidden="true" />
                                {p.label}
                            </button>
                        )
                    )}
                </div>
            )}
            {draft ? (
                <RoomJobsEditor room={draft} onChange={setDraft} />
            ) : (
                <p className="text-[13px] text-neutral-500">Pick what kind of room it is to start with its usual jobs.</p>
            )}
        </Drawer>
    )
}
