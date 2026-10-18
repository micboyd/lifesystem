import { useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import HabitIconPicker from '../habits/HabitIconPicker'
import { ChipToggle, SectionLabel } from './ui'
import type { Goal, HabitDef } from '../../types'

export interface HabitDraft {
    name: string
    description: string
    icon: string | undefined
    /** Active goals this habit builds toward. */
    goalIds: string[]
}

/** Mounted only while open, so each opening starts from fresh state. */
interface HabitModalProps {
    /** The habit being edited; null for a new one. */
    habit: HabitDef | null
    /** Goals to preselect for a new habit — set when it's added from a goal's card. */
    presetGoalIds?: string[]
    goals: Goal[]
    onClose: () => void
    onSave: (draft: HabitDraft) => Promise<void>
}

/** New and edit share one form, so a habit always looks the same to make or change. */
export default function HabitModal({ habit, presetGoalIds = [], goals, onClose, onSave }: HabitModalProps) {
    const activeGoals = goals.filter((g) => g.status === 'active')
    const [draft, setDraft] = useState<HabitDraft>(() => ({
        name: habit?.name ?? '',
        description: habit?.description ?? '',
        icon: habit?.icon,
        goalIds: habit
            ? activeGoals.filter((g) => g.linkedHabits.includes(habit._id)).map((g) => g._id)
            : presetGoalIds,
    }))
    const [saving, setSaving] = useState(false)

    async function handleSave(e?: FormEvent) {
        e?.preventDefault()
        if (!draft.name.trim()) return
        setSaving(true)
        try {
            await onSave({ ...draft, name: draft.name.trim(), description: draft.description.trim() })
        } finally {
            setSaving(false)
        }
    }

    function toggleGoal(id: string) {
        setDraft((d) => ({
            ...d,
            goalIds: d.goalIds.includes(id) ? d.goalIds.filter((g) => g !== id) : [...d.goalIds, id],
        }))
    }

    return (
        <Drawer size="lg"
            open
            onClose={onClose}
            title={habit ? 'Edit habit' : 'New habit'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleSave()} disabled={saving || !draft.name.trim()}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSave} className="flex flex-col gap-5">
                <Input
                    label="Habit"
                    autoFocus
                    placeholder="e.g. Run 20 minutes"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                <Input
                    label="Note (optional)"
                    placeholder="When, where, how much"
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
                <div>
                    <SectionLabel className="mb-2">Icon</SectionLabel>
                    <HabitIconPicker
                        value={draft.icon}
                        onChange={(icon) => setDraft((d) => ({ ...d, icon }))}
                        name={draft.name}
                    />
                </div>
                <div>
                    <SectionLabel className="mb-2">Builds toward</SectionLabel>
                    {activeGoals.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {activeGoals.map((g) => (
                                <ChipToggle
                                    key={g._id}
                                    on={draft.goalIds.includes(g._id)}
                                    onClick={() => toggleGoal(g._id)}
                                    icon="fa-solid fa-bullseye"
                                >
                                    {g.title}
                                </ChipToggle>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-neutral-500">No active goals. It&apos;ll stand on its own.</p>
                    )}
                    {activeGoals.length > 0 && draft.goalIds.length === 0 && (
                        <p className="mt-2 text-xs text-neutral-500">None picked: it&apos;ll stand on its own.</p>
                    )}
                </div>
            </form>
        </Drawer>
    )
}
