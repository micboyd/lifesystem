import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { Card, CardHeader, CardTitle, CardBody } from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'
import Select from '../components/Select'
import Spinner from '../components/Spinner'
import type { Birthday } from '../types'
import {
    listBirthdays,
    createBirthday,
    updateBirthday,
    deleteBirthday,
} from '../services/birthdays'

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

function daysInMonth(month: number): number {
    // Use a leap year so Feb has 29 days
    return new Date(2000, month, 0).getDate()
}

function formatDate(mmdd: string): string {
    const [mm, dd] = mmdd.split('-').map(Number)
    return `${MONTHS[mm - 1]} ${dd}`
}

function nextOccurrence(mmdd: string): string {
    const now = new Date()
    const year = now.getFullYear()
    const [mm, dd] = mmdd.split('-').map(Number)
    const thisYear = new Date(year, mm - 1, dd)
    const target = thisYear < now ? new Date(year + 1, mm - 1, dd) : thisYear
    const diff = Math.ceil((target.getTime() - now.getTime()) / 86_400_000)
    if (diff === 0) return 'Today!'
    if (diff === 1) return 'Tomorrow'
    if (diff < 30) return `${diff} days`
    const months = Math.round(diff / 30)
    return `${months} month${months !== 1 ? 's' : ''}`
}

interface EditState {
    id: string
    name: string
    month: string
    day: string
}

export default function Birthdays() {
    const [birthdays, setBirthdays] = useState<Birthday[]>([])
    const [loading, setLoading] = useState(true)
    const [name, setName] = useState('')
    const [month, setMonth] = useState('01')
    const [day, setDay] = useState('01')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [editState, setEditState] = useState<EditState | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    useEffect(() => {
        listBirthdays()
            .then(setBirthdays)
            .finally(() => setLoading(false))
    }, [])

    const monthNum = parseInt(month, 10)
    const maxDay = daysInMonth(monthNum)

    async function handleAdd(e: FormEvent) {
        e.preventDefault()
        setError(null)
        if (!name.trim()) { setError('Name is required'); return }
        const dayNum = Math.min(parseInt(day, 10), maxDay)
        const dateStr = `${month}-${String(dayNum).padStart(2, '0')}`
        setSaving(true)
        try {
            const created = await createBirthday(name.trim(), dateStr)
            setBirthdays((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)))
            setName('')
            setMonth('01')
            setDay('01')
        } catch {
            setError('Could not add birthday.')
        } finally {
            setSaving(false)
        }
    }

    async function handleUpdate(e: FormEvent) {
        e.preventDefault()
        if (!editState) return
        setError(null)
        const monthNum2 = parseInt(editState.month, 10)
        const maxDay2 = daysInMonth(monthNum2)
        const dayNum = Math.min(parseInt(editState.day, 10), maxDay2)
        const dateStr = `${editState.month}-${String(dayNum).padStart(2, '0')}`
        setSaving(true)
        try {
            const updated = await updateBirthday(editState.id, editState.name, dateStr)
            setBirthdays((prev) =>
                prev.map((b) => (b._id === updated._id ? updated : b)).sort((a, b) =>
                    a.date.localeCompare(b.date)
                )
            )
            setEditState(null)
        } catch {
            setError('Could not update birthday.')
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        setDeletingId(id)
        try {
            await deleteBirthday(id)
            setBirthdays((prev) => prev.filter((b) => b._id !== id))
        } finally {
            setDeletingId(null)
        }
    }

    function startEdit(b: Birthday) {
        const [mm, dd] = b.date.split('-')
        setEditState({ id: b._id, name: b.name, month: mm, day: String(parseInt(dd, 10)) })
    }

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex items-center gap-3">
                <Link
                    to="/profile"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-sm" aria-hidden="true" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Birthdays</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Birthdays appear as all-day events on the calendar
                    </p>
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
                {/* Add form */}
                <Card>
                    <CardHeader>
                        <CardTitle>Add birthday</CardTitle>
                    </CardHeader>
                    <CardBody>
                        <form onSubmit={handleAdd} className="flex flex-col gap-4">
                            {error && (
                                <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {error}
                                </p>
                            )}
                            <Input
                                label="Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Mum"
                                icon="fa-solid fa-user"
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <Select
                                    label="Month"
                                    value={month}
                                    onChange={setMonth}
                                    options={MONTHS.map((m, i) => ({
                                        label: m,
                                        value: String(i + 1).padStart(2, '0'),
                                    }))}
                                />
                                <Select
                                    label="Day"
                                    value={day}
                                    onChange={setDay}
                                    options={Array.from({ length: maxDay }, (_, i) => ({
                                        label: String(i + 1),
                                        value: String(i + 1),
                                    }))}
                                />
                            </div>
                            <Button type="submit" disabled={saving || !name.trim()}>
                                {saving ? 'Adding…' : 'Add birthday'}
                            </Button>
                        </form>
                    </CardBody>
                </Card>

                {/* List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Birthdays</CardTitle>
                    </CardHeader>
                    <CardBody>
                        {loading ? (
                            <div className="grid place-items-center py-8">
                                <Spinner />
                            </div>
                        ) : birthdays.length === 0 ? (
                            <p className="py-4 text-sm text-neutral-400">
                                No birthdays added yet. Add one on the left.
                            </p>
                        ) : (
                            <ul className="divide-y divide-neutral-100">
                                {birthdays.map((b) =>
                                    editState?.id === b._id ? (
                                        <li key={b._id} className="py-3">
                                            <form onSubmit={handleUpdate} className="flex flex-col gap-3">
                                                <Input
                                                    value={editState.name}
                                                    onChange={(e) =>
                                                        setEditState((s) =>
                                                            s ? { ...s, name: e.target.value } : s
                                                        )
                                                    }
                                                    icon="fa-solid fa-user"
                                                />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Select
                                                        value={editState.month}
                                                        onChange={(v) =>
                                                            setEditState((s) => s ? { ...s, month: v } : s)
                                                        }
                                                        options={MONTHS.map((m, i) => ({
                                                            label: m,
                                                            value: String(i + 1).padStart(2, '0'),
                                                        }))}
                                                    />
                                                    <Select
                                                        value={editState.day}
                                                        onChange={(v) =>
                                                            setEditState((s) => s ? { ...s, day: v } : s)
                                                        }
                                                        options={Array.from(
                                                            { length: daysInMonth(parseInt(editState.month, 10)) },
                                                            (_, i) => ({
                                                                label: String(i + 1),
                                                                value: String(i + 1),
                                                            })
                                                        )}
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button type="submit" disabled={saving}>
                                                        Save
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        onClick={() => setEditState(null)}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </form>
                                        </li>
                                    ) : (
                                        <li
                                            key={b._id}
                                            className="flex items-center gap-3 py-3"
                                        >
                                            <i className="fa-solid fa-cake-candles text-neutral-400" aria-hidden="true" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-neutral-900">
                                                    {b.name}
                                                </p>
                                                <p className="text-xs text-neutral-400">
                                                    {formatDate(b.date)}
                                                    <span className="mx-1.5 text-neutral-200">·</span>
                                                    <span className="text-neutral-500">
                                                        {nextOccurrence(b.date)}
                                                    </span>
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => startEdit(b)}
                                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                            >
                                                <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(b._id)}
                                                disabled={deletingId === b._id}
                                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                            >
                                                <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                            </button>
                                        </li>
                                    )
                                )}
                            </ul>
                        )}
                    </CardBody>
                </Card>
            </div>
        </Container>
    )
}
