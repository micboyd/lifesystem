import { useEffect, useMemo, useState } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import Textarea from './Textarea'
import EmptyState from './EmptyState'
import DropdownMenu from './DropdownMenu'
import Drawer from './Drawer'
import Pagination from './Pagination'
import LineIcon from './LineIcon'
import JsonImportPanel from './JsonImportPanel'
import {
    listMobility,
    createMobility,
    updateMobility,
    deleteMobility,
    importMobility,
    type MobilityInput,
} from '../services/mobility'
import type { Mobility, SessionPart } from '../types'

// ─── Import template ──────────────────────────────────────────────────────────

const MOBILITY_TEMPLATE = JSON.stringify(
    [
        {
            name: 'Hip Mobility Flow',
            duration: 12,
            purpose: 'Open up tight hips before lower-body training.',
            parts: [
                { name: '90/90 switches', detail: '2 min, slow and controlled' },
                { name: 'Deep squat holds', detail: '3 x 30s, prying knees out' },
                { name: 'Couch stretch', detail: '60s per side' },
            ],
            howToUse: 'Run before squats or on rest days.',
        },
        {
            name: 'Shoulder CARs',
            duration: 8,
            purpose: 'Maintain healthy shoulder range of motion.',
            parts: [
                { name: 'Controlled articular rotations', detail: '5 slow reps each direction, per arm' },
            ],
        },
    ],
    null,
    2
)

// ─── Library ────────────────────────────────────────────────────────────────────

/** Drawer state: viewing a routine, adding a new one, or editing an existing one. */
type Drawered =
    | { mode: 'view'; item: Mobility }
    | { mode: 'create' }
    | { mode: 'edit'; item: Mobility }
    | null

const PAGE_SIZE = 9

/**
 * The Mobility library — reusable mobility routines, structured like conditioning
 * sessions (ordered parts + how-to-use) but without a category. Items can be
 * added, edited, bulk-imported from JSON, and dropped into the weekly planner.
 */
export default function MobilityLibrary() {
    const [loading, setLoading] = useState(true)
    const [items, setItems] = useState<Mobility[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [importing, setImporting] = useState(false)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)

    useEffect(() => {
        listMobility()
            .then(setItems)
            .finally(() => setLoading(false))
    }, [])

    // Filter by name/purpose, then paginate the matches 9 at a time.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return items
        return items.filter(
            (m) =>
                m.name.toLowerCase().includes(q) || (m.purpose ?? '').toLowerCase().includes(q)
        )
    }, [items, search])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    async function reload() {
        setItems(await listMobility())
    }

    async function handleAdd(fields: MobilityInput) {
        const item = await createMobility(fields)
        setItems((prev) => [...prev, item])
    }

    async function handleSave(id: string, fields: MobilityInput) {
        const updated = await updateMobility(id, fields)
        setItems((prev) => prev.map((m) => (m._id === id ? updated : m)))
        setDrawer((d) =>
            d && d.mode === 'view' && d.item._id === id ? { mode: 'view', item: updated } : d
        )
    }

    async function handleDelete(id: string) {
        setItems((prev) => prev.filter((m) => m._id !== id))
        setDrawer((d) => (d && 'item' in d && d.item._id === id ? null : d))
        await deleteMobility(id)
    }

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import mobility"
                description="Copy the template, fill it in with your own mobility routines, then paste the JSON below to add them all to your library at once."
                template={MOBILITY_TEMPLATE}
                itemNoun="routine"
                onBack={() => setImporting(false)}
                doImport={importMobility}
                resource="mobility"
                existingItems={items}
                onLibraryChanged={reload}
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
                            <span className="font-semibold text-neutral-700">parts</span> each take a{' '}
                            <span className="font-semibold text-neutral-700">name</span> and an optional{' '}
                            <span className="font-semibold text-neutral-700">detail</span>.
                        </p>
                    </>
                }
            />
        )
    }

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    placeholder="Search mobility…"
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
                        New routine
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : items.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-person-walking"
                    title="No mobility routines yet"
                    description="Add your first mobility routine — a hip flow, shoulder circuit, ankle prep — to start building a library."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            New routine
                        </Button>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={`No mobility routines match “${search.trim()}”.`}
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pageItems.map((item) => (
                            <MobilityCard
                                key={item._id}
                                item={item}
                                onOpen={() => setDrawer({ mode: 'view', item })}
                                onEdit={() => setDrawer({ mode: 'edit', item })}
                                onDelete={() => handleDelete(item._id)}
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

            <MobilityViewDrawer
                item={drawer?.mode === 'view' ? drawer.item : null}
                onClose={() => setDrawer(null)}
                onEdit={(item) => setDrawer({ mode: 'edit', item })}
                onDelete={handleDelete}
            />

            <MobilityFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

// ─── Card ────────────────────────────────────────────────────────────────────────

function MobilityCard({
    item,
    onOpen,
    onEdit,
    onDelete,
}: {
    item: Mobility
    onOpen: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`View ${item.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{item.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                        {item.duration} min
                        {item.parts.length > 0
                            ? ` · ${item.parts.length} ${item.parts.length === 1 ? 'part' : 'parts'}`
                            : ''}
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Routine actions"
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

            {item.purpose && (
                <p className="mt-auto line-clamp-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                    {item.purpose}
                </p>
            )}
        </Card>
    )
}

// ─── View drawer ────────────────────────────────────────────────────────────────

function MobilityViewDrawer({
    item,
    onClose,
    onEdit,
    onDelete,
}: {
    item: Mobility | null
    onClose: () => void
    onEdit: (item: Mobility) => void
    onDelete: (id: string) => void
}) {
    // Retain the last routine while the drawer animates closed.
    const [view, setView] = useState<Mobility | null>(item)
    useEffect(() => {
        if (item) setView(item)
    }, [item])

    const m = view
    return (
        <Drawer
            open={!!item}
            onClose={onClose}
            title={m?.name ?? 'Mobility'}
            footer={
                m && (
                    <>
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(m._id)}
                        >
                            Delete
                        </Button>
                        <Button icon="fa-solid fa-pen" onClick={() => onEdit(m)}>
                            Edit
                        </Button>
                    </>
                )
            }
        >
            {m && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Mobility
                        </span>
                        <span className="text-sm text-neutral-500">{m.duration} min</span>
                    </div>

                    {m.purpose && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Purpose
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{m.purpose}</p>
                        </section>
                    )}

                    {m.parts.length > 0 && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Routine parts
                            </p>
                            <ol className="flex flex-col gap-3">
                                {m.parts.map((part, i) => (
                                    <li key={i} className="flex gap-3 text-sm">
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                            {i + 1}
                                        </span>
                                        <div className="min-w-0 pt-0.5">
                                            <p className="font-semibold text-neutral-900">{part.name}</p>
                                            {part.detail && (
                                                <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                                    {part.detail}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {m.howToUse && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                How to use
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{m.howToUse}</p>
                        </section>
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Add / edit drawer ──────────────────────────────────────────────────────────

type FormState = { mode: 'create' } | { mode: 'edit'; item: Mobility }

/** A part row carries a stable key for React list editing. */
interface PartRow extends SessionPart {
    key: string
}

let rowSeq = 0
const nextKey = () => `row-${rowSeq++}`

function MobilityFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: FormState | null
    onClose: () => void
    onAdd: (fields: MobilityInput) => Promise<void>
    onSave: (id: string, fields: MobilityInput) => Promise<void>
}) {
    const [view, setView] = useState<FormState | null>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.item : undefined

    const [name, setName] = useState('')
    const [duration, setDuration] = useState('0')
    const [purpose, setPurpose] = useState('')
    const [parts, setParts] = useState<PartRow[]>([])
    const [howToUse, setHowToUse] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset all fields whenever the drawer opens for a different routine.
    useEffect(() => {
        setName(editing?.name ?? '')
        setDuration(editing?.duration != null ? String(editing.duration) : '0')
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
        const fields: MobilityInput = {
            name: name.trim(),
            duration: num(duration),
            purpose: purpose.trim() || undefined,
            parts: parts
                .map((p) => ({ name: p.name.trim(), detail: p.detail?.trim() || undefined }))
                .filter((p) => p.name !== ''),
            howToUse: howToUse.trim() || undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.item._id, fields)
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
            title={view?.mode === 'edit' ? 'Edit routine' : 'New routine'}
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
                    label="Routine name *"
                    autoFocus
                    placeholder="e.g. Hip Mobility Flow"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <Input
                    label="Duration (min)"
                    type="number"
                    min={0}
                    step="any"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="sm:w-40"
                />

                <Textarea
                    label="Purpose"
                    rows={2}
                    placeholder="e.g. Open up tight hips before lower-body training"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                />

                <PartsEditor rows={parts} onChange={setParts} />

                <Textarea
                    label="How to use"
                    rows={3}
                    placeholder="When to run this routine, cues, progressions…"
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
                    Routine parts
                </label>
                <Button variant="ghost" size="sm" icon="fa-solid fa-plus" onClick={add}>
                    Add part
                </Button>
            </div>

            {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                    No parts yet — add a movement, stretch or hold.
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
                                    placeholder="Part name (e.g. 90/90 switches)"
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
                                placeholder="Details (reps, holds, tempo, cues…)"
                                value={r.detail ?? ''}
                                onChange={(e) => update(r.key, { detail: e.target.value })}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
