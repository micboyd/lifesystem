import { useCallback, useEffect, useState } from 'react'
import { Card } from '../Card'
import Drawer from '../Drawer'
import Button from '../Button'
import EmptyState from '../EmptyState'
import ConfirmModal from '../ConfirmModal'
import Spinner from '../Spinner'
import { StatStrip } from '../session/SessionUI'
import { CardMenu, CookDrawer, TotalPanel, per100Line, shortDate } from './BoxLibrary'
import { fmt, kcal } from './format'
import { gramsLeft } from '../../lib/plates'
import { todayKey } from '../../lib/calendar'
import { deleteCook, listCooks, setCookFinished } from '../../services/plateFoods'
import { useToast } from '../../context/ToastContext'
import type { BoxCook, PlateFood } from '../../types'

/**
 * The pantry: every batch you've cooked and not yet finished — what's in the
 * fridge right now — with how much is left and how much is already planned.
 * Recipes live in the Library; the cooked instances of them live here, and
 * only these can go onto a plate.
 */

/** Whole days between a cook and today. */
function daysOld(date: string): number {
    const ms = new Date(`${todayKey()}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()
    return Math.max(0, Math.round(ms / 86_400_000))
}

function ageLabel(date: string): string {
    const d = daysOld(date)
    return d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

/** Cooked food keeps 3–4 days in the fridge; past that the age is flagged. */
const OLD_AFTER_DAYS = 4

export default function Pantry({ foods, onChanged }: { foods: PlateFood[]; onChanged: () => Promise<void> }) {
    const toast = useToast()
    const [cooks, setCooks] = useState<{ open: BoxCook[]; finished: BoxCook[] } | null>(null)
    const [viewing, setViewing] = useState<BoxCook | null>(null)
    const [choosing, setChoosing] = useState(false)
    const [cooking, setCooking] = useState<PlateFood | null>(null)
    const [deleting, setDeleting] = useState<BoxCook | null>(null)

    const load = useCallback(() => listCooks().then(setCooks), [])
    useEffect(() => {
        load().catch(() => toast.show('Could not load the pantry.', 'danger'))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])

    const boxes = foods.filter((f) => f.kind === 'box')

    /** Reload the pantry, and the foods the planner plates from. */
    async function refresh() {
        await Promise.all([load(), onChanged()])
    }

    async function run(fn: () => Promise<void>, failure: string) {
        try {
            await fn()
            await refresh()
        } catch {
            toast.show(failure, 'danger')
        }
    }

    const finish = (c: BoxCook, finished: boolean) => {
        setViewing(null)
        void run(() => setCookFinished(c._id, finished), 'Could not update that batch.')
    }

    if (!cooks) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const open = cooks.open
    const leftTotal = open.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)

    return (
        <>
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-neutral-500">
                    {open.length > 0 && (
                        <>
                            <span className="font-semibold tabular-nums text-neutral-900">{open.length}</span>{' '}
                            {open.length === 1 ? 'batch' : 'batches'} ·{' '}
                            <span className="tabular-nums">~{fmt(leftTotal)} g</span> left
                        </>
                    )}
                </p>
                {boxes.length > 0 && (
                    <Button icon="fa-solid fa-fire-burner" onClick={() => setChoosing(true)}>
                        Log a cook
                    </Button>
                )}
            </div>

            <div className="mt-6 flex flex-col gap-8">
                {open.length === 0 ? (
                    <EmptyState
                        icon="fa-solid fa-box-open"
                        title="Nothing in the pantry"
                        description={
                            boxes.length > 0
                                ? 'Log a cook when you make a box — weigh it once cooked and it’s ready to plate.'
                                : 'Add a box (a recipe you batch-cook) in Library → Boxes & foods, then log a cook here.'
                        }
                        action={
                            boxes.length > 0 ? (
                                <Button icon="fa-solid fa-fire-burner" onClick={() => setChoosing(true)}>
                                    Log a cook
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {open.map((c) => (
                            <BatchCard
                                key={c._id}
                                cook={c}
                                onOpen={() => setViewing(c)}
                                onFinish={() => finish(c, true)}
                                onDelete={() => setDeleting(c)}
                            />
                        ))}
                    </div>
                )}

                {cooks.finished.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <div>
                            <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                Finished
                            </h3>
                            <p className="mt-0.5 text-xs text-neutral-500">Recent batches you’ve used up.</p>
                        </div>
                        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-900/[0.06]">
                            {cooks.finished.map((c) => (
                                <li key={c._id}>
                                    <button
                                        type="button"
                                        onClick={() => setViewing(c)}
                                        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-neutral-50"
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-neutral-800">
                                                {c.name}
                                            </span>
                                            <span className="block text-xs text-neutral-500">
                                                Cooked {shortDate(c.date)}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                                            {fmt(c.eatenGrams ?? 0)} of {fmt(c.cookedGrams)} g eaten
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>

            <BatchDrawer
                cook={viewing}
                onClose={() => setViewing(null)}
                onFinish={finish}
                onDelete={(c) => setDeleting(c)}
            />

            <Drawer
                open={choosing}
                onClose={() => setChoosing(false)}
                title="What did you cook?"
                footer={
                    <Button variant="ghost" onClick={() => setChoosing(false)}>
                        Cancel
                    </Button>
                }
            >
                <ul className="flex flex-col gap-2">
                    {boxes.map((b) => (
                        <li key={b._id}>
                            <button
                                type="button"
                                onClick={() => {
                                    setChoosing(false)
                                    setCooking(b)
                                }}
                                className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                            >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                                    <i className="fa-solid fa-box text-xs" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-neutral-900">
                                        {b.name}
                                    </span>
                                    <span className="block text-xs text-neutral-500">
                                        {b.ingredients.length} ingredient{b.ingredients.length === 1 ? '' : 's'}
                                        {b.last && ` · last cooked ${shortDate(b.last.date)}`}
                                    </span>
                                </span>
                                <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            </Drawer>

            <CookDrawer
                food={cooking ? (foods.find((f) => f._id === cooking._id) ?? cooking) : null}
                onClose={() => setCooking(null)}
                onSaved={refresh}
            />

            <ConfirmModal
                open={!!deleting}
                title="Delete this cook?"
                message={
                    <>
                        Delete the <span className="font-semibold">{deleting?.name}</span> cooked{' '}
                        {deleting && shortDate(deleting.date)}? Planned plates move to another open batch, or count
                        as 0. Plates you’ve already eaten keep their numbers.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={() => {
                    const c = deleting
                    setDeleting(null)
                    setViewing(null)
                    if (c) void run(() => deleteCook(c._id), 'Could not delete that cook.')
                }}
                onClose={() => setDeleting(null)}
            />
        </>
    )
}

// ─── Batch card ─────────────────────────────────────────────────────────────────

function BatchCard({
    cook,
    onOpen,
    onFinish,
    onDelete,
}: {
    cook: BoxCook
    onOpen: () => void
    onFinish: () => void
    onDelete: () => void
}) {
    const left = gramsLeft(cook.cookedGrams, cook.eatenGrams)
    const planned = cook.plannedGrams ?? 0
    const pct = cook.cookedGrams > 0 ? Math.min(100, (left / cook.cookedGrams) * 100) : 0
    const old = daysOld(cook.date) >= OLD_AFTER_DAYS
    return (
        <Card as="div" className="relative flex flex-col gap-4">
            <button
                type="button"
                aria-label={`View ${cook.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutral-900">{cook.name}</p>
                    <p className={`mt-0.5 text-xs ${old ? 'font-medium text-amber-700' : 'text-neutral-500'}`}>
                        Cooked {shortDate(cook.date)} · {ageLabel(cook.date)}
                    </p>
                </div>
                <CardMenu
                    items={[
                        { label: 'Finished', icon: 'fa-solid fa-check', onClick: onFinish },
                        { label: 'Delete cook', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                    <span className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">
                        ~{fmt(left)} g
                    </span>
                    <span className="text-xs tabular-nums text-neutral-500">of {fmt(cook.cookedGrams)} g</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs tabular-nums text-neutral-500">
                    {planned > 0 ? `${fmt(planned)} g planned · ` : ''}
                    {per100Line(cook.per100)}
                </p>
            </div>
        </Card>
    )
}

// ─── Batch details ──────────────────────────────────────────────────────────────

function BatchDrawer({
    cook,
    onClose,
    onFinish,
    onDelete,
}: {
    cook: BoxCook | null
    onClose: () => void
    onFinish: (c: BoxCook, finished: boolean) => void
    onDelete: (c: BoxCook) => void
}) {
    // Keep the last batch on screen while the drawer animates closed.
    const [view, setView] = useState<BoxCook | null>(cook)
    if (cook && cook !== view) setView(cook)
    const c = view
    const left = c ? gramsLeft(c.cookedGrams, c.eatenGrams) : 0

    return (
        <Drawer
            open={!!cook}
            onClose={onClose}
            size="xl"
            title={c?.name ?? 'Batch'}
            badge={c ? `Cooked ${shortDate(c.date)}` : undefined}
            footer={
                c && (
                    <div className="flex w-full items-center gap-2 sm:gap-3">
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            aria-label="Delete cook"
                            className="mr-auto px-3 sm:px-[18px]"
                            onClick={() => onDelete(c)}
                        >
                            <span className="hidden sm:inline">Delete</span>
                        </Button>
                        {c.finished ? (
                            <Button variant="secondary" icon="fa-solid fa-rotate-left" onClick={() => onFinish(c, false)}>
                                Back in the pantry
                            </Button>
                        ) : (
                            <Button icon="fa-solid fa-check" onClick={() => onFinish(c, true)}>
                                Finished
                            </Button>
                        )}
                    </div>
                )
            }
        >
            {c && (
                <div className="flex flex-col gap-7">
                    <StatStrip
                        stats={[
                            { icon: 'fa-solid fa-weight-scale', label: 'Cooked', value: `${fmt(c.cookedGrams)} g` },
                            { icon: 'fa-solid fa-utensils', label: 'Eaten', value: `${fmt(c.eatenGrams ?? 0)} g` },
                            { icon: 'fa-regular fa-calendar', label: 'Planned', value: `${fmt(c.plannedGrams ?? 0)} g` },
                            { icon: 'fa-solid fa-box-open', label: 'Left', value: `~${fmt(left)} g` },
                        ]}
                    />

                    <TotalPanel label="Per 100 g cooked" macros={c.per100} />

                    <section className="flex flex-col gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                            What went in (raw)
                        </p>
                        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                            {c.ingredients.map((i, n) => (
                                <li key={n} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                    <span className="min-w-0 truncate text-neutral-800">{i.name}</span>
                                    <span className="shrink-0 tabular-nums text-neutral-500">{fmt(i.grams)} g</span>
                                </li>
                            ))}
                        </ul>
                        <p className="px-1 text-xs tabular-nums text-neutral-500">
                            Whole batch: <span className="font-semibold text-neutral-800">{kcal(c.raw.calories)} kcal</span>{' '}
                            · {fmt(c.raw.protein)} P · {fmt(c.raw.carbs)} C · {fmt(c.raw.fat)} F
                        </p>
                    </section>
                </div>
            )}
        </Drawer>
    )
}
