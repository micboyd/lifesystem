import { useEffect, useState } from 'react'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Spinner from '../components/Spinner'
import Input from '../components/Input'
import Button from '../components/Button'
import { listHabits, createHabit, updateHabit, deleteHabit } from '../services/habits'
import type { HabitDef } from '../types'

export default function Habits() {
    const [habits, setHabits] = useState<HabitDef[]>([])
    const [loading, setLoading] = useState(true)
    const [adding, setAdding] = useState(false)
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [saving, setSaving] = useState(false)
    const [editing, setEditing] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editDesc, setEditDesc] = useState('')

    useEffect(() => {
        let active = true
        listHabits()
            .then((h) => active && setHabits(h))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [])

    async function handleAdd() {
        if (!newName.trim()) return
        setSaving(true)
        try {
            const habit = await createHabit(newName.trim(), newDesc.trim() || undefined)
            setHabits((prev) => [...prev, habit])
            setNewName('')
            setNewDesc('')
            setAdding(false)
        } finally {
            setSaving(false)
        }
    }

    async function handleSaveEdit(id: string) {
        setSaving(true)
        try {
            const updated = await updateHabit(id, {
                name: editName.trim(),
                description: editDesc.trim() || undefined,
            })
            setHabits((prev) => prev.map((h) => (h._id === id ? updated : h)))
            setEditing(null)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggleActive(habit: HabitDef) {
        const updated = await updateHabit(habit._id, { active: !habit.active })
        setHabits((prev) => prev.map((h) => (h._id === habit._id ? updated : h)))
    }

    async function handleDelete(id: string) {
        await deleteHabit(id)
        setHabits((prev) => prev.filter((h) => h._id !== id))
    }

    const active = habits.filter((h) => h.active)
    const archived = habits.filter((h) => !h.active)

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Habits</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Recurring habits applied to every day.
                    </p>
                </div>
                {!adding && (
                    <Button icon="fa-solid fa-plus" onClick={() => setAdding(true)}>
                        New habit
                    </Button>
                )}
            </header>

            {/* Add form */}
            {adding && (
                <Card className="mb-6">
                    <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                        New habit
                    </h2>
                    <div className="flex flex-col gap-3">
                        <Input
                            autoFocus
                            placeholder="Name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <Input
                            placeholder="Description (optional)"
                            value={newDesc}
                            onChange={(e) => setNewDesc(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                        />
                        <div className="flex gap-2">
                            <Button onClick={handleAdd} disabled={saving || !newName.trim()}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setAdding(false)
                                    setNewName('')
                                    setNewDesc('')
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <>
                    {/* Active habits */}
                    <HabitList
                        habits={active}
                        editing={editing}
                        editName={editName}
                        editDesc={editDesc}
                        saving={saving}
                        onEdit={(h) => {
                            setEditing(h._id)
                            setEditName(h.name)
                            setEditDesc(h.description ?? '')
                        }}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={() => setEditing(null)}
                        onEditName={setEditName}
                        onEditDesc={setEditDesc}
                        onToggleActive={handleToggleActive}
                        onDelete={handleDelete}
                        emptyMessage="No active habits yet."
                    />

                    {/* Archived */}
                    {archived.length > 0 && (
                        <div className="mt-10">
                            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
                                Archived
                            </h2>
                            <HabitList
                                habits={archived}
                                editing={editing}
                                editName={editName}
                                editDesc={editDesc}
                                saving={saving}
                                onEdit={(h) => {
                                    setEditing(h._id)
                                    setEditName(h.name)
                                    setEditDesc(h.description ?? '')
                                }}
                                onSaveEdit={handleSaveEdit}
                                onCancelEdit={() => setEditing(null)}
                                onEditName={setEditName}
                                onEditDesc={setEditDesc}
                                onToggleActive={handleToggleActive}
                                onDelete={handleDelete}
                                emptyMessage=""
                            />
                        </div>
                    )}
                </>
            )}
        </Container>
    )
}

interface HabitListProps {
    habits: HabitDef[]
    editing: string | null
    editName: string
    editDesc: string
    saving: boolean
    onEdit: (h: HabitDef) => void
    onSaveEdit: (id: string) => void
    onCancelEdit: () => void
    onEditName: (v: string) => void
    onEditDesc: (v: string) => void
    onToggleActive: (h: HabitDef) => void
    onDelete: (id: string) => void
    emptyMessage: string
}

function HabitList({
    habits,
    editing,
    editName,
    editDesc,
    saving,
    onEdit,
    onSaveEdit,
    onCancelEdit,
    onEditName,
    onEditDesc,
    onToggleActive,
    onDelete,
    emptyMessage,
}: HabitListProps) {
    if (habits.length === 0 && emptyMessage) {
        return (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-8 text-center">
                <p className="text-sm text-neutral-400">{emptyMessage}</p>
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-3">
            {habits.map((habit) => (
                <Card key={habit._id}>
                    {editing === habit._id ? (
                        <div className="flex flex-col gap-3">
                            <Input
                                autoFocus
                                value={editName}
                                onChange={(e) => onEditName(e.target.value)}
                            />
                            <Input
                                placeholder="Description (optional)"
                                value={editDesc}
                                onChange={(e) => onEditDesc(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => onSaveEdit(habit._id)}
                                    disabled={saving || !editName.trim()}
                                >
                                    Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={onCancelEdit}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-neutral-900">{habit.name}</p>
                                {habit.description && (
                                    <p className="mt-0.5 text-sm text-neutral-500">
                                        {habit.description}
                                    </p>
                                )}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => onEdit(habit)}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onToggleActive(habit)}
                                    title={habit.active ? 'Archive' : 'Restore'}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <i
                                        className={`fa-solid ${habit.active ? 'fa-box-archive' : 'fa-arrow-rotate-left'} text-xs`}
                                        aria-hidden="true"
                                    />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(habit._id)}
                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                    <i
                                        className="fa-solid fa-trash-can text-xs"
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                        </div>
                    )}
                </Card>
            ))}
        </div>
    )
}
