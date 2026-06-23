import { useEffect, useState, type FormEvent } from 'react'
import Container from '../components/Container'
import { Card, CardBody } from '../components/Card'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import DatePicker from '../components/DatePicker'
import Tabs from '../components/Tabs'
import EmptyState from '../components/EmptyState'
import type { Goal, Milestone } from '../types'
import {
    listGoals, createGoal, updateGoal, deleteGoal,
    addMilestone, updateMilestone, deleteMilestone,
} from '../services/goals'

const STATUS_LABELS: Record<Goal['status'], string> = {
    active: 'Active',
    completed: 'Completed',
    abandoned: 'Abandoned',
}

const STATUS_COLORS: Record<Goal['status'], string> = {
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-blue-100 text-blue-700',
    abandoned: 'bg-neutral-100 text-neutral-500',
}

function daysUntil(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
}

function fmt(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ProgressBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    return (
        <div className="flex items-center gap-3">
            <div className="relative flex-1 h-2 rounded-full bg-neutral-100">
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-neutral-900 transition-all"
                    style={{ width: `${value}%` }}
                />
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
            </div>
            <span className="w-10 text-right text-sm font-bold tabular-nums text-neutral-700">
                {value}%
            </span>
        </div>
    )
}

function GoalCard({ goal, onUpdate }: { goal: Goal; onUpdate: (g: Goal) => void }) {
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [title, setTitle] = useState(goal.title)
    const [description, setDescription] = useState(goal.description ?? '')
    const [targetDate, setTargetDate] = useState(goal.targetDate ?? '')
    const [saving, setSaving] = useState(false)
    const [milestoneInput, setMilestoneInput] = useState('')
    const [addingMs, setAddingMs] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const milestonesDone = goal.milestones.filter((m) => m.completed).length
    const milestonesTotal = goal.milestones.length

    async function handleSave(e: FormEvent) {
        e.preventDefault()
        setSaving(true)
        try {
            const updated = await updateGoal(goal._id, {
                title: title.trim(),
                description: description.trim() || undefined,
                targetDate: targetDate || undefined,
            })
            onUpdate(updated)
            setEditing(false)
        } finally {
            setSaving(false)
        }
    }

    async function handleProgress(v: number) {
        const updated = await updateGoal(goal._id, { progress: v })
        onUpdate(updated)
    }

    async function handleStatus(status: Goal['status']) {
        const updated = await updateGoal(goal._id, { status })
        onUpdate(updated)
    }

    async function handleToggleMilestone(ms: Milestone) {
        const updated = await updateMilestone(goal._id, ms._id, { completed: !ms.completed })
        onUpdate(updated)
    }

    async function handleAddMilestone(e: FormEvent) {
        e.preventDefault()
        if (!milestoneInput.trim()) return
        setAddingMs(true)
        try {
            const updated = await addMilestone(goal._id, milestoneInput.trim())
            onUpdate(updated)
            setMilestoneInput('')
        } finally {
            setAddingMs(false)
        }
    }

    async function handleDeleteMilestone(msId: string) {
        const updated = await deleteMilestone(goal._id, msId)
        onUpdate(updated)
    }

    async function handleDelete() {
        if (!confirm('Delete this goal?')) return
        setDeleting(true)
        try {
            await deleteGoal(goal._id)
            onUpdate({ ...goal, status: 'abandoned', _id: '' })
        } finally {
            setDeleting(false)
        }
    }

    const days = goal.targetDate ? daysUntil(goal.targetDate) : null

    return (
        <Card className={goal.status !== 'active' ? 'opacity-60' : ''}>
            <CardBody>
                {editing ? (
                    <form onSubmit={handleSave} className="flex flex-col gap-4">
                        <Input
                            label="Goal"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="What do you want to achieve?"
                        />
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Description (optional)
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="More detail…"
                                className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-400 focus:outline-none resize-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Target date (optional)
                            </label>
                            <DatePicker
                                mode="single"
                                value={targetDate || null}
                                onChange={(v) => setTargetDate(typeof v === 'string' ? v : '')}
                                placeholder="No deadline"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button type="submit" disabled={saving || !title.trim()}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                                Cancel
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-base font-bold text-neutral-900">{goal.title}</h3>
                                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[goal.status]}`}>
                                        {STATUS_LABELS[goal.status]}
                                    </span>
                                </div>
                                {goal.description && (
                                    <p className="mt-1 text-sm text-neutral-500">{goal.description}</p>
                                )}
                                {goal.targetDate && (
                                    <p className={`mt-1 text-xs font-semibold ${days !== null && days < 0 ? 'text-red-500' : days !== null && days <= 7 ? 'text-amber-600' : 'text-neutral-400'}`}>
                                        <i className="fa-regular fa-calendar mr-1" aria-hidden="true" />
                                        {fmt(goal.targetDate)}
                                        {days !== null && (
                                            <span className="ml-1.5">
                                                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? '— today!' : `— ${days}d to go`}
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    onClick={() => setEditing(true)}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                    <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        {/* Progress */}
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Progress</span>
                                {milestonesTotal > 0 && (
                                    <span className="text-xs text-neutral-400">
                                        {milestonesDone}/{milestonesTotal} milestones
                                    </span>
                                )}
                            </div>
                            <ProgressBar value={goal.progress} onChange={handleProgress} />
                        </div>

                        {/* Status actions */}
                        {goal.status === 'active' && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleStatus('completed')}
                                    className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700"
                                >
                                    <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
                                    Mark complete
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleStatus('abandoned')}
                                    className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
                                >
                                    Abandon
                                </button>
                            </div>
                        )}
                        {goal.status !== 'active' && (
                            <button
                                type="button"
                                onClick={() => handleStatus('active')}
                                className="self-start rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
                            >
                                Reactivate
                            </button>
                        )}

                        {/* Milestones */}
                        <div>
                            <button
                                type="button"
                                onClick={() => setExpanded((v) => !v)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
                            >
                                <i className={`fa-solid fa-chevron-${expanded ? 'down' : 'right'} text-[10px]`} aria-hidden="true" />
                                Milestones {milestonesTotal > 0 && `(${milestonesDone}/${milestonesTotal})`}
                            </button>

                            {expanded && (
                                <div className="mt-3 flex flex-col gap-2">
                                    {goal.milestones.map((ms) => (
                                        <div key={ms._id} className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleMilestone(ms)}
                                                className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors ${ms.completed ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-500'}`}
                                            >
                                                {ms.completed && <i className="fa-solid fa-check text-[9px]" aria-hidden="true" />}
                                            </button>
                                            <span className={`flex-1 text-sm ${ms.completed ? 'line-through text-neutral-400' : 'text-neutral-700'}`}>
                                                {ms.title}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMilestone(ms._id)}
                                                className="grid h-6 w-6 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-400"
                                            >
                                                <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
                                            </button>
                                        </div>
                                    ))}

                                    <form onSubmit={handleAddMilestone} className="mt-1 flex gap-2">
                                        <Input
                                            value={milestoneInput}
                                            onChange={(e) => setMilestoneInput(e.target.value)}
                                            placeholder="Add a milestone…"
                                            className="flex-1"
                                        />
                                        <Button type="submit" variant="secondary" disabled={addingMs || !milestoneInput.trim()}>
                                            Add
                                        </Button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardBody>
        </Card>
    )
}

export default function Goals() {
    const [goals, setGoals] = useState<Goal[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newDescription, setNewDescription] = useState('')
    const [newTargetDate, setNewTargetDate] = useState('')
    const [saving, setSaving] = useState(false)
    const [filter, setFilter] = useState<Goal['status'] | 'all'>('active')

    useEffect(() => {
        listGoals().then(setGoals).finally(() => setLoading(false))
    }, [])

    function handleUpdate(updated: Goal) {
        if (!updated._id) {
            // Deleted
            setGoals((prev) => prev.filter((g) => g._id !== updated._id))
            return
        }
        setGoals((prev) => prev.map((g) => (g._id === updated._id ? updated : g)))
    }

    async function handleAdd(e: FormEvent) {
        e.preventDefault()
        if (!newTitle.trim()) return
        setSaving(true)
        try {
            const created = await createGoal({
                title: newTitle.trim(),
                description: newDescription.trim() || undefined,
                targetDate: newTargetDate || undefined,
            })
            setGoals((prev) => [created, ...prev])
            setNewTitle('')
            setNewDescription('')
            setNewTargetDate('')
            setAdding(false)
        } finally {
            setSaving(false)
        }
    }

    const filtered = goals.filter((g) => filter === 'all' || g.status === filter)
    const activeCount = goals.filter((g) => g.status === 'active').length

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Goals</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {activeCount} active goal{activeCount !== 1 ? 's' : ''}
                    </p>
                </div>
                <Button icon="fa-solid fa-plus" onClick={() => setAdding(true)}>
                    Add goal
                </Button>
            </header>

            {/* Add form */}
            {adding && (
                <Card className="mb-6">
                    <CardBody>
                        <form onSubmit={handleAdd} className="flex flex-col gap-4">
                            <Input
                                label="Goal"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="What do you want to achieve?"
                                autoFocus
                            />
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Description (optional)
                                </label>
                                <textarea
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    rows={2}
                                    placeholder="More detail…"
                                    className="rounded-xl border border-neutral-200 px-4 py-3 text-sm text-neutral-900 placeholder-neutral-300 focus:border-neutral-400 focus:outline-none resize-none"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Target date (optional)
                                </label>
                                <DatePicker
                                    mode="single"
                                    value={newTargetDate || null}
                                    onChange={(v) => setNewTargetDate(typeof v === 'string' ? v : '')}
                                    placeholder="No deadline"
                                />
                            </div>
                            <div className="flex gap-2">
                                <Button type="submit" disabled={saving || !newTitle.trim()}>
                                    {saving ? 'Saving…' : 'Create goal'}
                                </Button>
                                <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </CardBody>
                </Card>
            )}

            {/* Filter tabs */}
            <Tabs
                tabs={['active', 'completed', 'abandoned', 'all']}
                value={filter}
                onChange={(f) => setFilter(f as Goal['status'] | 'all')}
                className="mb-6"
            />

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-bullseye"
                    title={filter === 'active' ? 'No active goals' : `No ${filter} goals`}
                    description={filter === 'active' ? 'Hit "Add goal" to get started.' : undefined}
                />
            ) : (
                <div className="flex flex-col gap-4">
                    {filtered.map((g) => (
                        <GoalCard key={g._id} goal={g} onUpdate={handleUpdate} />
                    ))}
                </div>
            )}
        </Container>
    )
}
