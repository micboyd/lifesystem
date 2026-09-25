import { useState } from 'react'
import BottomSheet from '../BottomSheet'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import Modal from '../Modal'
import ConfirmModal from '../ConfirmModal'
import { CATEGORY_LABEL } from './MealPicker'
import { fmt, kcal } from './format'
import { createMeal, deleteMeal, importMeals, updateMeal } from '../../services/meals'
import { MEAL_TYPES, type Meal, type MealInput, type MealType } from '../../types'

/**
 * The meal library, by meal of the day. Each meal is a name and its macros —
 * one serving, as you eat it.
 */
export default function MealLibrary({ meals, onChanged }: { meals: Meal[]; onChanged: () => Promise<void> }) {
    const [editing, setEditing] = useState<Meal | 'new' | null>(null)
    const [importing, setImporting] = useState(false)
    const [search, setSearch] = useState('')

    const q = search.trim().toLowerCase()
    const matching = meals.filter((m) => !q || m.name.toLowerCase().includes(q))
    const uncategorised = matching.filter((m) => m.types.length === 0)

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search meals"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 text-sm focus:border-neutral-900 focus:outline-none sm:max-w-xs"
                />
                <div className="flex gap-2">
                    <Button variant="secondary" icon="fa-solid fa-file-import" onClick={() => setImporting(true)}>
                        Import
                    </Button>
                    <Button icon="fa-solid fa-plus" onClick={() => setEditing('new')}>
                        Add meal
                    </Button>
                </div>
            </div>

            {meals.length === 0 && (
                <p className="rounded-3xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-500">
                    No meals yet. Add one, or import a list.
                </p>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                {MEAL_TYPES.map((type) => {
                    const list = matching.filter((m) => m.types.includes(type))
                    if (list.length === 0 && (q || meals.length === 0)) return null
                    return <Category key={type} title={CATEGORY_LABEL[type]} meals={list} onOpen={setEditing} />
                })}
                {uncategorised.length > 0 && <Category title="Other" meals={uncategorised} onOpen={setEditing} />}
            </div>

            <MealForm
                meal={editing}
                onClose={() => setEditing(null)}
                onSaved={async () => {
                    setEditing(null)
                    await onChanged()
                }}
            />
            <ImportModal open={importing} onClose={() => setImporting(false)} onDone={onChanged} />
        </div>
    )
}

function Category({ title, meals, onOpen }: { title: string; meals: Meal[]; onOpen: (m: Meal) => void }) {
    return (
        <section className="rounded-3xl bg-white p-3 ring-1 ring-black/[0.06] sm:p-4">
            <h3 className="px-1 pb-2 text-sm font-bold tracking-tight text-neutral-900">
                {title} <span className="font-medium text-neutral-400">{meals.length}</span>
            </h3>
            {meals.length === 0 ? (
                <p className="px-1 pb-1 text-sm text-neutral-400">None yet.</p>
            ) : (
                <ul className="flex flex-col">
                    {meals.map((m) => (
                        <li key={m._id}>
                            <button
                                type="button"
                                onClick={() => onOpen(m)}
                                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-neutral-50 active:bg-neutral-100"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-neutral-900">{m.name}</span>
                                    <span className="block text-xs tabular-nums text-neutral-500">
                                        {kcal(m.macros.calories)} kcal · P {fmt(m.macros.protein)} · C {fmt(m.macros.carbs)} · F{' '}
                                        {fmt(m.macros.fat)}
                                    </span>
                                </span>
                                <i className="fa-solid fa-chevron-right text-[10px] text-neutral-300" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

// ── Add / edit ───────────────────────────────────────────────────────────────

type Draft = { name: string; types: MealType[]; calories: string; protein: string; carbs: string; fat: string; notes: string }

const blank: Draft = { name: '', types: [], calories: '', protein: '', carbs: '', fat: '', notes: '' }

function toDraft(m: Meal): Draft {
    return {
        name: m.name,
        types: m.types,
        calories: String(m.macros.calories),
        protein: String(m.macros.protein),
        carbs: String(m.macros.carbs),
        fat: String(m.macros.fat),
        notes: m.notes ?? '',
    }
}

function MealForm({ meal, onClose, onSaved }: { meal: Meal | 'new' | null; onClose: () => void; onSaved: () => Promise<void> }) {
    const [draft, setDraft] = useState<Draft>(blank)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const [loaded, setLoaded] = useState<Meal | 'new' | null>(null)
    if (meal !== loaded) {
        setLoaded(meal)
        if (meal) {
            setDraft(meal === 'new' ? blank : toDraft(meal))
            setError('')
        }
    }

    const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
    const num = (v: string) => Math.max(0, Number(v) || 0)

    async function save() {
        if (!draft.name.trim()) return setError('Give it a name')
        const fields: MealInput = {
            name: draft.name.trim(),
            types: draft.types,
            macros: { calories: num(draft.calories), protein: num(draft.protein), carbs: num(draft.carbs), fat: num(draft.fat) },
            notes: draft.notes.trim() || undefined,
        }
        setBusy(true)
        try {
            if (meal === 'new') await createMeal(fields)
            else if (meal) await updateMeal(meal._id, fields)
            await onSaved()
        } catch {
            setError('Could not save — try again.')
        } finally {
            setBusy(false)
        }
    }

    async function remove() {
        if (!meal || meal === 'new') return
        setBusy(true)
        try {
            await deleteMeal(meal._id)
            await onSaved()
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <BottomSheet
                open={meal !== null}
                onClose={onClose}
                title={meal === 'new' ? 'New meal' : 'Edit meal'}
                footer={
                    <div className="flex gap-2">
                        <Button className="min-h-[48px] flex-1" onClick={save} disabled={busy}>
                            Save
                        </Button>
                        {meal && meal !== 'new' && (
                            <Button
                                variant="ghost"
                                className="min-h-[48px]"
                                icon="fa-solid fa-trash-can"
                                onClick={() => setConfirmDelete(true)}
                                disabled={busy}
                            >
                                Delete
                            </Button>
                        )}
                    </div>
                }
            >
                <div className="flex flex-col gap-4 pt-1">
                    <Input label="Name" value={draft.name} error={error} onChange={(e) => set({ name: e.target.value })} />
                    <div>
                        <p className="mb-1.5 text-sm font-medium text-neutral-700">Meal of the day</p>
                        <div className="flex flex-wrap gap-2">
                            {MEAL_TYPES.map((t) => {
                                const on = draft.types.includes(t)
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => set({ types: on ? draft.types.filter((x) => x !== t) : [...draft.types, t] })}
                                        className={`min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors ${
                                            on ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-600'
                                        }`}
                                    >
                                        {CATEGORY_LABEL[t]}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Input label="Calories" type="text" inputMode="numeric" value={draft.calories} onChange={(e) => set({ calories: e.target.value })} />
                        <Input label="Protein (g)" type="text" inputMode="decimal" value={draft.protein} onChange={(e) => set({ protein: e.target.value })} />
                        <Input label="Carbs (g)" type="text" inputMode="decimal" value={draft.carbs} onChange={(e) => set({ carbs: e.target.value })} />
                        <Input label="Fat (g)" type="text" inputMode="decimal" value={draft.fat} onChange={(e) => set({ fat: e.target.value })} />
                    </div>
                    <Textarea label="Notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
                </div>
            </BottomSheet>
            <ConfirmModal
                open={confirmDelete}
                title="Delete this meal?"
                message="It comes off any days where it's only planned. Days you've already eaten it keep it."
                confirmLabel="Delete"
                danger
                onConfirm={() => void remove()}
                onClose={() => setConfirmDelete(false)}
            />
        </>
    )
}

// ── Import ───────────────────────────────────────────────────────────────────

const EXAMPLE = `[
  { "name": "Scrambled eggs on toast", "types": ["breakfast"],
    "macros": { "calories": 500, "protein": 32, "carbs": 40, "fat": 22 } }
]`

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
    const [text, setText] = useState('')
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)

    async function run() {
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            return setMessage('That isn’t valid JSON.')
        }
        const list = Array.isArray(parsed) ? parsed : (parsed as { meals?: unknown[] })?.meals
        if (!Array.isArray(list)) return setMessage('Expected a list of meals.')
        setBusy(true)
        try {
            const r = await importMeals(list)
            await onDone()
            setText('')
            if (r.skipped) {
                // Stay open so the count is seen; the imported ones are already in.
                setMessage(`Imported ${r.created}; skipped ${r.skipped} without a name.`)
            } else {
                setMessage('')
                onClose()
            }
        } catch {
            setMessage('Import failed — try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Import meals"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={run} disabled={busy || !text.trim()}>
                        Import
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">
                    Paste a JSON list. Each meal needs a name; types are breakfast, lunch, dinner or snack.
                </p>
                <Textarea rows={10} value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
                {message && <p className="text-sm text-red-600">{message}</p>}
            </div>
        </Modal>
    )
}
