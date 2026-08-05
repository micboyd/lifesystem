import { useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import Select from '../components/Select'
import EmptyState from '../components/EmptyState'
import DropdownMenu from '../components/DropdownMenu'
import Drawer from '../components/Drawer'
import Tabs from '../components/Tabs'
import Pagination from '../components/Pagination'
import LineIcon from '../components/LineIcon'
import StrengthLibraries from '../components/StrengthLibraries'
import ConditioningSessionsLog from '../components/ConditioningSessionsLog'
import RecoveryLibrary from '../components/RecoveryLibrary'
import MobilityLibrary from '../components/MobilityLibrary'
import FitnessWeeklyPlanner from '../components/FitnessWeeklyPlanner'
import FitnessExportCenter from '../components/FitnessExportCenter'
import JsonImportPanel from '../components/JsonImportPanel'
import {
    listSessions,
    createSession,
    updateSession,
    deleteSession,
    importSessions,
    type ConditioningInput,
} from '../services/conditioning'
import { CONDITIONING_CATEGORIES } from '../types'
import type { ConditioningSession, ConditioningCategory, SessionPart } from '../types'

// ─── Import template ──────────────────────────────────────────────────────────

const SESSION_TEMPLATE = JSON.stringify(
    [
        {
            name: 'Treadmill Run-Walk Intervals',
            duration: 30,
            category: 'Endurance',
            purpose: 'Rebuild tolerance to running impact through controlled run-walk intervals.',
            parts: [
                {
                    name: 'Warm-up',
                    detail: '0.5% incline. Walk 3 min @ 4.2 km/h, then 4 min @ 5.2 km/h.',
                },
                {
                    name: 'Main set',
                    detail: '90 sec jog @ 7.0 km/h, then 2 min walk @ 5.0 km/h. ~1.05 km running.',
                    rounds: 6,
                    roundLabel: 'jog/walk',
                },
                { name: 'Cool-down', detail: 'Walk 2 min @ 5.0 km/h, then 3 min @ 4.0 km/h.' },
            ],
            howToUse: 'Leave at least one non-running day before the next run.',
        },
        {
            name: 'HIIT Bike Intervals',
            duration: 25,
            category: 'HIIT',
            purpose: 'Improve anaerobic capacity.',
            parts: [
                { name: 'Warm-up', detail: '5 min easy spin' },
                { name: 'Intervals', detail: '8 x 30s hard / 90s easy' },
                { name: 'Cool-down', detail: '5 min easy spin' },
            ],
        },
    ],
    null,
    2
)

const TABS = ['Planner', 'Strength', 'Conditioning', 'Mobility', 'Recovery'] as const
type Tab = (typeof TABS)[number]

const SUBTITLE: Record<Tab, string> = {
    Planner: 'Plan your training — drop strength, conditioning, mobility and recovery into each day.',
    Strength: 'Track your training programmes, sessions and progress.',
    Conditioning: 'Track your training programmes, sessions and progress.',
    Mobility: 'Build a library of mobility routines — flows, circuits and drills.',
    Recovery: 'Build a library of recovery — stretching, sauna, foam rolling and more.',
}

export default function Fitness() {
    const [tab, setTab] = useState<Tab>('Planner')
    const [exportOpen, setExportOpen] = useState(false)

    return (
        <main className="py-10">
            <Container>
                <header className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Fitness</h1>
                        <p className="mt-1 text-sm text-neutral-500">{SUBTITLE[tab]}</p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        icon="fa-solid fa-file-export"
                        onClick={() => setExportOpen(true)}
                        className="shrink-0"
                    >
                        Export
                    </Button>
                </header>

                <Tabs
                    tabs={[...TABS]}
                    value={tab}
                    onChange={(t) => setTab(t as Tab)}
                    className="self-start"
                />
            </Container>

            {tab === 'Planner' ? (
                <Container fluid className="mt-8">
                    <FitnessWeeklyPlanner />
                </Container>
            ) : (
                <Container className="mt-6">
                    {tab === 'Strength' ? (
                        <StrengthLibraries />
                    ) : tab === 'Conditioning' ? (
                        <ConditioningSection />
                    ) : tab === 'Mobility' ? (
                        <MobilityLibrary />
                    ) : (
                        <RecoveryLibrary />
                    )}
                </Container>
            )}

            <FitnessExportCenter open={exportOpen} onClose={() => setExportOpen(false)} />
        </main>
    )
}

// ─── Conditioning section ───────────────────────────────────────────────────────

const CONDITIONING_SUB_TABS = ['Sessions', 'Session Library'] as const
type ConditioningSubTab = (typeof CONDITIONING_SUB_TABS)[number]

/** Conditioning splits into logged Sessions and the reusable Session Library. */
function ConditioningSection() {
    const [sub, setSub] = useState<ConditioningSubTab>('Sessions')

    return (
        <div className="flex flex-col gap-6">
            <Tabs
                tabs={[...CONDITIONING_SUB_TABS]}
                value={sub}
                onChange={(t) => setSub(t as ConditioningSubTab)}
                className="self-start"
            />

            {sub === 'Sessions' ? <ConditioningSessionsLog /> : <ConditioningLibrary />}
        </div>
    )
}

// ─── Category presentation ─────────────────────────────────────────────────────

const CATEGORY_META: Record<ConditioningCategory, string> = {
    HIIT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    Cardio: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    Endurance: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    Mobility: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Recovery: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

function CategoryChip({ category }: { category: ConditioningCategory }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CATEGORY_META[category]}`}
        >
            {category}
        </span>
    )
}

// ─── Library ────────────────────────────────────────────────────────────────────

/** Drawer state: viewing a session, adding a new one, or editing an existing one. */
type Drawered =
    | { mode: 'view'; session: ConditioningSession }
    | { mode: 'create' }
    | { mode: 'edit'; session: ConditioningSession }
    | null

const PAGE_SIZE = 9

function ConditioningLibrary() {
    const [loading, setLoading] = useState(true)
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [importing, setImporting] = useState(false)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)

    useEffect(() => {
        listSessions()
            .then(setSessions)
            .finally(() => setLoading(false))
    }, [])

    // Filter by name/purpose, then paginate the matches 9 at a time.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return sessions
        return sessions.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                (s.purpose ?? '').toLowerCase().includes(q)
        )
    }, [sessions, search])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    async function reload() {
        setSessions(await listSessions())
    }

    async function handleAdd(fields: ConditioningInput) {
        const session = await createSession(fields)
        setSessions((prev) => [...prev, session])
    }

    async function handleSave(id: string, fields: ConditioningInput) {
        const updated = await updateSession(id, fields)
        setSessions((prev) => prev.map((s) => (s._id === id ? updated : s)))
        setDrawer((d) =>
            d && d.mode === 'view' && d.session._id === id ? { mode: 'view', session: updated } : d
        )
    }

    async function handleDelete(id: string) {
        setSessions((prev) => prev.filter((s) => s._id !== id))
        setDrawer((d) => (d && 'session' in d && d.session._id === id ? null : d))
        await deleteSession(id)
    }

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import sessions"
                description="Copy the template, fill it in with your own conditioning sessions, then paste the JSON below to add them all to your library at once."
                template={SESSION_TEMPLATE}
                itemNoun="session"
                onBack={() => setImporting(false)}
                doImport={importSessions}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
                notes={
                    <>
                        <p>
                            <span className="font-semibold text-neutral-700">name</span> is the only
                            required field. Everything else is optional and defaults sensibly.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">category</span> must be one
                            of: {CONDITIONING_CATEGORIES.join(', ')}.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">parts</span> each take a{' '}
                            <span className="font-semibold text-neutral-700">name</span> and an optional{' '}
                            <span className="font-semibold text-neutral-700">detail</span>. Add{' '}
                            <span className="font-semibold text-neutral-700">rounds</span> (a number) to a
                            part to get a tap-to-count counter, plus an optional{' '}
                            <span className="font-semibold text-neutral-700">roundLabel</span>.
                        </p>
                    </>
                }
            />
        )
    }

    return (
        <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    placeholder="Search sessions…"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                    }}
                    className="w-full sm:w-64"
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-file-import"
                        onClick={() => setImporting(true)}
                    >
                        Import
                    </Button>
                    <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                        New session
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : sessions.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-heart-pulse"
                    title="No sessions yet"
                    description="Add your first conditioning session to start building a library."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            New session
                        </Button>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={`No sessions match “${search.trim()}”.`}
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pageItems.map((session) => (
                            <SessionCard
                                key={session._id}
                                session={session}
                                onOpen={() => setDrawer({ mode: 'view', session })}
                                onEdit={() => setDrawer({ mode: 'edit', session })}
                                onDelete={() => handleDelete(session._id)}
                            />
                        ))}
                    </div>
                    <Pagination
                        page={page}
                        pageCount={pageCount}
                        onChange={setPage}
                        className="mt-6 justify-center"
                    />
                </>
            )}

            <SessionViewDrawer
                session={drawer?.mode === 'view' ? drawer.session : null}
                onClose={() => setDrawer(null)}
                onEdit={(session) => setDrawer({ mode: 'edit', session })}
                onDelete={handleDelete}
            />

            <SessionFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

// ─── Session card ───────────────────────────────────────────────────────────────

function SessionCard({
    session,
    onOpen,
    onEdit,
    onDelete,
}: {
    session: ConditioningSession
    onOpen: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`View ${session.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{session.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                        {session.duration} min
                        {session.parts.length > 0
                            ? ` · ${session.parts.length} ${session.parts.length === 1 ? 'part' : 'parts'}`
                            : ''}
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Session actions"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            <div className="flex flex-wrap gap-1.5">
                <CategoryChip category={session.category} />
            </div>

            {session.purpose && (
                <p className="mt-auto line-clamp-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                    {session.purpose}
                </p>
            )}
        </Card>
    )
}

// ─── View drawer ────────────────────────────────────────────────────────────────

function SessionViewDrawer({
    session,
    onClose,
    onEdit,
    onDelete,
}: {
    session: ConditioningSession | null
    onClose: () => void
    onEdit: (session: ConditioningSession) => void
    onDelete: (id: string) => void
}) {
    // Retain the last session while the drawer animates closed.
    const [view, setView] = useState<ConditioningSession | null>(session)
    useEffect(() => {
        if (session) setView(session)
    }, [session])

    // Completed-round tallies keyed by part index. Reset each time a session opens.
    const [counts, setCounts] = useState<Record<number, number>>({})
    useEffect(() => {
        if (session) setCounts({})
    }, [session])

    const s = view
    return (
        <Drawer
            open={!!session}
            onClose={onClose}
            title={s?.name ?? 'Session'}
            footer={
                s && (
                    <>
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(s._id)}
                        >
                            Delete
                        </Button>
                        <Button icon="fa-solid fa-pen" onClick={() => onEdit(s)}>
                            Edit
                        </Button>
                    </>
                )
            }
        >
            {s && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <CategoryChip category={s.category} />
                        <span className="text-sm text-neutral-500">{s.duration} min</span>
                    </div>

                    {s.purpose && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Purpose
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{s.purpose}</p>
                        </section>
                    )}

                    {s.parts.length > 0 && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Session parts
                            </p>
                            <ol className="flex flex-col gap-3">
                                {s.parts.map((part, i) => (
                                    <li key={i} className="flex gap-3 text-sm">
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                            {i + 1}
                                        </span>
                                        <div className="min-w-0 flex-1 pt-0.5">
                                            <p className="font-semibold text-neutral-900">{part.name}</p>
                                            {part.detail && (
                                                <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                                    {part.detail}
                                                </p>
                                            )}
                                            {!!part.rounds && (
                                                <RoundCounter
                                                    target={part.rounds}
                                                    label={part.roundLabel}
                                                    done={counts[i] ?? 0}
                                                    onChange={(next) =>
                                                        setCounts((c) => ({ ...c, [i]: next }))
                                                    }
                                                />
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {s.howToUse && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                How to use
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{s.howToUse}</p>
                        </section>
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Round counter ──────────────────────────────────────────────────────────────

/**
 * A tap-to-count control for interval parts (e.g. "6 x 90s jog / 2min walk").
 * Big primary button logs a round; the dots and X / N read-out track progress;
 * an undo steps back. State is ephemeral — it lives only while the drawer is open.
 */
function RoundCounter({
    target,
    label,
    done,
    onChange,
}: {
    target: number
    label?: string
    done: number
    onChange: (next: number) => void
}) {
    const complete = done >= target
    const one = (label?.trim() || 'round').toLowerCase()
    const many = one.endsWith('s') ? one : `${one}s`

    return (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {target} {many}
                </span>
                <span
                    className={`text-sm font-bold tabular-nums ${
                        complete ? 'text-emerald-600' : 'text-neutral-900'
                    }`}
                >
                    {done} / {target}
                </span>
            </div>

            {/* Progress dots — one per round, filled as you go. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
                {Array.from({ length: target }, (_, i) => (
                    <span
                        key={i}
                        className={`h-2.5 flex-1 rounded-full transition-colors ${
                            i < done ? 'bg-emerald-500' : 'bg-neutral-200'
                        }`}
                        style={{ minWidth: 10 }}
                    />
                ))}
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onChange(Math.min(target, done + 1))}
                    disabled={complete}
                    className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                        complete
                            ? 'cursor-default bg-emerald-100 text-emerald-700'
                            : 'bg-coral-500 text-white hover:bg-coral-600 active:bg-coral-700'
                    }`}
                >
                    {complete ? (
                        <>
                            <i className="fa-solid fa-check mr-1.5" />
                            All {target} done
                        </>
                    ) : (
                        <>Tap after each {one}</>
                    )}
                </button>
                <button
                    type="button"
                    aria-label="Undo one"
                    onClick={() => onChange(Math.max(0, done - 1))}
                    disabled={done === 0}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-white hover:text-neutral-800 disabled:opacity-40"
                >
                    <i className="fa-solid fa-rotate-left" />
                </button>
            </div>
        </div>
    )
}

// ─── Add / edit drawer ──────────────────────────────────────────────────────────

type FormState = { mode: 'create' } | { mode: 'edit'; session: ConditioningSession }

/** A part row carries a stable key for React list editing. */
interface PartRow extends SessionPart {
    key: string
}

let rowSeq = 0
const nextKey = () => `row-${rowSeq++}`

function SessionFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: FormState | null
    onClose: () => void
    onAdd: (fields: ConditioningInput) => Promise<void>
    onSave: (id: string, fields: ConditioningInput) => Promise<void>
}) {
    const [view, setView] = useState<FormState | null>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.session : undefined

    const [name, setName] = useState('')
    const [duration, setDuration] = useState('0')
    const [category, setCategory] = useState<ConditioningCategory>('HIIT')
    const [purpose, setPurpose] = useState('')
    const [parts, setParts] = useState<PartRow[]>([])
    const [howToUse, setHowToUse] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset all fields whenever the drawer opens for a different session.
    useEffect(() => {
        setName(editing?.name ?? '')
        setDuration(editing?.duration != null ? String(editing.duration) : '0')
        setCategory(editing?.category ?? 'HIIT')
        setPurpose(editing?.purpose ?? '')
        setParts((editing?.parts ?? []).map((p) => ({ ...p, key: nextKey() })))
        setHowToUse(editing?.howToUse ?? '')
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const valid = name.trim() !== ''

    function num(s: string): number {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 ? n : 0
    }

    async function submit() {
        if (!view || !valid) return
        const fields: ConditioningInput = {
            name: name.trim(),
            duration: num(duration),
            category,
            purpose: purpose.trim() || undefined,
            parts: parts
                .map((p) => {
                    const rounds = p.rounds && p.rounds >= 1 ? Math.floor(p.rounds) : undefined
                    return {
                        name: p.name.trim(),
                        detail: p.detail?.trim() || undefined,
                        rounds,
                        roundLabel: rounds ? p.roundLabel?.trim() || undefined : undefined,
                    }
                })
                .filter((p) => p.name !== ''),
            howToUse: howToUse.trim() || undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.session._id, fields)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={view?.mode === 'edit' ? 'Edit session' : 'New session'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : view?.mode === 'edit' ? 'Save' : 'Add'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Input
                    label="Session name *"
                    autoFocus
                    placeholder="e.g. Extensive Tempo Runs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <div className="flex gap-3">
                    <Input
                        label="Duration (min) *"
                        type="number"
                        min={0}
                        step="any"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="flex-1"
                    />
                    <Select
                        label="Category *"
                        value={category}
                        onChange={(v) => setCategory(v as ConditioningCategory)}
                        options={CONDITIONING_CATEGORIES.map((c) => ({ label: c, value: c }))}
                        className="flex-1"
                    />
                </div>

                <Textarea
                    label="Purpose"
                    rows={2}
                    placeholder="e.g. Build aerobic base, support recovery, improve work capacity"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                />

                <PartsEditor rows={parts} onChange={setParts} />

                <Textarea
                    label="How to use"
                    rows={3}
                    placeholder="When to run this session, pacing cues, progressions…"
                    value={howToUse}
                    onChange={(e) => setHowToUse(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

// ─── Parts editor ───────────────────────────────────────────────────────────────

function PartsEditor({
    rows,
    onChange,
}: {
    rows: PartRow[]
    onChange: (rows: PartRow[]) => void
}) {
    function update(key: string, patch: Partial<SessionPart>) {
        onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    }
    function remove(key: string) {
        onChange(rows.filter((r) => r.key !== key))
    }
    function add() {
        onChange([...rows, { key: nextKey(), name: '', detail: '' }])
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Session parts
                </label>
                <Button variant="ghost" size="sm" icon="fa-solid fa-plus" onClick={add}>
                    Add part
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                    No parts yet — add a warm-up, main set, cool-down, etc.
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((r, i) => (
                        <div
                            key={r.key}
                            className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <input
                                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                    placeholder="Part name (e.g. Warm-up)"
                                    value={r.name}
                                    onChange={(e) => update(r.key, { name: e.target.value })}
                                />
                                <button
                                    type="button"
                                    aria-label="Remove part"
                                    onClick={() => remove(r.key)}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600"
                                >
                                    <i className="fa-solid fa-xmark" />
                                </button>
                            </div>
                            <textarea
                                className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                rows={2}
                                placeholder="Details (sets, reps, distance, pace…)"
                                value={r.detail ?? ''}
                                onChange={(e) => update(r.key, { detail: e.target.value })}
                            />

                            {/* Optional interval counter — leave rounds blank for plain parts. */}
                            <div className="flex flex-wrap items-center gap-2 pl-8 text-xs text-neutral-500">
                                <span className="font-medium">Tap-to-count</span>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="w-16 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                    placeholder="6"
                                    value={r.rounds ?? ''}
                                    onChange={(e) =>
                                        update(r.key, {
                                            rounds: e.target.value ? Number(e.target.value) : undefined,
                                        })
                                    }
                                />
                                <span>rounds of</span>
                                <input
                                    className="w-28 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-400"
                                    placeholder="round"
                                    disabled={!r.rounds}
                                    value={r.roundLabel ?? ''}
                                    onChange={(e) => update(r.key, { roundLabel: e.target.value })}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
