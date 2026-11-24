import { useState } from 'react'
import Drawer from './Drawer'
import Button from './Button'
import Input from './Input'
import {
    GROUP_TONE,
    addGroup,
    removeGroup,
    saveGroup,
    useConditioningGroups,
} from '../lib/conditioningGroups'
import {
    CONDITIONING_GROUP_COLORS,
    MAX_CONDITIONING_GROUPS,
    type ConditioningGroup,
    type ConditioningGroupColor,
} from '../types'

/** A small coloured chip naming a session's category. */
export function GroupChip({ group }: { group: ConditioningGroup }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${GROUP_TONE[group.color].chip}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${GROUP_TONE[group.color].dot}`} aria-hidden="true" />
            {group.name}
        </span>
    )
}

function Swatches({
    value,
    onChange,
}: {
    value: ConditioningGroupColor
    onChange: (c: ConditioningGroupColor) => void
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {CONDITIONING_GROUP_COLORS.map((c) => {
                const active = c === value
                return (
                    <button
                        key={c}
                        type="button"
                        aria-label={GROUP_TONE[c].name}
                        aria-pressed={active}
                        title={GROUP_TONE[c].name}
                        onClick={() => onChange(c)}
                        className={`grid h-7 w-7 place-items-center rounded-full ${GROUP_TONE[c].dot} transition-transform hover:scale-105 ${
                            active ? 'ring-2 ring-neutral-900 ring-offset-2' : 'ring-1 ring-inset ring-neutral-900/10'
                        }`}
                    >
                        {active && <i className="fa-solid fa-check text-[10px] text-white" aria-hidden="true" />}
                    </button>
                )
            })}
        </div>
    )
}

/** One saved category: rename on blur, recolour on tap, remove. */
function GroupRow({ group }: { group: ConditioningGroup }) {
    const [name, setName] = useState(group.name)
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center gap-2">
                <span className={`h-3 w-3 shrink-0 rounded-full ${GROUP_TONE[group.color].dot}`} aria-hidden="true" />
                <Input
                    wrapperClassName="min-w-0 flex-1"
                    aria-label="Category name"
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                        const next = name.trim()
                        if (!next) setName(group.name)
                        else if (next !== group.name) void saveGroup(group._id, { name: next })
                    }}
                />
                <button
                    type="button"
                    aria-label={`Delete ${group.name}`}
                    onClick={() => void removeGroup(group._id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-red-600"
                >
                    <i className="fa-solid fa-trash-can text-xs" />
                </button>
            </div>
            <Swatches value={group.color} onChange={(c) => void saveGroup(group._id, { color: c })} />
        </div>
    )
}

/**
 * Make up to five of your own conditioning categories — Running, Rugby… — each
 * with a colour. Sessions pick one, and the planner tints them by it.
 */
export default function ConditioningGroupsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const groups = useConditioningGroups()
    const unused = CONDITIONING_GROUP_COLORS.find((c) => !groups.some((g) => g.color === c)) ?? 'sky'
    const [name, setName] = useState('')
    // Null until picked: a new category takes the first colour not yet in use.
    const [picked, setPicked] = useState<ConditioningGroupColor | null>(null)
    const color = picked ?? unused
    const [saving, setSaving] = useState(false)
    const full = groups.length >= MAX_CONDITIONING_GROUPS

    async function add() {
        const n = name.trim()
        if (!n || full) return
        setSaving(true)
        try {
            await addGroup(n, color)
            setName('')
            setPicked(null)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer open={open} onClose={onClose} size="md" title="Categories">
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    Your own labels for sessions, e.g. Running or Rugby. Up to {MAX_CONDITIONING_GROUPS}, each with a
                    colour that shows on the planner.
                </p>

                {groups.length > 0 && (
                    <div className="flex flex-col gap-2">
                        {groups.map((g) => (
                            // Keyed by name too, so a saved rename resets the field.
                            <GroupRow key={`${g._id}:${g.name}`} group={g} />
                        ))}
                    </div>
                )}

                {full ? (
                    <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-500">
                        That&apos;s all {MAX_CONDITIONING_GROUPS} — delete one to add another.
                    </p>
                ) : (
                    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-300 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                            New category
                        </p>
                        <div className="flex items-center gap-2">
                            <Input
                                wrapperClassName="min-w-0 flex-1"
                                placeholder="e.g. Rugby"
                                value={name}
                                maxLength={40}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void add()
                                }}
                            />
                            <Button icon="fa-solid fa-plus" onClick={add} disabled={saving || !name.trim()}>
                                Add
                            </Button>
                        </div>
                        <Swatches value={color} onChange={setPicked} />
                    </div>
                )}
            </div>
        </Drawer>
    )
}
