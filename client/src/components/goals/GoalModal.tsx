import { useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import DatePicker from '../DatePicker'
import { iconForHabit } from '../../lib/habitIcons'
import { ChipToggle, SectionLabel } from './ui'
import type { Goal, HabitDef } from '../../types'

export interface GoalDraft {
    title: string
    description: string
    targetDate: string
    /** Habits that build toward it. */
    habitIds: string[]
}

/** Mounted only while open, so each opening starts from fresh state. */
interface GoalModalProps {
    /** The goal being edited; null for a new one. */
    goal: Goal | null
    habits: HabitDef[]
    onClose: () => void
    onSave: (draft: GoalDraft) => Promise<void>
}

/** New and edit share one form; the habits that feed it are picked right here. */
export default function GoalModal({ goal, habits, onClose, onSave }: GoalModalProps) {
    const [draft, setDraft] = useState<GoalDraft>(() => ({
        title: goal?.title ?? '',
        description: goal?.description ?? '',
        targetDate: goal?.targetDate ?? '',
        habitIds: goal?.linkedHabits ?? [],
    }))
    const [saving, setSaving] = useState(false)
    const activeHabits = habits.filter((h) => h.active)

    async function handleSave(e?: FormEvent) {
        e?.preventDefault()
        if (!draft.title.trim()) return
        setSaving(true)
        try {
            await onSave({ ...draft, title: draft.title.trim(), description: draft.description.trim() })
        } finally {
            setSaving(false)
        }
    }

    function toggleHabit(id: string) {
        setDraft((d) => ({
            ...d,
            habitIds: d.habitIds.includes(id) ? d.habitIds.filter((h) => h !== id) : [...d.habitIds, id],
        }))
    }

    return (
        <Drawer size="lg"
            open
            onClose={onClose}
            title={goal ? 'Edit goal' : 'New goal'}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleSave()} disabled={saving || !draft.title.trim()}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <form onSubmit={handleSave} className="flex flex-col gap-5">
                <Input
                    label="Goal"
                    autoFocus
                    placeholder="e.g. Sub-45 10K"
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
                <Textarea
                    label="Why it matters (optional)"
                    rows={2}
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
                <div>
                    <SectionLabel className="mb-2">Target date (optional)</SectionLabel>
                    <DatePicker
                        mode="single"
                        value={draft.targetDate || null}
                        onChange={(v) => setDraft((d) => ({ ...d, targetDate: typeof v === 'string' ? v : '' }))}
                        placeholder="No deadline"
                    />
                </div>
                <div>
                    <SectionLabel className="mb-2">Habits that get you there</SectionLabel>
                    {activeHabits.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {activeHabits.map((h) => (
                                <ChipToggle
                                    key={h._id}
                                    on={draft.habitIds.includes(h._id)}
                                    onClick={() => toggleHabit(h._id)}
                                    icon={iconForHabit(h.name, h.icon)}
                                >
                                    {h.name}
                                </ChipToggle>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-neutral-500">No habits yet. Add them from the goal once it&apos;s saved.</p>
                    )}
                </div>
            </form>
        </Drawer>
    )
}
