import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import ListEditor, { type SaveState } from '../components/lists/ListEditor'
import NewListDrawer from '../components/lists/NewListDrawer'
import { createList, deleteList, listLists, updateList } from '../services/lists'
import { LIST_KIND_META, listSummary } from '../lib/listItems'
import type { List, ListKind } from '../types'

const SAVE_DELAY_MS = 600

/** Pinned first, then most recently changed. */
function sortLists(lists: List[]): List[] {
    return [...lists].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)
    )
}

export default function Lists() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()

    const [lists, setLists] = useState<List[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [creating, setCreating] = useState(false)
    const [savingNew, setSavingNew] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<List | null>(null)
    const [saveState, setSaveState] = useState<Record<string, SaveState>>({})

    // Debounced background saves, one timer and one pending copy per list.
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
    const pending = useRef(new Map<string, List>())

    useEffect(() => {
        let active = true
        listLists()
            .then((data) => active && setLists(sortLists(data)))
            .catch(() => active && setError(true))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [])

    async function flush(listId: string) {
        const list = pending.current.get(listId)
        timers.current.delete(listId)
        if (!list) return
        pending.current.delete(listId)
        setSaveState((s) => ({ ...s, [listId]: 'saving' }))
        try {
            const saved = await updateList(listId, {
                title: list.title,
                kind: list.kind,
                pinned: list.pinned,
                items: list.items,
            })
            // Take only the timestamp back — the local copy may already be newer.
            setLists((all) =>
                all.map((l) => (l._id === listId ? { ...l, updatedAt: saved.updatedAt } : l))
            )
            setSaveState((s) => ({
                ...s,
                [listId]: pending.current.has(listId) ? 'saving' : 'saved',
            }))
        } catch {
            setSaveState((s) => ({ ...s, [listId]: 'error' }))
            // Put it back and try again shortly, unless something newer is queued.
            if (!pending.current.has(listId)) pending.current.set(listId, list)
            timers.current.set(
                listId,
                setTimeout(() => void flush(listId), 5000)
            )
        }
    }

    // Save anything still queued when leaving the page. Fire-and-forget: the
    // page is gone, so there's no state left to update.
    useEffect(() => {
        const t = timers.current
        const p = pending.current
        return () => {
            for (const handle of t.values()) clearTimeout(handle)
            for (const [listId, list] of p) {
                void updateList(listId, {
                    title: list.title,
                    kind: list.kind,
                    pinned: list.pinned,
                    items: list.items,
                })
            }
        }
    }, [])

    function handleChange(next: List) {
        setLists((all) => all.map((l) => (l._id === next._id ? next : l)))
        pending.current.set(next._id, next)
        setSaveState((s) => ({ ...s, [next._id]: 'saving' }))
        const existing = timers.current.get(next._id)
        if (existing) clearTimeout(existing)
        timers.current.set(
            next._id,
            setTimeout(() => void flush(next._id), SAVE_DELAY_MS)
        )
    }

    async function handleCreate(title: string, kind: ListKind) {
        setSavingNew(true)
        try {
            const list = await createList(title, kind)
            setLists((all) => sortLists([list, ...all]))
            setCreating(false)
            navigate(`/lists/${list._id}`)
        } finally {
            setSavingNew(false)
        }
    }

    async function handleDelete(list: List) {
        setConfirmDelete(null)
        const t = timers.current.get(list._id)
        if (t) clearTimeout(t)
        timers.current.delete(list._id)
        pending.current.delete(list._id)
        await deleteList(list._id)
        setLists((all) => all.filter((l) => l._id !== list._id))
        navigate('/lists')
    }

    const active = id ? lists.find((l) => l._id === id) : undefined

    return (
        <Container as="main" className="py-8 sm:py-10">
            <header
                className={`mb-6 flex items-end justify-between gap-4 sm:mb-8 ${active ? 'hidden lg:flex' : ''}`}
            >
                <div>
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                        Lists
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Checklists, bullet lists, anything worth writing down
                    </p>
                </div>
                {lists.length > 0 && (
                    <Button icon="fa-solid fa-plus" onClick={() => setCreating(true)}>
                        New list
                    </Button>
                )}
            </header>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : error ? (
                <Card hover={false}>
                    <EmptyState
                        icon="fa-solid fa-triangle-exclamation"
                        title="Couldn’t load your lists"
                        description="Please try again shortly."
                    />
                </Card>
            ) : lists.length === 0 ? (
                <Card hover={false}>
                    <EmptyState
                        icon="fa-solid fa-list-check"
                        title="No lists yet"
                        description="Make a checklist for packing, a shopping list, ideas, anything."
                        action={
                            <Button icon="fa-solid fa-plus" onClick={() => setCreating(true)}>
                                New list
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
                    {/* Index — the whole page on phones until a list is open. */}
                    <Card
                        hover={false}
                        flush
                        className={`overflow-hidden lg:sticky lg:top-6 ${active ? 'hidden lg:block' : ''}`}
                    >
                        <ul className="divide-y divide-neutral-100">
                            {lists.map((l) => {
                                const meta = LIST_KIND_META[l.kind]
                                const on = l._id === id
                                return (
                                    <li key={l._id}>
                                        <Link
                                            to={`/lists/${l._id}`}
                                            aria-current={on ? 'page' : undefined}
                                            className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
                                                on ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                                            }`}
                                        >
                                            <span
                                                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-sm text-neutral-600"
                                                aria-hidden="true"
                                            >
                                                <i className={meta.icon} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold text-neutral-900">
                                                    {l.title}
                                                </span>
                                                <span className="block truncate text-xs text-neutral-500">
                                                    {listSummary(l.kind, l.items)}
                                                </span>
                                            </span>
                                            {l.pinned && (
                                                <i
                                                    className="fa-solid fa-thumbtack text-[11px] text-neutral-400"
                                                    aria-label="Pinned"
                                                />
                                            )}
                                        </Link>
                                    </li>
                                )
                            })}
                        </ul>
                    </Card>

                    {/* The open list */}
                    {active ? (
                        <Card hover={false} className="min-h-[18rem]">
                            <ListEditor
                                key={active._id}
                                list={active}
                                saveState={saveState[active._id] ?? 'idle'}
                                onChange={handleChange}
                                onDelete={() => setConfirmDelete(active)}
                                onBack={() => navigate('/lists')}
                            />
                        </Card>
                    ) : (
                        <div className="hidden min-h-[18rem] place-items-center rounded-3xl border border-dashed border-neutral-200 lg:grid">
                            <p className="text-sm text-neutral-500">
                                {id
                                    ? 'That list doesn’t exist any more.'
                                    : 'Pick a list, or start a new one.'}
                            </p>
                        </div>
                    )}
                </div>
            )}

            <NewListDrawer
                open={creating}
                saving={savingNew}
                onClose={() => setCreating(false)}
                onCreate={handleCreate}
            />

            <ConfirmModal
                open={!!confirmDelete}
                title="Delete this list?"
                message={
                    <>
                        <strong>{confirmDelete?.title}</strong> and its{' '}
                        {confirmDelete?.items.length ?? 0} items will be gone for good.
                    </>
                }
                confirmLabel="Delete list"
                danger
                onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
                onClose={() => setConfirmDelete(null)}
            />
        </Container>
    )
}
