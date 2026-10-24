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
import { ingredientAmount } from '../../lib/shopping'
import { deleteCook, listCooks, setCookFinished, setCookFrozen } from '../../services/plateFoods'
import { useToast } from '../../context/ToastContext'
import type { BoxCook, PlateFood } from '../../types'

/**
 * The pantry: every batch you've cooked and not yet finished — what's in the
 * fridge right now — with how much is left and how much is already planned.
 * Recipes live in the Library; the cooked instances of them live here, and
 * only these can go onto a plate. Frozen batches wait in their own section
 * until taken out, and you're told when the ones in use are running low.
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

/** "Cooked 12 Oct · 2 days ago", or for a thawed batch, when it came out. */
function ageLine(c: BoxCook): string {
    return c.thawed
        ? `Out of the freezer ${ageLabel(c.thawed)} · cooked ${shortDate(c.date)}`
        : `Cooked ${shortDate(c.date)} · ${ageLabel(c.date)}`
}

/** Cooked food keeps 3–4 days in the fridge (counted from thawing); past that the age is flagged. */
const OLD_AFTER_DAYS = 4

/**
 * Below this many grams left across a food's batches in use — about two
 * plates — the pantry says to get one out of the freezer, so it's thawed in time.
 */
const LOW_GRAMS = 600

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

    // Boxes first, then plain foods (a box of rice) — anything can be batched.
    const boxes = [...foods.filter((f) => f.kind === 'box'), ...foods.filter((f) => f.kind === 'plain')]

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

    const freeze = (c: BoxCook, frozen: boolean) => {
        setViewing(null)
        void run(
            () => setCookFrozen(c._id, frozen, frozen ? undefined : todayKey()),
            frozen ? 'Could not move that batch to the freezer.' : 'Could not take that batch out.'
        )
    }

    if (!cooks) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const open = cooks.open.filter((c) => !c.frozen)
    // Oldest first — that's the one to take out next.
    const frozen = cooks.open.filter((c) => c.frozen).reverse()
    const leftTotal = open.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
    // Per food: the chicken running out isn't hidden by a full box of rice.
    const low = [...new Set(frozen.map((c) => c.food))].flatMap((food) => {
        const inUse = open.filter((c) => c.food === food)
        const left = inUse.reduce((sum, c) => sum + gramsLeft(c.cookedGrams, c.eatenGrams), 0)
        const next = frozen.find((c) => c.food === food)!
        return left < LOW_GRAMS ? [{ next, left, none: inUse.length === 0 }] : []
    })

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
                    {open.length > 0 && frozen.length > 0 && ' · '}
                    {frozen.length > 0 && (
                        <>
                            <span className="font-semibold tabular-nums text-neutral-900">{frozen.length}</span> frozen
                        </>
                    )}
                </p>
                {boxes.length > 0 && (
                    <Button icon="fa-solid fa-fire-burner" onClick={() => setChoosing(true)}>
                        Log a cook
                    </Button>
                )}
            </div>

            {low.map(({ next, left, none }) => (
                <div
                    key={next._id}
                    className="mt-4 flex flex-col gap-3 rounded-2xl bg-sky-50 px-4 py-3.5 ring-1 ring-sky-100 sm:flex-row sm:items-center"
                >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-600">
                        <i className="fa-solid fa-snowflake text-sm" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-sky-800">
                            {none ? `No ${next.name} out` : `${next.name} running low`} — get one out of the freezer
                        </p>
                        <p className="mt-0.5 text-xs text-sky-700">
                            {none ? 'None in use. ' : `~${fmt(left)} g left in use. `}
                            Next out: the one cooked {shortDate(next.date)}.
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-arrow-right-from-bracket"
                        className="shrink-0"
                        onClick={() => freeze(next, false)}
                    >
                        Taken it out
                    </Button>
                </div>
            ))}

            <div className="mt-6 flex flex-col gap-8">
                {open.length === 0 && frozen.length > 0 ? null : open.length === 0 ? (
                    <EmptyState
                        icon="fa-solid fa-box-open"
                        title="Nothing in the pantry"
                        description={
                            boxes.length > 0
                                ? 'Log a cook when you make a box (or a batch of rice) — weigh it and it’s ready to plate.'
                                : 'Add a box or a food in Library → Boxes & foods, then log a cook here.'
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
                                onFreeze={() => freeze(c, true)}
                                onDelete={() => setDeleting(c)}
                            />
                        ))}
                    </div>
                )}

                {frozen.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <div>
                            <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                In the freezer
                            </h3>
                            <p className="mt-0.5 text-xs text-neutral-500">
                                Oldest first. Take one out and it’s ready to plate.
                            </p>
                        </div>
                        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white ring-1 ring-neutral-900/[0.06]">
                            {frozen.map((c) => (
                                <li key={c._id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                                    <button
                                        type="button"
                                        onClick={() => setViewing(c)}
                                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                                    >
                                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-600">
                                            <i className="fa-solid fa-snowflake text-xs" aria-hidden="true" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium text-neutral-800">
                                                {c.name}
                                            </span>
                                            <span className="block text-xs tabular-nums text-neutral-500">
                                                Cooked {shortDate(c.date)} ·{' '}
                                                {fmt(gramsLeft(c.cookedGrams, c.eatenGrams))} g
                                            </span>
                                        </span>
                                    </button>
                                    <Button variant="secondary" className="shrink-0" onClick={() => freeze(c, false)}>
                                        Take out
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </section>
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
                onFreeze={freeze}
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
                                <span
                                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                                        b.kind === 'box' ? 'bg-amber-50 text-amber-600' : 'bg-neutral-100 text-neutral-500'
                                    }`}
                                >
                                    <i
                                        className={`fa-solid ${b.kind === 'box' ? 'fa-box' : 'fa-bowl-rice'} text-xs`}
                                        aria-hidden="true"
                                    />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-neutral-900">
                                        {b.name}
                                    </span>
                                    <span className="block text-xs text-neutral-500">
                                        {b.kind === 'box'
                                            ? `${b.ingredients.length} ingredient${b.ingredients.length === 1 ? '' : 's'}`
                                            : 'Food'}
                                        {b.last && ` · last made ${shortDate(b.last.date)}`}
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
    onFreeze,
    onDelete,
}: {
    cook: BoxCook
    onOpen: () => void
    onFinish: () => void
    onFreeze: () => void
    onDelete: () => void
}) {
    const left = gramsLeft(cook.cookedGrams, cook.eatenGrams)
    const planned = cook.plannedGrams ?? 0
    const pct = cook.cookedGrams > 0 ? Math.min(100, (left / cook.cookedGrams) * 100) : 0
    const old = daysOld(cook.thawed ?? cook.date) >= OLD_AFTER_DAYS
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
                        {ageLine(cook)}
                    </p>
                </div>
                <CardMenu
                    items={[
                        { label: 'Finished', icon: 'fa-solid fa-check', onClick: onFinish },
                        { label: 'Put in the freezer', icon: 'fa-solid fa-snowflake', onClick: onFreeze },
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
    onFreeze,
    onDelete,
}: {
    cook: BoxCook | null
    onClose: () => void
    onFinish: (c: BoxCook, finished: boolean) => void
    onFreeze: (c: BoxCook, frozen: boolean) => void
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
            badge={c ? `${c.frozen ? 'Frozen · cooked' : 'Cooked'} ${shortDate(c.date)}` : undefined}
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
                        ) : c.frozen ? (
                            <Button icon="fa-solid fa-arrow-right-from-bracket" onClick={() => onFreeze(c, false)}>
                                Take out of the freezer
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

                    {/* A plain food's batch (rice) has nothing raw to list. */}
                    <section className={c.ingredients.length ? 'flex flex-col gap-3' : 'hidden'}>
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                            What went in (raw)
                        </p>
                        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                            {c.ingredients.map((i, n) => (
                                <li key={n} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                    <span className="min-w-0 truncate text-neutral-800">{i.name}</span>
                                    <span className="shrink-0 tabular-nums text-neutral-500">{ingredientAmount(i)}</span>
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
