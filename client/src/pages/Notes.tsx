import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Container from '../components/Container'
import { Card, CardBody } from '../components/Card'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import Select from '../components/Select'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../context/ToastContext'
import { useInvalidate, useDataVersion } from '../context/DataSyncContext'
import {
    listNotes,
    createNote,
    updateNote,
    deleteNote,
    lockNote,
    revealNote,
    unlockNote,
    resetNoteLock,
    listNoteCategories,
    createNoteCategory,
    updateNoteCategory,
    deleteNoteCategory,
} from '../services/notes'
import PasswordModal from '../components/notes/PasswordModal'
import {
    NOTE_CATEGORY_COLORS,
    NOTE_CATEGORY_COLOR_CLASSES,
    type Note,
    type NoteCategory,
    type NoteCategoryColor,
} from '../types'

/** Sentinels for the category filter rail. */
const ALL = '__all__'
const NONE = '__none__'

function fmtWhen(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Colour swatch picker ──────────────────────────────────────────────────────

function ColorPicker({
    value,
    onChange,
}: {
    value: NoteCategoryColor
    onChange: (c: NoteCategoryColor) => void
}) {
    return (
        <div className="flex flex-wrap gap-2">
            {NOTE_CATEGORY_COLORS.map((c) => {
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
                            NOTE_CATEGORY_COLOR_CLASSES[c].dot,
                            active
                                ? `scale-110 ring-2 ring-offset-2 ${NOTE_CATEGORY_COLOR_CLASSES[c].ring}`
                                : 'hover:scale-105',
                        ].join(' ')}
                    />
                )
            })}
        </div>
    )
}

// ── Note editor modal ─────────────────────────────────────────────────────────

interface NoteModalProps {
    note: Note | null // null = creating
    categories: NoteCategory[]
    /** Category id to pre-select when creating from a filtered view. */
    defaultCategory: string | null
    /** Password captured when a locked note was revealed; reused for save/delete. */
    initialPassword?: string
    onClose: () => void
    onSaved: (n: Note) => void
    onDeleted: (id: string) => void
    /** Ask the page to run the "set a password" flow for this already-saved note. */
    onRequestLock: (noteId: string) => void
    /** Lock removed from inside the editor — update the list without closing. */
    onLockChanged: (n: Note) => void
}

function NoteModal({
    note,
    categories,
    defaultCategory,
    initialPassword,
    onClose,
    onSaved,
    onDeleted,
    onRequestLock,
    onLockChanged,
}: NoteModalProps) {
    const toast = useToast()
    const [title, setTitle] = useState(note?.title ?? '')
    const [body, setBody] = useState(note?.body ?? '')
    const [category, setCategory] = useState<string>(note ? (note.category ?? '') : (defaultCategory ?? ''))
    const [locked, setLocked] = useState(note?.locked ?? false)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [unlocking, setUnlocking] = useState(false)
    // Held only in memory for this editing session, to authorise save/delete/unlock.
    const password = initialPassword ?? ''

    const categoryOptions = [
        { label: 'Uncategorised', value: '' },
        ...categories.map((c) => ({ label: c.name, value: c._id })),
    ]

    /** Save the current fields, sending the password when the note is locked. */
    async function persist(): Promise<Note> {
        const input = {
            title: title.trim(),
            body,
            category: category || null,
            ...(locked ? { password } : {}),
        }
        return note ? updateNote(note._id, input) : createNote(input)
    }

    async function handleSubmit(e?: FormEvent) {
        e?.preventDefault()
        if (!title.trim()) return
        setSaving(true)
        try {
            onSaved(await persist())
        } catch {
            toast.error('Couldn’t save that note.')
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!note) return
        if (!confirm('Delete this note?')) return
        setDeleting(true)
        try {
            await deleteNote(note._id, locked ? password : undefined)
            onDeleted(note._id)
        } catch {
            toast.error('Couldn’t delete that note.')
            setDeleting(false)
        }
    }

    /** Save first (so no edits are lost), then hand off to the page's lock flow. */
    async function handleLock() {
        if (!note || !title.trim()) {
            toast.error('Give the note a title first.')
            return
        }
        setSaving(true)
        try {
            await persist()
            onRequestLock(note._id)
        } catch {
            toast.error('Couldn’t save that note.')
            setSaving(false)
        }
    }

    async function handleRemoveLock() {
        if (!note) return
        setUnlocking(true)
        try {
            const updated = await unlockNote(note._id, password)
            setLocked(false)
            onLockChanged(updated)
            toast.show('Lock removed.', 'success')
        } catch {
            toast.error('Couldn’t remove the lock.')
        } finally {
            setUnlocking(false)
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={note ? 'Edit note' : 'New note'}
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                        {note && (
                            <Button variant="ghost" onClick={handleDelete} disabled={deleting}>
                                {deleting ? 'Deleting…' : 'Delete'}
                            </Button>
                        )}
                        {note &&
                            (locked ? (
                                <Button
                                    variant="ghost"
                                    icon="fa-solid fa-lock-open"
                                    onClick={handleRemoveLock}
                                    disabled={unlocking}
                                >
                                    {unlocking ? 'Removing…' : 'Remove lock'}
                                </Button>
                            ) : (
                                <Button
                                    variant="ghost"
                                    icon="fa-solid fa-lock"
                                    onClick={handleLock}
                                    disabled={saving}
                                >
                                    Lock
                                </Button>
                            ))}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button
                            onClick={() => handleSubmit()}
                            disabled={saving || !title.trim()}
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            }
        >
            {locked && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-500">
                    <i className="fa-solid fa-lock" aria-hidden="true" />
                    Password-protected — this note stays hidden in the list.
                </div>
            )}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                    label="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Note title"
                    autoFocus
                />
                <Textarea
                    label="Note"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    placeholder="Write your note…"
                />
                <Select
                    label="Category"
                    icon="fa-solid fa-tag"
                    options={categoryOptions}
                    value={category}
                    onChange={setCategory}
                    placeholder="Uncategorised"
                />
                {/* Hidden submit so Enter works while focus is in the title field. */}
                <button type="submit" className="hidden" aria-hidden="true" />
            </form>
        </Modal>
    )
}

// ── Category manager modal ────────────────────────────────────────────────────

interface CategoryModalProps {
    categories: NoteCategory[]
    counts: Record<string, number>
    onClose: () => void
    onChanged: (categories: NoteCategory[]) => void
}

function CategoryModal({ categories, counts, onClose, onChanged }: CategoryModalProps) {
    const toast = useToast()
    const [name, setName] = useState('')
    const [color, setColor] = useState<NoteCategoryColor>('neutral')
    const [saving, setSaving] = useState(false)

    async function handleAdd(e: FormEvent) {
        e.preventDefault()
        if (!name.trim()) return
        setSaving(true)
        try {
            const created = await createNoteCategory({ name: name.trim(), color })
            onChanged([...categories, created])
            setName('')
            setColor('neutral')
        } catch {
            toast.error('Couldn’t add that category.')
        } finally {
            setSaving(false)
        }
    }

    async function handleRecolor(cat: NoteCategory, next: NoteCategoryColor) {
        try {
            const updated = await updateNoteCategory(cat._id, { color: next })
            onChanged(categories.map((c) => (c._id === updated._id ? updated : c)))
        } catch {
            toast.error('Couldn’t update that category.')
        }
    }

    async function handleRename(cat: NoteCategory, next: string) {
        const trimmed = next.trim()
        if (!trimmed || trimmed === cat.name) return
        try {
            const updated = await updateNoteCategory(cat._id, { name: trimmed })
            onChanged(categories.map((c) => (c._id === updated._id ? updated : c)))
        } catch {
            toast.error('Couldn’t rename that category.')
        }
    }

    async function handleDelete(cat: NoteCategory) {
        const n = counts[cat._id] ?? 0
        const msg = n > 0
            ? `Delete "${cat.name}"? Its ${n} note${n !== 1 ? 's' : ''} will become uncategorised.`
            : `Delete "${cat.name}"?`
        if (!confirm(msg)) return
        try {
            await deleteNoteCategory(cat._id)
            onChanged(categories.filter((c) => c._id !== cat._id))
        } catch {
            toast.error('Couldn’t delete that category.')
        }
    }

    return (
        <Modal open onClose={onClose} title="Categories" footer={<Button onClick={onClose}>Done</Button>}>
            <div className="flex flex-col gap-5">
                {/* Existing categories */}
                {categories.length === 0 ? (
                    <p className="text-sm text-neutral-400">No categories yet — add one below.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {categories.map((cat) => (
                            <div key={cat._id} className="flex items-center gap-3">
                                <span
                                    className={`h-3 w-3 shrink-0 rounded-full ${NOTE_CATEGORY_COLOR_CLASSES[cat.color].dot}`}
                                />
                                <input
                                    defaultValue={cat.name}
                                    onBlur={(e) => handleRename(cat, e.target.value)}
                                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-neutral-800 hover:border-neutral-200 focus:border-neutral-400 focus:bg-white focus:outline-none"
                                />
                                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                                    {counts[cat._id] ?? 0}
                                </span>
                                <div className="flex shrink-0 gap-1">
                                    {NOTE_CATEGORY_COLORS.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => handleRecolor(cat, c)}
                                            aria-label={`Colour ${c}`}
                                            className={[
                                                'h-4 w-4 rounded-full transition-transform hover:scale-110',
                                                NOTE_CATEGORY_COLOR_CLASSES[c].dot,
                                                c === cat.color ? 'ring-2 ring-neutral-300 ring-offset-1' : '',
                                            ].join(' ')}
                                        />
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(cat)}
                                    aria-label="Delete category"
                                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
                                >
                                    <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add form */}
                <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
                    <Input
                        label="New category"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Ideas, Work, Recipes"
                    />
                    <ColorPicker value={color} onChange={setColor} />
                    <Button type="submit" variant="secondary" icon="fa-solid fa-plus" disabled={saving || !name.trim()}>
                        Add category
                    </Button>
                </form>
            </div>
        </Modal>
    )
}

// ── Note card ─────────────────────────────────────────────────────────────────

function NoteCard({
    note,
    category,
    onOpen,
}: {
    note: Note
    category: NoteCategory | undefined
    onOpen: () => void
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex h-full flex-col rounded-2xl border border-neutral-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-neutral-200 hover:shadow-md"
        >
            <h3 className="flex items-center gap-2 font-bold text-neutral-900 line-clamp-1">
                {note.locked && (
                    <i className="fa-solid fa-lock shrink-0 text-xs text-neutral-400" aria-hidden="true" />
                )}
                <span className="line-clamp-1">{note.title}</span>
            </h3>
            {note.locked ? (
                <p className="mt-2 flex-1 text-sm italic text-neutral-300">Locked — tap to unlock</p>
            ) : note.body.trim() ? (
                <p className="mt-2 flex-1 whitespace-pre-wrap text-sm text-neutral-500 line-clamp-5">
                    {note.body}
                </p>
            ) : (
                <p className="mt-2 flex-1 text-sm italic text-neutral-300">No content</p>
            )}
            <div className="mt-4 flex items-center justify-between gap-2">
                {category ? (
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${NOTE_CATEGORY_COLOR_CLASSES[category.color].soft} ${NOTE_CATEGORY_COLOR_CLASSES[category.color].text}`}
                    >
                        <span className={`h-2 w-2 rounded-full ${NOTE_CATEGORY_COLOR_CLASSES[category.color].dot}`} />
                        {category.name}
                    </span>
                ) : (
                    <span className="text-[11px] font-medium text-neutral-300">Uncategorised</span>
                )}
                <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
                    {fmtWhen(note.updatedAt)}
                </span>
            </div>
        </button>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Notes() {
    const invalidate = useInvalidate()
    const notesVersion = useDataVersion('notes')

    const [notes, setNotes] = useState<Note[]>([])
    const [categories, setCategories] = useState<NoteCategory[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>(ALL)
    const [editing, setEditing] = useState<Note | 'new' | null>(null)
    // Password for the currently-open locked note, held in memory for this session.
    const [editingPassword, setEditingPassword] = useState<string | null>(null)
    // An active password dialog: reveal a locked note, or set a password to lock one.
    const [pwFlow, setPwFlow] = useState<{ note: Note; kind: 'reveal' | 'lock' } | null>(null)
    const [managingCategories, setManagingCategories] = useState(false)
    const toast = useToast()

    useEffect(() => {
        let active = true
        Promise.all([listNotes(), listNoteCategories()])
            .then(([n, c]) => {
                if (!active) return
                setNotes(n)
                setCategories(c)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [notesVersion])

    const categoryById = useMemo(
        () => new Map(categories.map((c) => [c._id, c])),
        [categories]
    )

    // Notes per category id (+ NONE bucket), for the rail counts.
    const counts = useMemo(() => {
        const map: Record<string, number> = {}
        for (const n of notes) map[n.category ?? NONE] = (map[n.category ?? NONE] ?? 0) + 1
        return map
    }, [notes])

    // If the active filter points at a category that no longer exists, reset.
    useEffect(() => {
        if (filter !== ALL && filter !== NONE && !categoryById.has(filter)) setFilter(ALL)
    }, [filter, categoryById])

    const visibleNotes = useMemo(() => {
        if (filter === ALL) return notes
        if (filter === NONE) return notes.filter((n) => !n.category)
        return notes.filter((n) => n.category === filter)
    }, [notes, filter])

    function upsertNote(n: Note) {
        setNotes((prev) => {
            const exists = prev.some((p) => p._id === n._id)
            const next = exists ? prev.map((p) => (p._id === n._id ? n : p)) : [n, ...prev]
            // Keep newest-updated first, matching the server sort.
            return [...next].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        })
        setEditing(null)
        invalidate('notes')
    }

    function removeNote(id: string) {
        setNotes((prev) => prev.filter((p) => p._id !== id))
        setEditing(null)
        invalidate('notes')
    }

    /** Update a note in the list without closing the editor (used by lock changes). */
    function patchNote(n: Note) {
        setNotes((prev) => {
            const next = prev.map((p) => (p._id === n._id ? n : p))
            return [...next].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        })
        invalidate('notes')
    }

    /** A locked card asks for its password first; an open one opens the editor. */
    function openCard(n: Note) {
        if (n.locked) {
            setPwFlow({ note: n, kind: 'reveal' })
        } else {
            setEditingPassword(null)
            setEditing(n)
        }
    }

    /** Editor's Lock button: the note is already saved, now collect a password. */
    function requestLock(noteId: string) {
        const target = notes.find((p) => p._id === noteId)
        if (!target) return
        setEditing(null)
        setEditingPassword(null)
        setPwFlow({ note: target, kind: 'lock' })
    }

    const uncategorisedCount = counts[NONE] ?? 0
    const defaultCategoryForNew =
        filter !== ALL && filter !== NONE ? filter : null

    return (
        <Container as="main" className="py-10">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Notes</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {notes.length} note{notes.length !== 1 ? 's' : ''}
                        {categories.length > 0 && (
                            <> · {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}</>
                        )}
                    </p>
                </div>
                <Button icon="fa-solid fa-plus" onClick={() => setEditing('new')}>
                    New note
                </Button>
            </header>

            {/* Category filter rail */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
                <FilterChip label="All" count={notes.length} active={filter === ALL} onClick={() => setFilter(ALL)} />
                {categories.map((c) => (
                    <FilterChip
                        key={c._id}
                        label={c.name}
                        count={counts[c._id] ?? 0}
                        color={c.color}
                        active={filter === c._id}
                        onClick={() => setFilter(c._id)}
                    />
                ))}
                {uncategorisedCount > 0 && (
                    <FilterChip
                        label="Uncategorised"
                        count={uncategorisedCount}
                        active={filter === NONE}
                        onClick={() => setFilter(NONE)}
                    />
                )}
                <button
                    type="button"
                    onClick={() => setManagingCategories(true)}
                    className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-800"
                >
                    <i className="fa-solid fa-sliders text-[10px]" aria-hidden="true" />
                    Categories
                </button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : notes.length === 0 ? (
                <Card>
                    <CardBody>
                        <EmptyState
                            icon="fa-regular fa-note-sticky"
                            title="No notes yet"
                            description="Capture a thought, idea, or reminder — then file it under a category."
                            action={
                                <Button icon="fa-solid fa-plus" onClick={() => setEditing('new')}>
                                    New note
                                </Button>
                            }
                        />
                    </CardBody>
                </Card>
            ) : visibleNotes.length === 0 ? (
                <EmptyState
                    icon="fa-regular fa-folder-open"
                    title="Nothing here yet"
                    description="No notes in this category."
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visibleNotes.map((n) => (
                        <NoteCard
                            key={n._id}
                            note={n}
                            category={n.category ? categoryById.get(n.category) : undefined}
                            onOpen={() => openCard(n)}
                        />
                    ))}
                </div>
            )}

            {editing && (
                <NoteModal
                    note={editing === 'new' ? null : editing}
                    categories={categories}
                    defaultCategory={editing === 'new' ? defaultCategoryForNew : null}
                    initialPassword={editingPassword ?? undefined}
                    onClose={() => setEditing(null)}
                    onSaved={upsertNote}
                    onDeleted={removeNote}
                    onRequestLock={requestLock}
                    onLockChanged={(n) => {
                        patchNote(n)
                        setEditing(n)
                        setEditingPassword(null)
                    }}
                />
            )}

            {pwFlow?.kind === 'reveal' && (
                <PasswordModal
                    mode="enter"
                    title="Unlock note"
                    submitLabel="Unlock"
                    onSubmit={async (pw) => {
                        const full = await revealNote(pwFlow.note._id, pw)
                        setEditingPassword(pw)
                        setEditing(full)
                        setPwFlow(null)
                    }}
                    onReset={async (accountPassword) => {
                        const updated = await resetNoteLock(pwFlow.note._id, accountPassword)
                        patchNote(updated)
                        setEditingPassword(null)
                        setEditing(updated)
                        setPwFlow(null)
                        toast.show('Lock removed.', 'success')
                    }}
                    onClose={() => setPwFlow(null)}
                />
            )}

            {pwFlow?.kind === 'lock' && (
                <PasswordModal
                    mode="set"
                    title="Lock note"
                    submitLabel="Lock note"
                    onSubmit={async (pw) => {
                        const locked = await lockNote(pwFlow.note._id, pw)
                        patchNote(locked)
                        setPwFlow(null)
                        toast.show('Note locked.', 'success')
                    }}
                    onClose={() => setPwFlow(null)}
                />
            )}

            {managingCategories && (
                <CategoryModal
                    categories={categories}
                    counts={counts}
                    onClose={() => setManagingCategories(false)}
                    onChanged={setCategories}
                />
            )}
        </Container>
    )
}

// ── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({
    label,
    count,
    color,
    active,
    onClick,
}: {
    label: string
    count: number
    color?: NoteCategoryColor
    active: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                active
                    ? 'bg-neutral-950 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
            ].join(' ')}
        >
            {color && (
                <span className={`h-2 w-2 rounded-full ${NOTE_CATEGORY_COLOR_CLASSES[color].dot}`} />
            )}
            {label}
            <span className={active ? 'text-white/60' : 'text-neutral-400'}>{count}</span>
        </button>
    )
}
