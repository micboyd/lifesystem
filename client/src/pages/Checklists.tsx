import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Container from '../components/Container'
import { Card, CardBody } from '../components/Card'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../context/ToastContext'
import { useInvalidate, useDataVersion } from '../context/DataSyncContext'
import {
    listChecklists,
    createChecklist,
    updateChecklist,
    deleteChecklist,
    resetChecklist,
    addGroup,
    updateGroup,
    deleteGroup,
    addItem,
    updateItem,
    deleteItem,
} from '../services/checklists'
import {
    CHECKLIST_COLORS,
    CHECKLIST_COLOR_CLASSES,
    type Checklist,
    type ChecklistColor,
    type ChecklistGroup,
} from '../types'

/** Total and completed item counts across every group. */
function progressOf(list: Checklist): { done: number; total: number } {
    let done = 0
    let total = 0
    for (const g of list.groups) {
        for (const i of g.items) {
            total++
            if (i.done) done++
        }
    }
    return { done, total }
}

// ── Colour swatch picker ──────────────────────────────────────────────────────

function ColorPicker({
    value,
    onChange,
}: {
    value: ChecklistColor
    onChange: (c: ChecklistColor) => void
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {CHECKLIST_COLORS.map((c) => {
                const active = c === value
                return (
                    <button
                        key={c}
                        type="button"
                        onClick={() => onChange(c)}
                        aria-label={c}
                        aria-pressed={active}
                        className={[
                            'h-7 w-7 rounded-full transition-transform',
                            CHECKLIST_COLOR_CLASSES[c].dot,
                            active
                                ? `scale-110 ring-2 ring-offset-2 ${CHECKLIST_COLOR_CLASSES[c].ring}`
                                : 'hover:scale-105',
                        ].join(' ')}
                    />
                )
            })}
        </div>
    )
}

// ── Checklist meta modal (create / edit title, description, colour) ────────────

interface MetaModalProps {
    checklist: Checklist | null // null = creating
    onClose: () => void
    onSaved: (c: Checklist) => void
}

function MetaModal({ checklist, onClose, onSaved }: MetaModalProps) {
    const toast = useToast()
    const [title, setTitle] = useState(checklist?.title ?? '')
    const [description, setDescription] = useState(checklist?.description ?? '')
    const [color, setColor] = useState<ChecklistColor>(checklist?.color ?? 'neutral')
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e?: FormEvent) {
        e?.preventDefault()
        if (!title.trim()) return
        setSaving(true)
        try {
            const input = { title: title.trim(), description: description.trim() || null, color }
            const saved = checklist
                ? await updateChecklist(checklist._id, input)
                : await createChecklist(input)
            onSaved(saved)
        } catch {
            toast.error('Couldn’t save that checklist.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={checklist ? 'Edit checklist' : 'New checklist'}
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => handleSubmit()} disabled={saving || !title.trim()}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Weekend trip packing"
                    autoFocus
                />
                <Textarea
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional — what this checklist is for"
                />
                <div>
                    <span className="mb-2 block text-sm font-semibold text-neutral-700">Colour</span>
                    <ColorPicker value={color} onChange={setColor} />
                </div>
                <button type="submit" className="hidden" aria-hidden="true" />
            </form>
        </Modal>
    )
}

// ── Library card ───────────────────────────────────────────────────────────────

function ChecklistCard({ list, onOpen }: { list: Checklist; onOpen: () => void }) {
    const { done, total } = progressOf(list)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const c = CHECKLIST_COLOR_CLASSES[list.color]
    const groupCount = list.groups.filter((g) => g.items.length > 0 || g.name).length

    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex h-full flex-col rounded-2xl border border-neutral-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-200 hover:shadow-md"
        >
            <div className="flex items-start gap-3">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${c.dot}`} />
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-neutral-900 line-clamp-1">{list.title}</h3>
                    {list.description ? (
                        <p className="mt-1 text-sm text-neutral-500 line-clamp-2">{list.description}</p>
                    ) : null}
                </div>
            </div>

            <div className="mt-4 flex-1" />

            {/* Progress */}
            <div className="mt-2">
                <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-neutral-400">
                        {groupCount} group{groupCount !== 1 ? 's' : ''}
                    </span>
                    <span className={total > 0 && done === total ? c.text : 'text-neutral-400'}>
                        {done}/{total} done
                    </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                        className={`h-full rounded-full transition-all ${c.bar}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            </div>
        </button>
    )
}

// ── Detail: a single item row ──────────────────────────────────────────────────

function ItemRow({
    text,
    done,
    onToggle,
    onRename,
    onDelete,
}: {
    text: string
    done: boolean
    onToggle: () => void
    onRename: (next: string) => void
    onDelete: () => void
}) {
    return (
        <div className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-50">
            <button
                type="button"
                role="checkbox"
                aria-checked={done}
                onClick={onToggle}
                className={[
                    'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                    done
                        ? 'border-coral-500 bg-coral-500 text-white'
                        : 'border-neutral-300 bg-white hover:border-coral-400',
                ].join(' ')}
            >
                {done && <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />}
            </button>
            <input
                defaultValue={text}
                key={text}
                onBlur={(e) => onRename(e.target.value)}
                className={[
                    'min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-neutral-200 focus:border-neutral-400 focus:bg-white focus:outline-none',
                    done ? 'text-neutral-400 line-through' : 'text-neutral-800',
                ].join(' ')}
            />
            <button
                type="button"
                onClick={onDelete}
                aria-label="Delete item"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
            >
                <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
            </button>
        </div>
    )
}

// ── Detail: a group with its items ─────────────────────────────────────────────

function GroupSection({
    group,
    onRenameGroup,
    onDeleteGroup,
    onAddItem,
    onToggleItem,
    onRenameItem,
    onDeleteItem,
}: {
    group: ChecklistGroup
    onRenameGroup: (name: string) => void
    onDeleteGroup: () => void
    onAddItem: (text: string) => void
    onToggleItem: (itemId: string, done: boolean) => void
    onRenameItem: (itemId: string, text: string) => void
    onDeleteItem: (itemId: string) => void
}) {
    const [newItem, setNewItem] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    function handleAdd(e: FormEvent) {
        e.preventDefault()
        const text = newItem.trim()
        if (!text) return
        onAddItem(text)
        setNewItem('')
        inputRef.current?.focus()
    }

    const done = group.items.filter((i) => i.done).length

    return (
        <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
                <input
                    defaultValue={group.name}
                    key={group.name}
                    onBlur={(e) => onRenameGroup(e.target.value)}
                    placeholder="Group name (optional)"
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-bold text-neutral-800 placeholder:font-medium placeholder:text-neutral-300 hover:border-neutral-200 focus:border-neutral-400 focus:bg-white focus:outline-none"
                />
                {group.items.length > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                        {done}/{group.items.length}
                    </span>
                )}
                <button
                    type="button"
                    onClick={onDeleteGroup}
                    aria-label="Delete group"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                    <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                </button>
            </div>

            <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                    <ItemRow
                        key={item._id}
                        text={item.text}
                        done={item.done}
                        onToggle={() => onToggleItem(item._id, !item.done)}
                        onRename={(next) => onRenameItem(item._id, next)}
                        onDelete={() => onDeleteItem(item._id)}
                    />
                ))}
            </div>

            <form onSubmit={handleAdd} className="mt-1 flex items-center gap-2 px-2">
                <i className="fa-solid fa-plus text-[11px] text-neutral-300" aria-hidden="true" />
                <input
                    ref={inputRef}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder="Add an item…"
                    className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none"
                />
            </form>
        </div>
    )
}

// ── Detail view ────────────────────────────────────────────────────────────────

function ChecklistDetail({
    list,
    onBack,
    onChange,
    onEditMeta,
    onDeleted,
}: {
    list: Checklist
    onBack: () => void
    onChange: (c: Checklist) => void
    onEditMeta: () => void
    onDeleted: (id: string) => void
}) {
    const toast = useToast()
    const c = CHECKLIST_COLOR_CLASSES[list.color]
    const { done, total } = progressOf(list)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0

    /** Wrap a mutation: run it, push the returned checklist up, toast on failure. */
    async function run(fn: () => Promise<Checklist>) {
        try {
            onChange(await fn())
        } catch {
            toast.error('Couldn’t save that change.')
        }
    }

    async function handleReset() {
        if (total === 0) return
        await run(() => resetChecklist(list._id))
    }

    async function handleDelete() {
        if (!confirm(`Delete "${list.title}"? This can’t be undone.`)) return
        try {
            await deleteChecklist(list._id)
            onDeleted(list._id)
        } catch {
            toast.error('Couldn’t delete that checklist.')
        }
    }

    return (
        <div>
            <button
                type="button"
                onClick={onBack}
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
            >
                <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                All checklists
            </button>

            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                        <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${c.dot}`} />
                        <h1 className="truncate text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">
                            {list.title}
                        </h1>
                    </div>
                    {list.description ? (
                        <p className="mt-1.5 text-sm text-neutral-500">{list.description}</p>
                    ) : null}
                    {/* Overall progress */}
                    <div className="mt-4 max-w-md">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                            <span className="text-neutral-400">
                                {total > 0 ? `${pct}% complete` : 'No items yet'}
                            </span>
                            <span className="text-neutral-400">
                                {done}/{total}
                            </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                            <div
                                className={`h-full rounded-full transition-all ${c.bar}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" icon="fa-solid fa-rotate-left" onClick={handleReset} disabled={total === 0}>
                        Reset
                    </Button>
                    <Button variant="secondary" icon="fa-solid fa-pen" onClick={onEditMeta}>
                        Edit
                    </Button>
                    <Button
                        variant="ghost"
                        icon="fa-solid fa-trash-can"
                        onClick={handleDelete}
                        aria-label="Delete checklist"
                    >
                        <span className="sr-only">Delete</span>
                    </Button>
                </div>
            </header>

            <div className="flex flex-col gap-4">
                {list.groups.map((group) => (
                    <GroupSection
                        key={group._id}
                        group={group}
                        onRenameGroup={(name) => {
                            if (name.trim() === group.name) return
                            run(() => updateGroup(list._id, group._id, { name }))
                        }}
                        onDeleteGroup={() => {
                            const label = group.name || 'this group'
                            if (group.items.length > 0 && !confirm(`Delete "${label}" and its ${group.items.length} item${group.items.length !== 1 ? 's' : ''}?`)) return
                            run(() => deleteGroup(list._id, group._id))
                        }}
                        onAddItem={(text) => run(() => addItem(list._id, group._id, text))}
                        onToggleItem={(itemId, checked) =>
                            run(() => updateItem(list._id, group._id, itemId, { done: checked }))
                        }
                        onRenameItem={(itemId, text) => {
                            const current = group.items.find((i) => i._id === itemId)
                            if (!text.trim() || text.trim() === current?.text) return
                            run(() => updateItem(list._id, group._id, itemId, { text }))
                        }}
                        onDeleteItem={(itemId) => run(() => deleteItem(list._id, group._id, itemId))}
                    />
                ))}

                <button
                    type="button"
                    onClick={() => run(() => addGroup(list._id))}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm font-semibold text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
                >
                    <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                    Add group
                </button>
            </div>
        </div>
    )
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function Checklists() {
    const invalidate = useInvalidate()
    const version = useDataVersion('checklists')

    const [checklists, setChecklists] = useState<Checklist[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [metaModal, setMetaModal] = useState<Checklist | 'new' | null>(null)

    useEffect(() => {
        let active = true
        listChecklists()
            .then((c) => active && setChecklists(c))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [version])

    const selected = useMemo(
        () => checklists.find((c) => c._id === selectedId) ?? null,
        [checklists, selectedId]
    )

    // If the open checklist vanished (e.g. deleted elsewhere), drop back to the library.
    useEffect(() => {
        if (selectedId && !checklists.some((c) => c._id === selectedId)) setSelectedId(null)
    }, [selectedId, checklists])

    function upsert(c: Checklist) {
        setChecklists((prev) => {
            const exists = prev.some((p) => p._id === c._id)
            return exists ? prev.map((p) => (p._id === c._id ? c : p)) : [...prev, c]
        })
        invalidate('checklists')
    }

    function remove(id: string) {
        setChecklists((prev) => prev.filter((p) => p._id !== id))
        setSelectedId(null)
        invalidate('checklists')
    }

    return (
        <Container as="main" className="py-10">
            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : selected ? (
                <ChecklistDetail
                    list={selected}
                    onBack={() => setSelectedId(null)}
                    onChange={upsert}
                    onEditMeta={() => setMetaModal(selected)}
                    onDeleted={remove}
                />
            ) : (
                <>
                    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">Checklists</h1>
                            <p className="mt-1 text-sm text-neutral-500">
                                {checklists.length} checklist{checklists.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <Button icon="fa-solid fa-plus" onClick={() => setMetaModal('new')}>
                            New checklist
                        </Button>
                    </header>

                    {checklists.length === 0 ? (
                        <Card>
                            <CardBody>
                                <EmptyState
                                    icon="fa-solid fa-list-check"
                                    title="No checklists yet"
                                    description="Build a reusable checklist — packing lists, routines, launch steps — and group its items however you like."
                                    action={
                                        <Button icon="fa-solid fa-plus" onClick={() => setMetaModal('new')}>
                                            New checklist
                                        </Button>
                                    }
                                />
                            </CardBody>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {checklists.map((list) => (
                                <ChecklistCard
                                    key={list._id}
                                    list={list}
                                    onOpen={() => setSelectedId(list._id)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {metaModal && (
                <MetaModal
                    checklist={metaModal === 'new' ? null : metaModal}
                    onClose={() => setMetaModal(null)}
                    onSaved={(c) => {
                        upsert(c)
                        if (metaModal === 'new') setSelectedId(c._id)
                        setMetaModal(null)
                    }}
                />
            )}
        </Container>
    )
}
