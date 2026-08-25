import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Container from '../../components/Container'
import Avatar from '../../components/Avatar'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Select from '../../components/Select'
import Spinner from '../../components/Spinner'
import EmptyState from '../../components/EmptyState'
import ConfirmModal from '../../components/ConfirmModal'
import DropdownMenu, { type MenuEntry } from '../../components/DropdownMenu'
import { useToast } from '../../context/ToastContext'
import { todayKey } from '../../lib/calendar'
import { waitingDays, waitTone } from '../../lib/work'
import {
    createPerson,
    deletePerson as deletePersonRequest,
    listPeople,
    updatePerson,
    type PersonInput,
} from '../../services/people'
import { listTasks } from '../../services/workTasks'
import { RELATIONSHIPS, type Person, type Relationship, type WorkTask } from '../../types'

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
    manager: 'Manager',
    report: 'Report',
    peer: 'Peer',
    stakeholder: 'Stakeholder',
    external: 'External',
}

/** Section order — the people you deal with most, first. */
const SECTION_ORDER: Relationship[] = ['manager', 'report', 'peer', 'stakeholder', 'external']

const SECTION_TITLES: Record<Relationship, string> = {
    manager: 'Managers',
    report: 'Reports',
    peer: 'Peers',
    stakeholder: 'Stakeholders',
    external: 'External',
}

/** The message an API error carried, if it bothered to explain itself. */
function apiMessage(error: unknown, fallback: string): string {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data
        ?.message
    return message ?? fallback
}

/**
 * The people behind the work.
 *
 * Deliberately thin: this exists because "waiting on" needs something real to
 * point at, and a name you can't correct or retire is worse than no name. The
 * richer half — what they care about, the threads still open — belongs with
 * 1:1s and meeting notes, which aren't built yet.
 */
export default function People() {
    const toast = useToast()
    const today = todayKey()

    const [people, setPeople] = useState<Person[]>([])
    const [tasks, setTasks] = useState<WorkTask[]>([])
    const [loading, setLoading] = useState(true)
    const [showArchived, setShowArchived] = useState(false)

    const [formOpen, setFormOpen] = useState(false)
    const [editing, setEditing] = useState<Person | null>(null)
    const [name, setName] = useState('')
    const [role, setRole] = useState('')
    const [team, setTeam] = useState('')
    const [relationship, setRelationship] = useState<Relationship>('peer')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    const [pendingDelete, setPendingDelete] = useState<Person | null>(null)

    useEffect(() => {
        Promise.all([listPeople(true), listTasks('open')])
            .then(([p, t]) => {
                setPeople(p)
                setTasks(t)
            })
            .catch(() => toast.error('Could not load your people'))
            .finally(() => setLoading(false))
    }, [toast])

    /** Open items blocked on each person — the one live number this page has. */
    const waitingByPerson = useMemo(() => {
        const map = new Map<string, WorkTask[]>()
        for (const task of tasks) {
            if (task.status !== 'waiting' || !task.waitingOn) continue
            const list = map.get(task.waitingOn)
            if (list) list.push(task)
            else map.set(task.waitingOn, [task])
        }
        return map
    }, [tasks])

    const visible = useMemo(
        () => people.filter((p) => (showArchived ? p.archived : !p.archived)),
        [people, showArchived]
    )

    const sections = useMemo(
        () =>
            SECTION_ORDER.map((key) => ({
                key,
                title: SECTION_TITLES[key],
                people: visible
                    .filter((p) => p.relationship === key)
                    .sort((a, b) => a.name.localeCompare(b.name)),
            })).filter((section) => section.people.length > 0),
        [visible]
    )

    function openForm(person: Person | null) {
        setEditing(person)
        setName(person?.name ?? '')
        setRole(person?.role ?? '')
        setTeam(person?.team ?? '')
        setRelationship(person?.relationship ?? 'peer')
        setNotes(person?.notes ?? '')
        setFormOpen(true)
    }

    function upsert(person: Person) {
        setPeople((prev) =>
            prev.some((p) => p._id === person._id)
                ? prev.map((p) => (p._id === person._id ? person : p))
                : [...prev, person]
        )
    }

    async function submitForm(e: FormEvent) {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || saving) return

        const input: PersonInput = {
            name: trimmed,
            role: role.trim(),
            team: team.trim(),
            relationship,
            notes: notes.trim(),
        }

        setSaving(true)
        try {
            upsert(editing ? await updatePerson(editing._id, input) : await createPerson(input))
            setFormOpen(false)
            setEditing(null)
        } catch {
            toast.error('Could not save that person')
        } finally {
            setSaving(false)
        }
    }

    async function setArchived(person: Person, archived: boolean) {
        const previous = person
        upsert({ ...person, archived })
        try {
            upsert(await updatePerson(person._id, { archived }))
        } catch {
            upsert(previous)
            toast.error('That change did not save')
        }
    }

    async function confirmDelete() {
        const person = pendingDelete
        if (!person) return
        setPendingDelete(null)
        try {
            await deletePersonRequest(person._id)
            setPeople((prev) => prev.filter((p) => p._id !== person._id))
        } catch (error) {
            // The server refuses while things are still blocked on them, and
            // says how many — pass that straight through rather than a generic
            // failure the person can't act on.
            toast.show(apiMessage(error, 'Could not remove that person'), 'warning')
        }
    }

    const activeCount = people.filter((p) => !p.archived).length
    const archivedCount = people.length - activeCount

    return (
        <Container as="main" className="py-10">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                        People
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {activeCount} {activeCount === 1 ? 'person' : 'people'} you work with
                    </p>
                </div>
                <Button variant="brand" icon="fa-solid fa-plus" onClick={() => openForm(null)}>
                    Add person
                </Button>
            </header>

            {formOpen && (
                <form
                    onSubmit={submitForm}
                    className="mb-6 flex flex-col gap-4 rounded-3xl bg-white p-4 ring-1 ring-black/[0.06] sm:p-6"
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                            label="Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Who are they?"
                            autoFocus
                        />
                        <Select
                            label="Relationship"
                            options={RELATIONSHIPS.map((value) => ({
                                value,
                                label: RELATIONSHIP_LABELS[value],
                            }))}
                            value={relationship}
                            onChange={(value) => setRelationship(value as Relationship)}
                        />
                        <Input
                            label="Role"
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            placeholder="Staff engineer"
                        />
                        <Input
                            label="Team"
                            value={team}
                            onChange={(e) => setTeam(e.target.value)}
                            placeholder="Platform"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label
                            htmlFor="person-notes"
                            className="text-xs font-semibold uppercase tracking-wide text-neutral-400"
                        >
                            Notes (optional)
                        </label>
                        <textarea
                            id="person-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={2}
                            placeholder="What they care about, how they like to work…"
                            className="resize-none rounded-xl border border-neutral-200 px-4 py-2.5 text-sm text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" variant="brand" disabled={saving || !name.trim()}>
                            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add person'}
                        </Button>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setFormOpen(false)
                                setEditing(null)
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </form>
            )}

            {archivedCount > 0 && (
                <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i
                        className={`fa-solid ${showArchived ? 'fa-arrow-left' : 'fa-box-archive'} text-[10px]`}
                        aria-hidden="true"
                    />
                    {showArchived ? 'Back to current people' : `Archived (${archivedCount})`}
                </button>
            )}

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : sections.length === 0 ? (
                <div className="rounded-3xl bg-white ring-1 ring-black/[0.06]">
                    <EmptyState
                        icon="fa-solid fa-user-group"
                        title={showArchived ? 'Nobody archived' : 'No people yet'}
                        description={
                            showArchived
                                ? undefined
                                : 'Add the people you work with, and anything you park in Waiting On can point at a real name.'
                        }
                        action={
                            showArchived ? undefined : (
                                <Button
                                    variant="brand"
                                    icon="fa-solid fa-plus"
                                    onClick={() => openForm(null)}
                                >
                                    Add person
                                </Button>
                            )
                        }
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {sections.map((section) => (
                        <section key={section.key}>
                            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {section.title}
                            </h2>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {section.people.map((person) => {
                                    const waiting = waitingByPerson.get(person._id) ?? []
                                    const oldest = waiting.length
                                        ? Math.max(...waiting.map((t) => waitingDays(t, today)))
                                        : 0
                                    const tone = waitTone(oldest)

                                    const menu: MenuEntry[] = [
                                        {
                                            label: 'Edit',
                                            icon: 'fa-solid fa-pen',
                                            onClick: () => openForm(person),
                                        },
                                        person.archived
                                            ? {
                                                  label: 'Restore',
                                                  icon: 'fa-solid fa-rotate-left',
                                                  onClick: () => void setArchived(person, false),
                                              }
                                            : {
                                                  label: 'Archive',
                                                  icon: 'fa-solid fa-box-archive',
                                                  onClick: () => void setArchived(person, true),
                                              },
                                        'divider',
                                        {
                                            label: 'Delete',
                                            icon: 'fa-solid fa-trash',
                                            onClick: () => setPendingDelete(person),
                                            danger: true,
                                        },
                                    ]

                                    return (
                                        <article
                                            key={person._id}
                                            className="flex flex-col rounded-3xl bg-white p-4 ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                                        >
                                            <header className="flex items-start gap-3">
                                                <Avatar name={person.name} size="sm" />
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="truncate text-sm font-bold tracking-tight text-neutral-900">
                                                        {person.name}
                                                    </h3>
                                                    <p className="truncate text-xs text-neutral-400">
                                                        {[person.role, person.team]
                                                            .filter(Boolean)
                                                            .join(' · ') ||
                                                            RELATIONSHIP_LABELS[person.relationship]}
                                                    </p>
                                                </div>
                                                <DropdownMenu
                                                    align="right"
                                                    className="shrink-0"
                                                    items={menu}
                                                    trigger={
                                                        <span
                                                            role="button"
                                                            aria-label={`Actions for ${person.name}`}
                                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                        >
                                                            <i
                                                                className="fa-solid fa-ellipsis-vertical text-xs"
                                                                aria-hidden="true"
                                                            />
                                                        </span>
                                                    }
                                                />
                                            </header>

                                            {person.notes && (
                                                <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-neutral-500">
                                                    {person.notes}
                                                </p>
                                            )}

                                            {waiting.length > 0 && (
                                                <Link
                                                    to="/work/waiting"
                                                    className={`mt-3 inline-flex items-center gap-2 self-start rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                                        tone === 'stale'
                                                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                                            : tone === 'aging'
                                                              ? 'bg-marigold-50 text-amber-700 hover:bg-marigold-200/60'
                                                              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                                    }`}
                                                >
                                                    <i
                                                        className="fa-solid fa-hourglass-half text-[9px]"
                                                        aria-hidden="true"
                                                    />
                                                    {waiting.length} waiting · oldest {oldest}d
                                                </Link>
                                            )}
                                        </article>
                                    )
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <ConfirmModal
                open={pendingDelete !== null}
                title="Remove person"
                message={
                    <>
                        Remove <strong>{pendingDelete?.name}</strong>? Archiving keeps them on past
                        items and just hides them from the pickers.
                    </>
                }
                confirmLabel="Remove"
                danger
                onConfirm={confirmDelete}
                onClose={() => setPendingDelete(null)}
            />
        </Container>
    )
}
