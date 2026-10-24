import { useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import { LIST_KIND_META } from '../../lib/listItems'
import type { ListKind } from '../../types'

const KINDS: ListKind[] = ['checklist', 'bullets', 'numbered']

/** Name a list and pick how its items look. Everything else happens in the list itself. */
export default function NewListDrawer({
    open,
    saving,
    onClose,
    onCreate,
}: {
    open: boolean
    saving: boolean
    onClose: () => void
    onCreate: (title: string, kind: ListKind) => void
}) {
    const [title, setTitle] = useState('')
    const [kind, setKind] = useState<ListKind>('checklist')

    function submit(e?: FormEvent) {
        e?.preventDefault()
        if (!title.trim() || saving) return
        onCreate(title.trim(), kind)
        setTitle('')
        setKind('checklist')
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="New list"
            size="lg"
            footer={
                <div className="flex w-full justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={() => submit()} disabled={!title.trim() || saving}>
                        Create list
                    </Button>
                </div>
            }
        >
            <form onSubmit={submit} className="flex flex-col gap-6">
                <Input
                    label="Name"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Packing for Skye"
                    autoFocus={open}
                />

                <fieldset className="flex flex-col gap-2">
                    <legend className="mb-2 text-[13px] font-medium text-neutral-700">Type</legend>
                    {KINDS.map((k) => {
                        const meta = LIST_KIND_META[k]
                        const on = kind === k
                        return (
                            <button
                                key={k}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setKind(k)}
                                className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left transition-colors ${
                                    on
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-white ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                                }`}
                            >
                                <span
                                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm ${
                                        on
                                            ? 'bg-white/15 text-white'
                                            : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                    aria-hidden="true"
                                >
                                    <i className={meta.icon} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-semibold">
                                        {meta.label}
                                    </span>
                                    <span
                                        className={`block text-xs ${on ? 'text-white/70' : 'text-neutral-500'}`}
                                    >
                                        {meta.hint}
                                    </span>
                                </span>
                            </button>
                        )
                    })}
                </fieldset>
            </form>
        </Drawer>
    )
}
