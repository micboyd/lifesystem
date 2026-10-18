import { useEffect, useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Slider from '../Slider'
import PillToggle from '../PillToggle'
import { updateGoal, addMilestone, updateMilestone, deleteMilestone } from '../../services/goals'
import { SectionLabel } from './ui'
import type { Goal, HabitDef } from '../../types'

interface GoalDrawerProps {
    goal: Goal | null
    habits: HabitDef[]
    onClose: () => void
    onChange: (goal: Goal) => void
    onEdit: () => void
}

/**
 * How a goal is going: what its progress is read from, the per-habit
 * consistency behind it, and the milestones on the way.
 */
export default function GoalDrawer({ goal, habits, onClose, onChange, onEdit }: GoalDrawerProps) {
    const [milestone, setMilestone] = useState('')
    const [adding, setAdding] = useState(false)
    // The slider fires on every step of a drag; save once it settles.
    const [pendingProgress, setPendingProgress] = useState<number | null>(null)
    const goalId = goal?._id

    useEffect(() => {
        if (pendingProgress === null || !goalId) return
        const t = setTimeout(() => {
            updateGoal(goalId, { progress: pendingProgress }).then((g) => {
                onChange(g)
                setPendingProgress(null)
            })
        }, 400)
        return () => clearTimeout(t)
    }, [pendingProgress, goalId, onChange])

    if (!goal) return <Drawer open={false} onClose={onClose}>{null}</Drawer>

    const canFollowHabits = goal.linkedHabits.length > 0
    const nameOf = (id: string) => habits.find((h) => h._id === id)?.name

    async function setMode(mode: Goal['progressMode']) {
        onChange(await updateGoal(goal!._id, { progressMode: mode }))
    }

    async function handleAddMilestone(e: FormEvent) {
        e.preventDefault()
        if (!milestone.trim()) return
        setAdding(true)
        try {
            onChange(await addMilestone(goal!._id, milestone.trim()))
            setMilestone('')
        } finally {
            setAdding(false)
        }
    }

    return (
        <Drawer
            open
            onClose={onClose}
            title={goal.title}
            size="lg"
            footer={
                <Button variant="secondary" icon="fa-solid fa-pen" onClick={onEdit} fullWidth>
                    Edit goal
                </Button>
            }
        >
            <div className="flex flex-col gap-8">
                {goal.description && <p className="text-sm text-neutral-600">{goal.description}</p>}

                {/* Progress */}
                <section>
                    <SectionLabel className="mb-3">Progress</SectionLabel>
                    {canFollowHabits && (
                        <PillToggle
                            label="Progress source"
                            value={goal.progressMode}
                            onChange={setMode}
                            options={[
                                { value: 'auto', label: 'From habits' },
                                { value: 'manual', label: 'Set by hand' },
                            ]}
                            className="mb-4"
                        />
                    )}

                    {goal.progressMode === 'auto' && goal.derived ? (
                        <div className="flex flex-col gap-2">
                            {goal.derived.habits.map((d) => (
                                <div key={d.habit} className="flex items-center gap-3 text-sm">
                                    <span className="min-w-0 flex-1 truncate text-neutral-700">
                                        {nameOf(d.habit) ?? 'Removed habit'}
                                    </span>
                                    <span className="tabular-nums text-neutral-500">
                                        {d.completedDays}/{goal.derived!.elapsedDays}d
                                    </span>
                                    <span className="w-10 text-right font-bold tabular-nums text-neutral-900">
                                        {Math.round(d.rate * 100)}%
                                    </span>
                                </div>
                            ))}
                            <p className="mt-1 text-xs text-neutral-500">
                                How consistently the habits have been done, not whether the goal is met. Use milestones
                                for that.
                            </p>
                        </div>
                    ) : (
                        <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={pendingProgress ?? goal.progress}
                            onChange={setPendingProgress}
                            showValue
                        />
                    )}
                </section>

                {/* Milestones */}
                <section>
                    <SectionLabel className="mb-3">Milestones</SectionLabel>
                    <div className="flex flex-col gap-1">
                        {goal.milestones.map((ms) => (
                            <div key={ms._id} className="group flex items-center gap-3 py-1.5">
                                <button
                                    type="button"
                                    aria-pressed={ms.completed}
                                    onClick={async () =>
                                        onChange(await updateMilestone(goal._id, ms._id, { completed: !ms.completed }))
                                    }
                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                                        ms.completed
                                            ? 'border-neutral-900 bg-neutral-900 text-white'
                                            : 'border-neutral-300 hover:border-neutral-500'
                                    }`}
                                >
                                    {ms.completed && <i className="fa-solid fa-check text-[9px]" aria-hidden="true" />}
                                </button>
                                <span
                                    className={`flex-1 text-sm ${ms.completed ? 'text-neutral-500 line-through' : 'text-neutral-800'}`}
                                >
                                    {ms.title}
                                </span>
                                <button
                                    type="button"
                                    aria-label={`Remove ${ms.title}`}
                                    onClick={async () => onChange(await deleteMilestone(goal._id, ms._id))}
                                    className="grid h-7 w-7 place-items-center rounded-[10px] text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                                >
                                    <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleAddMilestone} className="mt-2 flex gap-2">
                        <Input
                            value={milestone}
                            onChange={(e) => setMilestone(e.target.value)}
                            placeholder="Add a milestone"
                            className="flex-1"
                        />
                        <Button type="submit" variant="secondary" disabled={adding || !milestone.trim()}>
                            Add
                        </Button>
                    </form>
                </section>
            </div>
        </Drawer>
    )
}
