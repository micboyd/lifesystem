import { useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import {
    blankItem,
    insertAfter,
    LIST_KIND_META,
    linesToItems,
    listSummary,
    moveItem,
} from '../../lib/listItems'
import type { List, ListItem, ListKind } from '../../types'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const KINDS: ListKind[] = ['checklist', 'bullets', 'numbered']

/**
 * One list, edited in place like a notes app: type to edit, Enter for a new
 * item, Backspace on an empty item to remove it, Alt+↑/↓ to move it, and paste
 * several lines to add them all. Every change goes straight to `onChange`; the
 * page saves in the background.
 */
export default function ListEditor({
    list,
    saveState,
    onChange,
    onDelete,
    onBack,
}: {
    list: List
    saveState: SaveState
    onChange: (next: List) => void
    onDelete: () => void
    onBack?: () => void
}) {
    const inputs = useRef(new Map<string, HTMLInputElement>())
    const addRef = useRef<HTMLInputElement>(null)
    const [showDone, setShowDone] = useState(true)
    const [draft, setDraft] = useState('')
    const [title, setTitle] = useState(list.title)

    // A row to focus once it exists — set by key handlers, applied straight
    // after the render that creates it so fast typing never lands in the old row.
    const pendingFocus = useRef<string | null>(null)
    useLayoutEffect(() => {
        const id = pendingFocus.current
        const el = id ? inputs.current.get(id) : undefined
        if (!el) return
        pendingFocus.current = null
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
    })

    function setFocusId(id: string) {
        const el = inputs.current.get(id)
        if (el) {
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
        } else {
            pendingFocus.current = id
        }
    }

    const items = list.items
    const isChecklist = list.kind === 'checklist'
    const open = isChecklist ? items.filter((i) => !i.done) : items
    const done = isChecklist ? items.filter((i) => i.done) : []
    // Visible order, for arrow-key movement between rows.
    const visible = showDone ? [...open, ...done] : open

    const setItems = (next: ListItem[]) => onChange({ ...list, items: next })
    const patch = (id: string, fields: Partial<ListItem>) =>
        setItems(items.map((i) => (i.id === id ? { ...i, ...fields } : i)))

    function removeItem(id: string, focusNeighbour: boolean) {
        const at = visible.findIndex((i) => i.id === id)
        setItems(items.filter((i) => i.id !== id))
        if (focusNeighbour) {
            const neighbour = visible[at - 1] ?? visible[at + 1]
            if (neighbour) setFocusId(neighbour.id)
            else addRef.current?.focus()
        }
    }

    function onRowKey(e: KeyboardEvent<HTMLInputElement>, item: ListItem) {
        const at = visible.findIndex((i) => i.id === item.id)
        if (e.key === 'Enter') {
            e.preventDefault()
            const fresh = blankItem()
            setItems(insertAfter(items, item.id, fresh))
            setFocusId(fresh.id)
        } else if (e.key === 'Backspace' && item.text === '') {
            e.preventDefault()
            removeItem(item.id, true)
        } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            setItems(moveItem(items, item.id, e.key === 'ArrowUp' ? -1 : 1))
            setFocusId(item.id)
        } else if (e.key === 'ArrowUp' && at > 0) {
            e.preventDefault()
            setFocusId(visible[at - 1].id)
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (at < visible.length - 1) setFocusId(visible[at + 1].id)
            else addRef.current?.focus()
        }
    }

    /** Several pasted lines become several items, starting at this row. */
    function onRowPaste(e: ClipboardEvent<HTMLInputElement>, item: ListItem) {
        const text = e.clipboardData.getData('text')
        if (!text.includes('\n')) return
        e.preventDefault()
        const [first, ...rest] = linesToItems(text)
        if (!first) return
        let next = items.map((i) =>
            i.id === item.id ? { ...i, text: (i.text + ' ' + first.text).trim() } : i
        )
        let after = item.id
        for (const r of rest) {
            next = insertAfter(next, after, r)
            after = r.id
        }
        setItems(next)
        setFocusId(after)
    }

    function addFromDraft() {
        const text = draft.trim()
        if (!text) return
        setItems([...items, blankItem(text)])
        setDraft('')
    }

    function onAddPaste(e: ClipboardEvent<HTMLInputElement>) {
        const text = e.clipboardData.getData('text')
        if (!text.includes('\n')) return
        e.preventDefault()
        setItems([...items, ...linesToItems(text)])
    }

    function commitTitle() {
        const t = title.trim() || 'Untitled list'
        setTitle(t)
        if (t !== list.title) onChange({ ...list, title: t })
    }

    function copyAsText() {
        const lines = items
            .filter((i) => i.text.trim())
            .map((i, n) =>
                list.kind === 'checklist'
                    ? `[${i.done ? 'x' : ' '}] ${i.text}`
                    : list.kind === 'numbered'
                      ? `${n + 1}. ${i.text}`
                      : `- ${i.text}`
            )
        void navigator.clipboard?.writeText(`${list.title}\n\n${lines.join('\n')}`)
    }

    const menu: MenuEntry[] = [
        {
            label: list.pinned ? 'Unpin' : 'Pin to top',
            icon: 'fa-solid fa-thumbtack',
            onClick: () => onChange({ ...list, pinned: !list.pinned }),
        },
        'divider',
        ...KINDS.map((k) => ({
            label: LIST_KIND_META[k].label,
            icon: k === list.kind ? 'fa-solid fa-check' : LIST_KIND_META[k].icon,
            onClick: () => onChange({ ...list, kind: k }),
        })),
        'divider',
        ...(isChecklist && done.length > 0
            ? [
                  {
                      label: 'Clear completed',
                      icon: 'fa-solid fa-broom',
                      onClick: () => setItems(items.filter((i) => !i.done)),
                  },
                  {
                      label: 'Untick all',
                      icon: 'fa-regular fa-square',
                      onClick: () => setItems(items.map((i) => ({ ...i, done: false }))),
                  },
              ]
            : []),
        { label: 'Copy as text', icon: 'fa-regular fa-copy', onClick: copyAsText },
        'divider',
        { label: 'Delete list', icon: 'fa-solid fa-trash', danger: true, onClick: onDelete },
    ]

    const filled = items.filter((i) => i.text.trim())
    const doneCount = filled.filter((i) => i.done).length
    const pct = filled.length ? (doneCount / filled.length) * 100 : 0

    const row = (item: ListItem) => {
        const number = items.indexOf(item) + 1
        return (
            <li key={item.id} className="group flex items-center gap-3 py-1">
                {list.kind === 'checklist' ? (
                    <button
                        type="button"
                        role="checkbox"
                        aria-checked={item.done}
                        aria-label={item.done ? 'Mark as not done' : 'Mark as done'}
                        onClick={() => patch(item.id, { done: !item.done })}
                        className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-[1.5px] transition-colors ${
                            item.done
                                ? 'border-neutral-900 bg-neutral-900 text-white'
                                : 'border-neutral-300 bg-white hover:border-neutral-500'
                        }`}
                    >
                        {item.done && (
                            <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />
                        )}
                    </button>
                ) : list.kind === 'numbered' ? (
                    <span className="w-[22px] shrink-0 text-right text-[15px] text-neutral-400">
                        {number}.
                    </span>
                ) : (
                    <span className="grid w-[22px] shrink-0 place-items-center" aria-hidden="true">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-400" />
                    </span>
                )}

                <input
                    ref={(el) => {
                        if (el) inputs.current.set(item.id, el)
                        else inputs.current.delete(item.id)
                    }}
                    value={item.text}
                    onChange={(e) => patch(item.id, { text: e.target.value })}
                    onKeyDown={(e) => onRowKey(e, item)}
                    onPaste={(e) => onRowPaste(e, item)}
                    placeholder="List item"
                    aria-label="List item"
                    // Inline rows: the caret is the focus cue, not the app-wide ring.
                    style={{ outline: 'none' }}
                    className={`h-9 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-neutral-300 ${
                        isChecklist && item.done ? 'text-neutral-400 line-through' : 'text-neutral-900'
                    }`}
                />

                <button
                    type="button"
                    onClick={() => removeItem(item.id, false)}
                    aria-label="Remove item"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-neutral-300 transition hover:bg-neutral-100 hover:text-neutral-600 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                >
                    <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
                </button>
            </li>
        )
    }

    return (
        <div className="flex flex-col gap-5">
            {/* Title row */}
            <div className="flex items-start gap-2">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="All lists"
                        className="-ml-2 mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 lg:hidden"
                    >
                        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    </button>
                )}
                <div className="min-w-0 flex-1">
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={commitTitle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                commitTitle()
                                ;(items.length
                                    ? inputs.current.get(visible[0]?.id)
                                    : addRef.current
                                )?.focus()
                            }
                        }}
                        aria-label="List name"
                        // Inline rows: the caret is the focus cue, not the app-wide ring.
                        style={{ outline: 'none' }}
                        className="w-full bg-transparent text-[24px] font-semibold leading-tight tracking-[-0.02em] text-neutral-950 sm:text-[26px]"
                    />
                    <p className="mt-1 flex items-center gap-2 text-[13px] text-neutral-500">
                        <i
                            className={`${LIST_KIND_META[list.kind].icon} text-[11px]`}
                            aria-hidden="true"
                        />
                        {listSummary(list.kind, items)}
                        {list.pinned && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span>
                                    <i
                                        className="fa-solid fa-thumbtack mr-1 text-[10px]"
                                        aria-hidden="true"
                                    />
                                    Pinned
                                </span>
                            </>
                        )}
                        <span className="ml-auto text-xs text-neutral-400" aria-live="polite">
                            {saveState === 'saving'
                                ? 'Saving…'
                                : saveState === 'saved'
                                  ? 'Saved'
                                  : saveState === 'error'
                                    ? 'Couldn’t save — will retry'
                                    : ''}
                        </span>
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    size="medium"
                    items={menu}
                    trigger={
                        <span
                            className="grid h-10 w-10 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            aria-label="List options"
                        >
                            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                        </span>
                    }
                />
            </div>

            {isChecklist && filled.length > 0 && (
                <div
                    className="h-1.5 overflow-hidden rounded-full bg-neutral-100"
                    aria-hidden="true"
                >
                    <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}

            {/* Items */}
            <div className="flex flex-col">
                <ul className="flex flex-col">{open.map(row)}</ul>

                {/* Add an item */}
                <div className="flex items-center gap-3 py-1">
                    <span
                        className="grid w-[22px] shrink-0 place-items-center text-neutral-400"
                        aria-hidden="true"
                    >
                        <i className="fa-solid fa-plus text-xs" />
                    </span>
                    <input
                        ref={addRef}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                addFromDraft()
                            } else if (e.key === 'ArrowUp' && open.length > 0 && !draft) {
                                e.preventDefault()
                                setFocusId(open[open.length - 1].id)
                            }
                        }}
                        onBlur={addFromDraft}
                        onPaste={onAddPaste}
                        placeholder="Add an item"
                        aria-label="Add an item"
                        // Inline rows: the caret is the focus cue, not the app-wide ring.
                        style={{ outline: 'none' }}
                        autoFocus={items.length === 0}
                        className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
                    />
                </div>

                {done.length > 0 && (
                    <div className="mt-4 border-t border-neutral-100 pt-3">
                        <button
                            type="button"
                            onClick={() => setShowDone((v) => !v)}
                            aria-expanded={showDone}
                            className="flex h-8 items-center gap-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-900"
                        >
                            <i
                                className={`fa-solid fa-chevron-right text-[10px] transition-transform ${showDone ? 'rotate-90' : ''}`}
                                aria-hidden="true"
                            />
                            Completed · {done.length}
                        </button>
                        {showDone && <ul className="mt-1 flex flex-col">{done.map(row)}</ul>}
                    </div>
                )}
            </div>
        </div>
    )
}
