import { useMemo, useState, type ReactNode } from 'react'
import { Card } from '../Card'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import EmptyState from '../EmptyState'
import DropdownMenu from '../DropdownMenu'
import LineIcon from '../LineIcon'
import ConfirmModal from '../ConfirmModal'
import Checkbox from '../Checkbox'
import DatePicker from '../DatePicker'
import LibraryToolbar from '../LibraryToolbar'
import { StatStrip, NoteBlock } from '../session/SessionUI'
import { FIELD_LABEL } from '../fieldStyles'
import { MacroBar, MacroLegend, caloriesFromMacros } from './mealUi'
import { fmt, kcal } from './format'
import { gramsLeft, per100FromCook, rawTotal } from '../../lib/plates'
import { todayKey } from '../../lib/calendar'
import {
    cookBox,
    createPlateFood,
    deleteCook,
    deletePlateFood,
    setCookFinished,
    updatePlateFood,
} from '../../services/plateFoods'
import type { BoxCook, Ingredient, Macros, PlateFood, PlateFoodInput, PlateFoodKind } from '../../types'

/**
 * Boxes and plain foods — what gets weighed onto a plate.
 *
 * A box is something cooked in a batch (a tray of chicken and veg): its raw
 * ingredients live here, "Cooked a box" logs a batch with its cooked weight,
 * and that gives the macros per 100 g every plate draws on. A plain food —
 * cooked rice — just has fixed macros per 100 g.
 */

/** "Thu 16 Oct". */
export function shortDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })
}

/** "172 kcal · 27.5 g protein per 100 g". */
function per100Line(m: Macros): string {
    return `${kcal(m.calories)} kcal · ${fmt(m.protein)} g protein per 100 g`
}

type Drawered =
    | { mode: 'view'; food: PlateFood }
    | { mode: 'form'; kind: PlateFoodKind; food?: PlateFood }
    | { mode: 'cook'; food: PlateFood }
    | null

export default function BoxLibrary({ foods, onChanged }: { foods: PlateFood[]; onChanged: () => Promise<void> }) {
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [deleting, setDeleting] = useState<PlateFood | null>(null)
    const [search, setSearch] = useState('')

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
    }, [foods, search])
    const boxes = filtered.filter((f) => f.kind === 'box')
    const plain = filtered.filter((f) => f.kind === 'plain')

    // Drawers show the latest copy after a reload.
    const fresh = (f: PlateFood) => foods.find((x) => x._id === f._id) ?? f
    const viewing = drawer?.mode === 'view' ? fresh(drawer.food) : null

    async function handleDelete(food: PlateFood) {
        setDrawer(null)
        await deletePlateFood(food._id)
        await onChanged()
    }

    return (
        <>
            <LibraryToolbar
                search={search}
                onSearch={setSearch}
                placeholder="Search boxes and foods…"
                count={foods.length ? filtered.length : undefined}
                noun="food"
                newLabel="New box"
                onNew={() => setDrawer({ mode: 'form', kind: 'box' })}
                menu={
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-plus"
                        onClick={() => setDrawer({ mode: 'form', kind: 'plain' })}
                    >
                        Food
                    </Button>
                }
            />

            <div className="mt-6 flex flex-col gap-8">
                {foods.length === 0 ? (
                    <EmptyState
                        icon="fa-solid fa-box"
                        title="No boxes or foods yet"
                        description="Add a box for anything you cook in a batch, and a food (like rice) for anything with fixed macros per 100 g."
                        action={
                            <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'form', kind: 'box' })}>
                                New box
                            </Button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon="fa-solid fa-magnifying-glass"
                        title="No matches"
                        description={`Nothing matches “${search.trim()}”.`}
                    />
                ) : (
                    <>
                        {boxes.length > 0 && (
                            <Section title="Boxes" hint="Cooked in a batch — log each cook with its cooked weight.">
                                {boxes.map((f) => (
                                    <BoxCard
                                        key={f._id}
                                        food={f}
                                        onOpen={() => setDrawer({ mode: 'view', food: f })}
                                        onCook={() => setDrawer({ mode: 'cook', food: f })}
                                        onEdit={() => setDrawer({ mode: 'form', kind: 'box', food: f })}
                                        onDelete={() => setDeleting(f)}
                                    />
                                ))}
                            </Section>
                        )}
                        {plain.length > 0 && (
                            <Section title="Foods" hint="Fixed macros per 100 g, like cooked rice.">
                                {plain.map((f) => (
                                    <PlainCard
                                        key={f._id}
                                        food={f}
                                        onOpen={() => setDrawer({ mode: 'form', kind: 'plain', food: f })}
                                        onDelete={() => setDeleting(f)}
                                    />
                                ))}
                            </Section>
                        )}
                    </>
                )}
            </div>

            <BoxViewDrawer
                food={viewing}
                onClose={() => setDrawer(null)}
                onCook={(f) => setDrawer({ mode: 'cook', food: f })}
                onEdit={(f) => setDrawer({ mode: 'form', kind: 'box', food: f })}
                onDelete={setDeleting}
                onChanged={onChanged}
            />

            <FoodFormDrawer
                form={drawer?.mode === 'form' ? drawer : null}
                onClose={() => setDrawer(null)}
                onSaved={onChanged}
            />

            <CookDrawer
                food={drawer?.mode === 'cook' ? fresh(drawer.food) : null}
                onClose={() => setDrawer(null)}
                onSaved={onChanged}
            />

            <ConfirmModal
                open={!!deleting}
                title={`Delete this ${deleting?.kind === 'box' ? 'box' : 'food'}?`}
                message={
                    <>
                        Delete <span className="font-semibold">{deleting?.name}</span>
                        {deleting?.kind === 'box' && ' and every cook of it'}? It comes off plates that are only
                        planned. Plates you’ve already eaten keep their numbers.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={() => {
                    if (deleting) void handleDelete(deleting)
                    setDeleting(null)
                }}
                onClose={() => setDeleting(null)}
            />
        </>
    )
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <div>
                <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">{title}</h3>
                <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
        </section>
    )
}

// ─── Cards ──────────────────────────────────────────────────────────────────────

/** Where a box stands: the batch plates draw from, and how much of it is left. */
function batchLine(food: PlateFood): { text: string; tone: 'live' | 'idle' } {
    const open = food.open[0]
    if (open) {
        return {
            text: `Cooked ${shortDate(open.date)} · ~${gramsLeft(open.cookedGrams, open.eatenGrams)} g left`,
            tone: 'live',
        }
    }
    if (food.last) return { text: `Last cooked ${shortDate(food.last.date)} · finished`, tone: 'idle' }
    return { text: 'Not cooked yet', tone: 'idle' }
}

function CardMenu({ items }: { items: { label: string; icon: string; danger?: boolean; onClick: () => void }[] }) {
    return (
        <DropdownMenu
            align="right"
            className="relative z-20 -mr-1 -mt-1 shrink-0"
            trigger={
                <span
                    aria-label="Actions"
                    className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                    <LineIcon name="more" className="h-4 w-4" />
                </span>
            }
            items={items}
        />
    )
}

function BoxCard({
    food,
    onOpen,
    onCook,
    onEdit,
    onDelete,
}: {
    food: PlateFood
    onOpen: () => void
    onCook: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const current = food.open[0] ?? food.last
    const status = batchLine(food)
    return (
        <Card as="div" className="relative flex flex-col gap-4">
            <button
                type="button"
                aria-label={`View ${food.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />
            <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                    <i className="fa-solid fa-box text-sm" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">{food.name}</p>
                    <p
                        className={`mt-0.5 flex items-center gap-1.5 text-xs ${
                            status.tone === 'live' ? 'text-emerald-700' : 'text-neutral-500'
                        }`}
                    >
                        {status.tone === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        {status.text}
                        {food.open.length > 1 && ` · +${food.open.length - 1} open`}
                    </p>
                </div>
                <CardMenu
                    items={[
                        { label: 'Edit box', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            {current && (
                <p className="text-sm tabular-nums text-neutral-600">
                    <span className="font-semibold text-neutral-900">{kcal(current.per100.calories)} kcal</span> ·{' '}
                    {fmt(current.per100.protein)} P · {fmt(current.per100.carbs)} C · {fmt(current.per100.fat)} F
                    <span className="text-neutral-400"> per 100 g</span>
                </p>
            )}

            <div className="relative z-20 mt-auto">
                <Button icon="fa-solid fa-fire-burner" onClick={onCook} className="w-full justify-center">
                    Cooked a box
                </Button>
            </div>
        </Card>
    )
}

function PlainCard({ food, onOpen, onDelete }: { food: PlateFood; onOpen: () => void; onDelete: () => void }) {
    const m = food.per100 ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`Edit ${food.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{food.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-neutral-500">{per100Line(m)}</p>
                </div>
                <CardMenu
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onOpen },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>
            <div className="mt-auto flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <MacroBar macros={m} />
                <MacroLegend macros={m} compact />
            </div>
        </Card>
    )
}

// ─── Box view ───────────────────────────────────────────────────────────────────

function BoxViewDrawer({
    food,
    onClose,
    onCook,
    onEdit,
    onDelete,
    onChanged,
}: {
    food: PlateFood | null
    onClose: () => void
    onCook: (f: PlateFood) => void
    onEdit: (f: PlateFood) => void
    onDelete: (f: PlateFood) => void
    onChanged: () => Promise<void>
}) {
    // Keep the last box on screen while the drawer animates closed.
    const [view, setView] = useState<PlateFood | null>(food)
    if (food && food !== view) setView(food)
    const [busy, setBusy] = useState(false)

    async function run(fn: () => Promise<void>) {
        setBusy(true)
        try {
            await fn()
            await onChanged()
        } finally {
            setBusy(false)
        }
    }

    const f = view
    const raw = f ? rawTotal(f.ingredients) : null
    return (
        <Drawer
            open={!!food}
            onClose={onClose}
            size="xl"
            title={f?.name ?? 'Box'}
            footer={
                f && (
                    <div className="flex w-full flex-wrap items-center justify-end gap-3">
                        <Button variant="ghost" icon="fa-solid fa-trash-can" className="mr-auto" onClick={() => onDelete(f)}>
                            Delete
                        </Button>
                        <Button variant="secondary" icon="fa-solid fa-pen" onClick={() => onEdit(f)}>
                            Edit
                        </Button>
                        <Button icon="fa-solid fa-fire-burner" onClick={() => onCook(f)}>
                            Cooked a box
                        </Button>
                    </div>
                )
            }
        >
            {f && raw && (
                <div className="flex flex-col gap-7">
                    <section className="flex flex-col gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Open batches</p>
                        {f.open.length === 0 ? (
                            <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                                {f.last
                                    ? `Nothing open — last cooked ${shortDate(f.last.date)}. Plates use that batch until you cook again.`
                                    : 'Not cooked yet. Log a cook to start using it on plates.'}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {f.open.map((c, i) => (
                                    <BatchRow
                                        key={c._id}
                                        cook={c}
                                        current={i === 0}
                                        busy={busy}
                                        onFinish={() => run(() => setCookFinished(c._id, true))}
                                        onDelete={() => run(() => deleteCook(c._id))}
                                    />
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="flex flex-col gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                            Raw ingredients · one batch
                        </p>
                        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                            {f.ingredients.map((i, n) => (
                                <li key={n} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                    <span className="min-w-0 truncate text-neutral-800">{i.name}</span>
                                    <span className="shrink-0 tabular-nums text-neutral-500">{fmt(i.grams)} g</span>
                                </li>
                            ))}
                        </ul>
                        <StatStrip
                            stats={[
                                { icon: 'fa-solid fa-fire', label: 'Calories', value: `${kcal(raw.calories)} kcal` },
                                { icon: 'fa-solid fa-drumstick-bite', label: 'Protein', value: `${fmt(raw.protein)} g` },
                                { icon: 'fa-solid fa-wheat-awn', label: 'Carbs', value: `${fmt(raw.carbs)} g` },
                                { icon: 'fa-solid fa-droplet', label: 'Fat', value: `${fmt(raw.fat)} g` },
                            ]}
                        />
                    </section>

                    {f.notes && (
                        <NoteBlock icon="fa-regular fa-note-sticky" title="Notes">
                            {f.notes}
                        </NoteBlock>
                    )}
                </div>
            )}
        </Drawer>
    )
}

function BatchRow({
    cook,
    current,
    busy,
    onFinish,
    onDelete,
}: {
    cook: BoxCook
    current: boolean
    busy: boolean
    onFinish: () => void
    onDelete: () => void
}) {
    const left = gramsLeft(cook.cookedGrams, cook.eatenGrams)
    const pct = cook.cookedGrams > 0 ? Math.min(100, (left / cook.cookedGrams) * 100) : 0
    return (
        <li className="flex flex-col gap-2.5 rounded-2xl bg-neutral-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                        Cooked {shortDate(cook.date)}
                        {current && (
                            <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                In use
                            </span>
                        )}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-neutral-500">{per100Line(cook.per100)}</p>
                </div>
                <CardMenu
                    items={[
                        { label: 'Finished', icon: 'fa-solid fa-check', onClick: onFinish },
                        { label: 'Delete cook', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs tabular-nums text-neutral-500">
                <span>
                    ~{left} g left of {fmt(cook.cookedGrams)} g
                </span>
                <button
                    type="button"
                    disabled={busy}
                    onClick={onFinish}
                    className="font-semibold text-neutral-700 transition-colors hover:text-neutral-900 disabled:opacity-60"
                >
                    Mark finished
                </button>
            </div>
        </li>
    )
}

// ─── Add / edit a box or food ───────────────────────────────────────────────────

type IngredientDraft = { name: string; grams: string; calories: string; protein: string; carbs: string; fat: string }

const num = (v: string) => Math.max(0, Number(v) || 0)
const str = (n: number | undefined) => (n ? String(n) : '')
const blankIngredient = (): IngredientDraft => ({ name: '', grams: '', calories: '', protein: '', carbs: '', fat: '' })

function toDraft(i: Ingredient): IngredientDraft {
    return {
        name: i.name,
        grams: str(i.grams),
        calories: str(i.per100.calories),
        protein: str(i.per100.protein),
        carbs: str(i.per100.carbs),
        fat: str(i.per100.fat),
    }
}

function fromDraft(d: IngredientDraft): Ingredient {
    return {
        name: d.name.trim(),
        grams: num(d.grams),
        per100: { calories: num(d.calories), protein: num(d.protein), carbs: num(d.carbs), fat: num(d.fat) },
    }
}

type FormTarget = { kind: PlateFoodKind; food?: PlateFood }

function FoodFormDrawer({
    form,
    onClose,
    onSaved,
}: {
    form: FormTarget | null
    onClose: () => void
    onSaved: () => Promise<void>
}) {
    const [view, setView] = useState<FormTarget | null>(form)
    const [name, setName] = useState('')
    const [notes, setNotes] = useState('')
    const [rows, setRows] = useState<IngredientDraft[]>([])
    const [per100, setPer100] = useState({ calories: '', protein: '', carbs: '', fat: '' })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // A different box or food opened: start the fields from it.
    if (form && form !== view) {
        setView(form)
        const f = form.food
        setName(f?.name ?? '')
        setNotes(f?.notes ?? '')
        setRows(f?.ingredients.length ? f.ingredients.map(toDraft) : [blankIngredient()])
        setPer100({
            calories: str(f?.per100?.calories),
            protein: str(f?.per100?.protein),
            carbs: str(f?.per100?.carbs),
            fat: str(f?.per100?.fat),
        })
        setSaving(false)
        setError('')
    }

    const isBox = view?.kind === 'box'
    const ingredients = rows.filter((r) => r.name.trim()).map(fromDraft)
    const raw = rawTotal(ingredients)
    const plainMacros: Macros = {
        calories: num(per100.calories),
        protein: num(per100.protein),
        carbs: num(per100.carbs),
        fat: num(per100.fat),
    }
    const implied = caloriesFromMacros(plainMacros)
    const valid = name.trim() !== '' && (!isBox || ingredients.length > 0)

    function patchRow(i: number, patch: Partial<IngredientDraft>) {
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    }

    async function submit() {
        if (!view || !valid) return
        const fields: PlateFoodInput = {
            kind: view.kind,
            name: name.trim(),
            ingredients: isBox ? ingredients : [],
            per100: isBox ? undefined : plainMacros,
            notes: notes.trim() || undefined,
        }
        setSaving(true)
        setError('')
        try {
            if (view.food) await updatePlateFood(view.food._id, fields)
            else await createPlateFood(fields)
            await onSaved()
            onClose()
        } catch {
            setError('Could not save — try again.')
        } finally {
            setSaving(false)
        }
    }

    const noun = isBox ? 'box' : 'food'
    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={view?.food ? `Edit ${noun}` : `New ${noun}`}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : view?.food ? 'Save' : 'Add'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-6">
                <Input
                    label={isBox ? 'Box name *' : 'Food name *'}
                    autoFocus
                    placeholder={isBox ? 'e.g. Chicken & veg box' : 'e.g. Rice (cooked)'}
                    value={name}
                    error={error || undefined}
                    onChange={(e) => setName(e.target.value)}
                />

                {isBox ? (
                    <div className="flex flex-col gap-3">
                        <div>
                            <p className={FIELD_LABEL}>Raw ingredients for one batch</p>
                            <p className="mt-0.5 text-xs text-neutral-500">
                                Grams as they go in, and the macros per 100 g off the packet. You can change the grams
                                each time you cook.
                            </p>
                        </div>
                        {rows.map((r, i) => (
                            <div key={i} className="flex flex-col gap-3 rounded-2xl bg-neutral-50 p-3">
                                <div className="flex items-end gap-2">
                                    <div className="min-w-0 flex-1">
                                        <Input
                                            aria-label="Ingredient"
                                            placeholder="Ingredient, e.g. Chicken thigh"
                                            value={r.name}
                                            onChange={(e) => patchRow(i, { name: e.target.value })}
                                        />
                                    </div>
                                    <div className="w-24 shrink-0">
                                        <NumberField label="Grams" value={r.grams} onChange={(v) => patchRow(i, { grams: v })} />
                                    </div>
                                    {rows.length > 1 && (
                                        <button
                                            type="button"
                                            aria-label="Remove ingredient"
                                            onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                                            className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-white hover:text-neutral-700"
                                        >
                                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    <NumberField label="kcal" value={r.calories} onChange={(v) => patchRow(i, { calories: v })} />
                                    <NumberField label="Protein" value={r.protein} onChange={(v) => patchRow(i, { protein: v })} />
                                    <NumberField label="Carbs" value={r.carbs} onChange={(v) => patchRow(i, { carbs: v })} />
                                    <NumberField label="Fat" value={r.fat} onChange={(v) => patchRow(i, { fat: v })} />
                                </div>
                                <p className="-mt-1 text-[11px] text-neutral-400">per 100 g</p>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => setRows((prev) => [...prev, blankIngredient()])}
                            className="inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] px-3 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                        >
                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                            Add ingredient
                        </button>
                        <TotalPanel label="Whole batch, raw" macros={raw} />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <p className={FIELD_LABEL}>Per 100 g</p>
                        <div className="grid grid-cols-2 gap-3">
                            <NumberField label="Protein (g)" value={per100.protein} onChange={(v) => setPer100((p) => ({ ...p, protein: v }))} />
                            <NumberField label="Carbs (g)" value={per100.carbs} onChange={(v) => setPer100((p) => ({ ...p, carbs: v }))} />
                            <NumberField label="Fat (g)" value={per100.fat} onChange={(v) => setPer100((p) => ({ ...p, fat: v }))} />
                            <NumberField label="Calories" value={per100.calories} onChange={(v) => setPer100((p) => ({ ...p, calories: v }))} />
                        </div>
                        {implied > 0 && plainMacros.calories === 0 && (
                            <button
                                type="button"
                                onClick={() => setPer100((p) => ({ ...p, calories: String(implied) }))}
                                className="inline-flex items-center gap-1.5 self-start rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
                            >
                                <i className="fa-solid fa-wand-magic-sparkles text-[11px]" aria-hidden="true" />
                                Macros add up to {kcal(implied)} kcal — use that
                            </button>
                        )}
                    </div>
                )}

                <Textarea label="Notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
        </Drawer>
    )
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <Input
            label={label}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="text-center tabular-nums"
        />
    )
}

function TotalPanel({ label, macros }: { label: string; macros: Macros }) {
    return (
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">{label}</span>
                <span className="text-base font-semibold tabular-nums text-neutral-900">{kcal(macros.calories)} kcal</span>
            </div>
            <MacroBar macros={macros} />
            <MacroLegend macros={macros} compact />
        </div>
    )
}

// ─── Cooked a box ───────────────────────────────────────────────────────────────

/**
 * Log a cook: the box's ingredients come in pre-filled (change any grams that
 * were different today), then the cooked weight turns the raw total into
 * macros per 100 g. Earlier batches can be marked finished in the same go.
 */
function CookDrawer({
    food,
    onClose,
    onSaved,
}: {
    food: PlateFood | null
    onClose: () => void
    onSaved: () => Promise<void>
}) {
    const [view, setView] = useState<PlateFood | null>(food)
    const [openedFor, setOpenedFor] = useState<string | null>(null)
    const [date, setDate] = useState(todayKey())
    const [grams, setGrams] = useState<string[]>([])
    const [cooked, setCooked] = useState('')
    const [finishOpen, setFinishOpen] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    if (food && food !== view) setView(food)
    // Opened on a box: start from its ingredients. (A reload of the same box
    // while open keeps what's been typed.)
    if (food && food._id !== openedFor) {
        setOpenedFor(food._id)
        setDate(todayKey())
        setGrams(food.ingredients.map((i) => str(i.grams)))
        setCooked('')
        setFinishOpen(true)
        setSaving(false)
        setError('')
    }
    if (!food && openedFor) setOpenedFor(null)

    const f = view
    const ingredients: Ingredient[] = (f?.ingredients ?? []).map((i, n) => ({ ...i, grams: num(grams[n] ?? '') }))
    const raw = rawTotal(ingredients)
    const cookedGrams = num(cooked)
    const per100 = per100FromCook(raw, cookedGrams)
    const valid = cookedGrams > 0 && ingredients.some((i) => i.grams > 0)

    async function submit() {
        if (!f || !valid) return
        setSaving(true)
        setError('')
        try {
            await cookBox({ food: f._id, date, ingredients, cookedGrams, finishOpen: finishOpen && f.open.length > 0 })
            await onSaved()
            onClose()
        } catch {
            setError('Could not save the cook — try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!food}
            onClose={onClose}
            size="xl"
            title="Cooked a box"
            badge={f?.name}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button icon="fa-solid fa-check" onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : 'Save cook'}
                    </Button>
                </>
            }
        >
            {f && (
                <div className="flex flex-col gap-7">
                    <section className="flex flex-col gap-3">
                        <div>
                            <p className={FIELD_LABEL}>1 · What went in (raw)</p>
                            <p className="mt-0.5 text-xs text-neutral-500">Change anything that was different today.</p>
                        </div>
                        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                            {f.ingredients.map((i, n) => (
                                <li key={n} className="flex items-center gap-3 px-4 py-2">
                                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{i.name}</span>
                                    <div className="flex w-28 shrink-0 items-center gap-1.5">
                                        <Input
                                            aria-label={`${i.name} grams`}
                                            type="number"
                                            min={0}
                                            step="any"
                                            inputMode="decimal"
                                            value={grams[n] ?? ''}
                                            onChange={(e) =>
                                                setGrams((prev) => prev.map((g, j) => (j === n ? e.target.value : g)))
                                            }
                                            className="text-right tabular-nums"
                                        />
                                        <span className="text-sm text-neutral-500">g</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <p className="px-1 text-xs tabular-nums text-neutral-500">
                            Raw total: <span className="font-semibold text-neutral-800">{kcal(raw.calories)} kcal</span> ·{' '}
                            {fmt(raw.protein)} P · {fmt(raw.carbs)} C · {fmt(raw.fat)} F
                        </p>
                    </section>

                    <section className="flex flex-col gap-3">
                        <p className={FIELD_LABEL}>2 · Cooked weight</p>
                        <div className="flex items-center gap-2">
                            <Input
                                aria-label="Cooked weight in grams"
                                type="number"
                                min={0}
                                step="any"
                                inputMode="decimal"
                                placeholder="Weigh everything once cooked"
                                value={cooked}
                                error={error || undefined}
                                onChange={(e) => setCooked(e.target.value)}
                                className="text-lg font-semibold tabular-nums"
                            />
                            <span className="text-sm text-neutral-500">g</span>
                        </div>
                    </section>

                    <TotalPanel label="Per 100 g cooked" macros={per100} />

                    <section className="flex flex-col gap-3">
                        <p className={FIELD_LABEL}>Date cooked</p>
                        <DatePicker
                            value={date}
                            maxDate={todayKey()}
                            onChange={(v) => setDate(typeof v === 'string' ? v : todayKey())}
                        />
                    </section>

                    {f.open.length > 0 && (
                        <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                            <Checkbox
                                checked={finishOpen}
                                onChange={setFinishOpen}
                                label={`Finished the last ${f.name.toLowerCase()} (cooked ${shortDate(f.open[0].date)})`}
                            />
                            {!finishOpen && (
                                <p className="mt-1.5 pl-7 text-xs text-neutral-500">
                                    Both stay open — you’ll pick which one when you plate up.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Drawer>
    )
}
