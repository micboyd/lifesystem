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
import JsonImportPanel from '../JsonImportPanel'
import { StatStrip, NoteBlock } from '../session/SessionUI'
import { FIELD_LABEL } from '../fieldStyles'
import { MacroBar, MacroLegend, caloriesFromMacros } from './mealUi'
import { fmt, kcal } from './format'
import { gramsLeft, per100FromCook, rawTotal } from '../../lib/plates'
import { todayKey } from '../../lib/calendar'
import {
    cookBox,
    createPlateFood,
    deletePlateFood,
    importTrays,
    updatePlateFood,
} from '../../services/plateFoods'
import type { Ingredient, Macros, PlateFood, PlateFoodInput, PlateFoodKind } from '../../types'

/**
 * Boxes and plain foods — what gets weighed onto a plate.
 *
 * A box is something cooked in a batch (a tray of chicken and veg): its raw
 * ingredients (the recipe) live here. Each cook of it — a batch with its cooked
 * weight and so its macros per 100 g — lives in the Pantry, and plates draw
 * only from those. A plain food —
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
export function per100Line(m: Macros): string {
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
    const [importing, setImporting] = useState(false)
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

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import trays"
                description="Paste one or many trays — what goes in raw, with each packet's macros per 100 g. Add the cooked weight and the tray is ready to plate straight away."
                template={TRAY_TEMPLATE}
                notes={<TrayImportNotes />}
                itemNoun="tray"
                onBack={() => setImporting(false)}
                doImport={importTrays}
                resource="plate-foods"
                existingItems={foods.filter((f) => f.kind === 'box')}
                onLibraryChanged={() => void onChanged()}
                onImported={async () => {
                    await onChanged()
                    setImporting(false)
                }}
            />
        )
    }

    return (
        <>
            <LibraryToolbar
                search={search}
                onSearch={setSearch}
                placeholder="Search boxes and foods…"
                count={foods.length ? filtered.length : undefined}
                noun="food"
                onImport={() => setImporting(true)}
                newLabel="New box"
                onNew={() => setDrawer({ mode: 'form', kind: 'box' })}
                menu={
                    <DropdownMenu
                        align="right"
                        trigger={
                            <span
                                aria-label="More library actions"
                                className="grid h-11 w-10 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <LineIcon name="more" className="h-4 w-4" />
                            </span>
                        }
                        items={[
                            {
                                label: 'New food (fixed per 100 g)',
                                icon: 'fa-solid fa-plus',
                                onClick: () => setDrawer({ mode: 'form', kind: 'plain' }),
                            },
                        ]}
                    />
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
                            <Section title="Boxes" hint="Recipes you batch-cook. Each cook goes into the Pantry, ready to plate.">
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

/** Whether a box has cooked batches in the pantry, and roughly how much. */
function pantryLine(food: PlateFood): { text: string; live: boolean } {
    if (food.open.length === 0) return { text: 'Not in the pantry', live: false }
    const left = food.open.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
    const batches = food.open.length > 1 ? ` · ${food.open.length} batches` : ''
    return { text: `In the pantry · ~${fmt(left)} g left${batches}`, live: true }
}

export function CardMenu({ items }: { items: { label: string; icon: string; danger?: boolean; onClick: () => void }[] }) {
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
    const status = pantryLine(food)
    const raw = rawTotal(food.ingredients)
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
                            status.live ? 'text-emerald-700' : 'text-neutral-500'
                        }`}
                    >
                        {status.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                        {status.text}
                    </p>
                </div>
                <CardMenu
                    items={[
                        { label: 'Edit box', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            <p className="text-sm tabular-nums text-neutral-600">
                {food.ingredients.length} ingredient{food.ingredients.length === 1 ? '' : 's'} ·{' '}
                <span className="font-semibold text-neutral-900">{kcal(raw.calories)} kcal</span> ·{' '}
                {fmt(raw.protein)} g protein
                <span className="text-neutral-400"> per batch</span>
            </p>

            <div className="relative z-20 mt-auto">
                <Button
                    variant="secondary"
                    icon="fa-solid fa-fire-burner"
                    onClick={onCook}
                    className="w-full justify-center"
                >
                    Cooked it
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
}: {
    food: PlateFood | null
    onClose: () => void
    onCook: (f: PlateFood) => void
    onEdit: (f: PlateFood) => void
    onDelete: (f: PlateFood) => void
}) {
    // Keep the last box on screen while the drawer animates closed.
    const [view, setView] = useState<PlateFood | null>(food)
    if (food && food !== view) setView(food)

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
                    <div className="flex w-full items-center gap-2 sm:gap-3">
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            aria-label="Delete box"
                            className="mr-auto px-3 sm:px-[18px]"
                            onClick={() => onDelete(f)}
                        >
                            <span className="hidden sm:inline">Delete</span>
                        </Button>
                        <Button variant="secondary" icon="fa-solid fa-pen" onClick={() => onEdit(f)}>
                            Edit
                        </Button>
                        <Button icon="fa-solid fa-fire-burner" onClick={() => onCook(f)}>
                            Cooked it
                        </Button>
                    </div>
                )
            }
        >
            {f && raw && (
                <div className="flex flex-col gap-7">
                    <p
                        className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${
                            pantryLine(f).live ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-50 text-neutral-500'
                        }`}
                    >
                        <i className="fa-solid fa-box-open text-xs" aria-hidden="true" />
                        {pantryLine(f).text}
                        {pantryLine(f).live && <span className="text-emerald-700/70">— see the Pantry tab</span>}
                    </p>

                    <section className="flex flex-col gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                            Recipe · raw ingredients for one batch
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
                                    <div className="w-20 shrink-0 sm:w-24">
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

export function TotalPanel({ label, macros }: { label: string; macros: Macros }) {
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
export function CookDrawer({
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
    // The raw grams are usually the same as last time, so they start folded away.
    const [showRaw, setShowRaw] = useState(false)
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
        setShowRaw(false)
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
                <div className="flex flex-col gap-6">
                    <section className="flex flex-col gap-2">
                        <p className={FIELD_LABEL}>Cooked weight</p>
                        <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                                <Input
                                    aria-label="Cooked weight in grams"
                                    type="number"
                                    min={0}
                                    step="any"
                                    inputMode="decimal"
                                    enterKeyHint="done"
                                    autoFocus
                                    placeholder="Weigh it all once cooked"
                                    value={cooked}
                                    error={error || undefined}
                                    onChange={(e) => setCooked(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                    }}
                                    className="h-14 text-xl font-semibold tabular-nums"
                                />
                            </div>
                            <span className="text-base font-medium text-neutral-500">g</span>
                        </div>
                    </section>

                    <TotalPanel label="Per 100 g cooked" macros={per100} />

                    <section className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => setShowRaw((v) => !v)}
                            aria-expanded={showRaw}
                            className="-mx-1 flex min-h-11 items-center gap-3 rounded-xl px-1 text-left"
                        >
                            <span className="min-w-0 flex-1">
                                <span className={`block ${FIELD_LABEL}`}>What went in (raw)</span>
                                <span className="mt-0.5 block truncate text-xs tabular-nums text-neutral-500">
                                    {f.ingredients.length} ingredient{f.ingredients.length === 1 ? '' : 's'} ·{' '}
                                    {kcal(raw.calories)} kcal · {fmt(raw.protein)} g protein
                                </span>
                            </span>
                            <span className="shrink-0 text-[13px] font-semibold text-coral-600">
                                {showRaw ? 'Done' : 'Change grams'}
                            </span>
                        </button>
                        {showRaw && (
                            <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                                {f.ingredients.map((i, n) => (
                                    <li key={n} className="flex items-center gap-3 py-2 pl-3 pr-2 sm:pl-4">
                                        <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{i.name}</span>
                                        <div className="flex w-28 shrink-0 items-center gap-1.5">
                                            <Input
                                                aria-label={`${i.name} grams`}
                                                type="number"
                                                min={0}
                                                step="any"
                                                inputMode="decimal"
                                                enterKeyHint="done"
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
                        )}
                    </section>

                    <section className="flex flex-col gap-2">
                        <p className={FIELD_LABEL}>Date cooked</p>
                        <DatePicker
                            value={date}
                            maxDate={todayKey()}
                            onChange={(v) => setDate(typeof v === 'string' && v ? v : todayKey())}
                        />
                    </section>

                    {f.open.length > 0 && (
                        <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                            <Checkbox
                                checked={finishOpen}
                                onChange={setFinishOpen}
                                label={`Finished the last one (cooked ${shortDate(f.open[0].date)})`}
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

// ─── Import ─────────────────────────────────────────────────────────────────────

/** The tray import format, annotated. Comments are ignored on import. */
const TRAY_TEMPLATE = `[
  // One object per tray. "name" and "ingredients" are required.
  {
    "name": "Chicken & veg tray",
    "notes": "200°C for 35 min",                      // optional
    "ingredients": [
      // grams = how much goes in raw. per100 = the packet's macros per 100 g.
      { "name": "Chicken breast", "grams": 1000, "per100": { "calories": 106, "protein": 24, "carbs": 0, "fat": 1.1 } },
      { "name": "Peppers", "grams": 400, "per100": { "calories": 26, "protein": 1, "carbs": 4.6, "fat": 0.3 } },
      { "name": "Red onion", "grams": 200, "per100": { "calories": 37, "protein": 1.1, "carbs": 7.9, "fat": 0.2 } },
      { "name": "Olive oil", "grams": 20, "per100": { "calories": 828, "protein": 0, "carbs": 0, "fat": 92 } }
    ],
    // Optional: weighed it after cooking? Add the cooked weight and it's logged
    // as a cook, ready to plate. "cookedOn" defaults to today.
    "cookedGrams": 1250,
    "cookedOn": "2026-10-19"
  },
  {
    "name": "Beef mince chilli",
    "ingredients": [
      { "name": "5% beef mince", "grams": 1000, "per100": { "calories": 124, "protein": 21, "carbs": 0, "fat": 4.5 } },
      { "name": "Chopped tomatoes", "grams": 800, "per100": { "calories": 21, "protein": 1.2, "carbs": 3, "fat": 0.2 } },
      { "name": "Kidney beans", "grams": 240, "per100": { "calories": 98, "protein": 6.9, "carbs": 13, "fat": 0.6 } }
    ]
  }
]
`

function TrayImportNotes() {
    const f = (s: string) => <span className="font-semibold text-neutral-700">{s}</span>
    return (
        <>
            <p>
                {f('name')} and {f('ingredients')} are required; {f('notes')} is optional.
            </p>
            <p>
                Each ingredient has a {f('name')}, the {f('grams')} that go in raw, and {f('per100')}: the
                packet&apos;s {f('calories')}, {f('protein')}, {f('carbs')} and {f('fat')} per 100 g. Missing ones
                count as 0.
            </p>
            <p>
                {f('cookedGrams')} is optional — the tray&apos;s weight once cooked. With it, the cook is logged
                (on {f('cookedOn')}, or today) and the tray is ready to plate. Without it, log the cook from the
                tray&apos;s card when you make it.
            </p>
            <p>A tray with the same name as a box already in your library lets you choose to update it or keep both.</p>
        </>
    )
}
