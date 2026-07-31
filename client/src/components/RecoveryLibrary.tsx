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
import {
    listRecovery,
    createRecovery,
    updateRecovery,
    deleteRecovery,
    type RecoveryInput,
} from '../services/recovery'
import type { Recovery } from '../types'

// ─── Library ────────────────────────────────────────────────────────────────────

/** Drawer state: viewing an item, adding a new one, or editing an existing one. */
type Drawered =
    | { mode: 'view'; item: Recovery }
    | { mode: 'create' }
    | { mode: 'edit'; item: Recovery }
    | null

const PAGE_SIZE = 9

/**
 * The Recovery library — a lightweight sibling of the conditioning library.
 * Items are just a name, duration, purpose and free-text notes; no categories,
 * structured parts or bulk import.
 */
export default function RecoveryLibrary() {
    const [loading, setLoading] = useState(true)
    const [items, setItems] = useState<Recovery[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)

    useEffect(() => {
        listRecovery()
            .then(setItems)
            .finally(() => setLoading(false))
    }, [])

    // Filter by name/purpose, then paginate the matches 9 at a time.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        
        if (!q) return items
        return items.filter(
            (r) =>
                r.name.toLowerCase().includes(q) || (r.purpose ?? '').toLowerCase().includes(q)
        )
    }, [items, search])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    async function handleAdd(fields: RecoveryInput) {
        const item = await createRecovery(fields)
        setItems((prev) => [...prev, item])
    }

    async function handleSave(id: string, fields: RecoveryInput) {
        const updated = await updateRecovery(id, fields)
        setItems((prev) => prev.map((r) => (r._id === id ? updated : r)))
        setDrawer((d) =>
            d && d.mode === 'view' && d.item._id === id ? { mode: 'view', item: updated } : d
        )
    }

    async function handleDelete(id: string) {
        setItems((prev) => prev.filter((r) => r._id !== id))
        setDrawer((d) => (d && 'item' in d && d.item._id === id ? null : d))
        await deleteRecovery(id)
    }

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    placeholder="Search recovery…"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                    }}
                    className="w-full sm:w-64"
                />
                <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                    New recovery
                </Button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : items.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-spa"
                    title="No recovery items yet"
                    description="Add your first recovery item — stretching, mobility, sauna, foam rolling — to start building a library."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            New recovery
                        </Button>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={`No recovery items match “${search.trim()}”.`}
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pageItems.map((item) => (
                            <RecoveryCard
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

            <RecoveryViewDrawer
                item={drawer?.mode === 'view' ? drawer.item : null}
                onClose={() => setDrawer(null)}
                onEdit={(item) => setDrawer({ mode: 'edit', item })}
                onDelete={handleDelete}
            />

            <RecoveryFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

// ─── Card ────────────────────────────────────────────────────────────────────────

function RecoveryCard({
    item,
    onOpen,
    onEdit,
    onDelete,
}: {
    item: Recovery
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
                    <p className="mt-0.5 text-xs text-neutral-400">{item.duration} min</p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Recovery actions"
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

function RecoveryViewDrawer({
    item,
    onClose,
    onEdit,
    onDelete,
}: {
    item: Recovery | null
    onClose: () => void
    onEdit: (item: Recovery) => void
    onDelete: (id: string) => void
}) {
    // Retain the last item while the drawer animates closed.
    const [view, setView] = useState<Recovery | null>(item)
    useEffect(() => {
        if (item) setView(item)
    }, [item])

    const r = view
    return (
        <Drawer
            open={!!item}
            onClose={onClose}
            title={r?.name ?? 'Recovery'}
            footer={
                r && (
                    <>
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(r._id)}
                        >
                            Delete
                        </Button>
                        <Button icon="fa-solid fa-pen" onClick={() => onEdit(r)}>
                            Edit
                        </Button>
                    </>
                )
            }
        >
            {r && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Recovery
                        </span>
                        <span className="text-sm text-neutral-500">{r.duration} min</span>
                    </div>

                    {r.purpose && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Purpose
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{r.purpose}</p>
                        </section>
                    )}

                    {r.notes && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Notes
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{r.notes}</p>
                        </section>
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Add / edit drawer ──────────────────────────────────────────────────────────

type FormState = { mode: 'create' } | { mode: 'edit'; item: Recovery }

function RecoveryFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: FormState | null
    onClose: () => void
    onAdd: (fields: RecoveryInput) => Promise<void>
    onSave: (id: string, fields: RecoveryInput) => Promise<void>
}) {
    const [view, setView] = useState<FormState | null>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.item : undefined

    const [name, setName] = useState('')
    const [duration, setDuration] = useState('0')
    const [purpose, setPurpose] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset all fields whenever the drawer opens for a different item.
    useEffect(() => {
        setName(editing?.name ?? '')
        setDuration(editing?.duration != null ? String(editing.duration) : '0')
        setPurpose(editing?.purpose ?? '')
        setNotes(editing?.notes ?? '')
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
        const fields: RecoveryInput = {
            name: name.trim(),
            duration: num(duration),
            purpose: purpose.trim() || undefined,
            notes: notes.trim() || undefined,
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
            title={view?.mode === 'edit' ? 'Edit recovery' : 'New recovery'}
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
                    label="Recovery name *"
                    autoFocus
                    placeholder="e.g. Hip mobility flow"
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
                    placeholder="e.g. Ease tight hips, wind down before sleep"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                />

                <Textarea
                    label="Notes"
                    rows={4}
                    placeholder="How to run it, cues, sets of stretches…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}
