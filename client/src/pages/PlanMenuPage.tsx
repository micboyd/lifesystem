import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import ConfirmModal from '../components/ConfirmModal'
import DropdownMenu from '../components/DropdownMenu'
import { BarButton, CAPS, Eyebrow, SectionTitle } from '../components/Blok'
import MealWeekBuilder, { ApplyModal } from '../components/nutrition/MealWeekBuilder'
import { shortDate } from '../components/nutrition/format'
import { useToast } from '../context/ToastContext'
import { listMeals } from '../services/meals'
import * as planService from '../services/nutritionPhases'
import { currentPhaseTargets, normGoals } from '../lib/nutrition'
import { sortMenu } from '../lib/planMenu'
import type { MacroGoals, Meal, MenuApplied, MenuItem, NutritionPhase } from '../types'

/**
 * Nutrition → Plans → a plan's meal week, full screen.
 *
 * The week itself is MealWeekBuilder; this page loads the plan, saves the week
 * as it changes, and puts it on (or takes it off) the planner.
 */

const ICON_BTN =
    'grid h-11 w-11 shrink-0 place-items-center text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-900 lg:h-10 lg:w-10'

function errorMessage(err: unknown, fallback: string): string {
    return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

export default function PlanMenuPage() {
    const { id = '' } = useParams()
    const navigate = useNavigate()
    const toast = useToast()

    const [plan, setPlan] = useState<NutritionPhase | null>(null)
    const [meals, setMeals] = useState<Meal[] | null>(null)
    const [menu, setMenuState] = useState<MenuItem[]>([])
    const [applied, setApplied] = useState<MenuApplied | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
    const [applying, setApplying] = useState(false)
    const [confirmUnapply, setConfirmUnapply] = useState(false)

    const leave = () => navigate('/nutrition?tab=plans')

    useEffect(() => {
        let live = true
        Promise.all([planService.listNutritionPhases(), listMeals(), planService.getMenuApplied(id)])
            .then(([plans, library, onPlanner]) => {
                if (!live) return
                const found = plans.find((p) => p._id === id)
                if (!found) {
                    setLoadError('That plan no longer exists.')
                    return
                }
                setPlan(found)
                setMeals(library)
                setMenuState(sortMenu(found.menu ?? []))
                setApplied(onPlanner)
            })
            .catch((err) => live && setLoadError(errorMessage(err, 'Could not load the plan.')))
        return () => {
            live = false
        }
    }, [id])

    // Saved a moment after each change, and straight away on the way out.
    const pending = useRef<MenuItem[] | null>(null)
    const timer = useRef<number | null>(null)
    const flush = useCallback(() => {
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = null
        const next = pending.current
        if (!next) return
        pending.current = null
        setSaveState('saving')
        planService
            .saveMenu(id, next)
            .then(() => setSaveState('saved'))
            .catch(() => setSaveState('failed'))
    }, [id])
    useEffect(() => flush, [flush])

    const setMenu = (next: MenuItem[]) => {
        const sorted = sortMenu(next)
        setMenuState(sorted)
        pending.current = sorted
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(flush, 600)
    }

    const goals: MacroGoals | null = useMemo(() => (plan ? normGoals(currentPhaseTargets(plan)) : null), [plan])

    if (loadError) {
        return (
            <div className="mx-auto max-w-xl px-5 py-16">
                <Alert variant="danger">{loadError}</Alert>
                <div className="mt-6">
                    <BarButton onClick={leave}>Back to Plans</BarButton>
                </div>
            </div>
        )
    }
    if (!plan || !meals) {
        return (
            <div className="grid min-h-dvh place-items-center bg-canvas">
                <Spinner />
            </div>
        )
    }

    async function apply(from: string) {
        try {
            const out = await planService.applyMenu(id, from)
            setApplied(out.applied)
            setApplying(false)
            const skipped = out.skipped ? ` · ${out.skipped} slot${out.skipped === 1 ? '' : 's'} already had something` : ''
            const away = out.away ? ` · ${out.away} away for calendar events` : ''
            toast.show(`Added ${out.added} meals, ${shortDate(out.from)} – ${shortDate(out.to)}${away}${skipped}`, 'success')
        } catch (err) {
            toast.show(errorMessage(err, 'Could not put the plan on the planner.'))
        }
    }

    async function unapply() {
        try {
            const removed = await planService.unapplyMenu(id)
            setApplied({ count: 0, from: null, to: null })
            toast.show(`Took ${removed} planned meal${removed === 1 ? '' : 's'} off the planner`, 'success')
        } catch (err) {
            toast.show(errorMessage(err, 'Could not take the plan off the planner.'))
        }
    }

    const savedNote =
        saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'failed' ? 'Not saved — try again' : ''

    const footNote =
        applied && applied.count > 0 && applied.to
            ? `On the planner · ${applied.count} meals to ${shortDate(applied.to)}`
            : menu.length === 0
              ? 'Fill the week, then put it on the planner'
              : 'Not on the planner yet'

    return (
        <div className="flex min-h-dvh flex-col bg-canvas">
            {/* Top: the way back and the plan. */}
            <div className="sticky top-0 z-20 bg-canvas pt-[env(safe-area-inset-top)]">
                <div className="flex min-h-16 items-center gap-3 border-b border-hairline px-3 sm:px-8">
                    <button type="button" onClick={leave} aria-label="Back to Plans" className={ICON_BTN}>
                        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className={`${CAPS} hidden text-neutral-500 sm:block`}>Plan · meal week</p>
                        <h1 className="truncate text-[17px] font-medium">{plan.name}</h1>
                    </div>
                    {savedNote && (
                        <span className={`text-[12px] ${saveState === 'failed' ? 'text-red-700' : 'text-neutral-500'}`}>
                            {savedNote}
                        </span>
                    )}
                    {applied && applied.count > 0 && (
                        <DropdownMenu
                            align="right"
                            trigger={
                                <span aria-label="Plan actions" className={ICON_BTN}>
                                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                                </span>
                            }
                            items={[
                                {
                                    label: 'Take off planner',
                                    icon: 'fa-solid fa-calendar-xmark',
                                    danger: true,
                                    onClick: () => setConfirmUnapply(true),
                                },
                            ]}
                        />
                    )}
                </div>
            </div>

            <main className="mx-auto w-full max-w-[1800px] flex-1 px-5 pb-36 pt-10 sm:px-8 sm:pt-12">
                <section className="mb-8 flex flex-col gap-3">
                    <Eyebrow>
                        {shortDate(plan.startDate)} – {shortDate(plan.endDate)}
                    </Eyebrow>
                    <SectionTitle>A week of eating</SectionTitle>
                    <p className="max-w-[640px] text-[15px] leading-normal text-neutral-700 sm:text-[17px]">
                        Seven days that repeat for the whole plan. Fill picks meals from your Library that land each
                        day on the plan’s macros and runs a tray on until its boxes are used. Tap any meal to swap it.
                    </p>
                </section>
                <MealWeekBuilder menu={menu} onChange={setMenu} meals={meals} goals={goals} />
            </main>

            {/* Foot: whether it's on the planner, and the way to put it there. */}
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]">
                <div className="mx-auto flex min-h-[72px] max-w-[1800px] items-center gap-3 px-5 sm:px-8">
                    <p className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">{footNote}</p>
                    {applied && applied.count > 0 && (
                        <BarButton onClick={() => navigate('/nutrition')} className="!border-neutral-300">
                            Open planner
                        </BarButton>
                    )}
                    <BarButton solid arrow onClick={() => setApplying(true)} disabled={menu.length === 0}>
                        {applied && applied.count > 0 ? 'Update planner' : 'Put on planner'}
                    </BarButton>
                </div>
            </div>

            <ApplyModal key={applying ? 'open' : 'shut'} open={applying} plan={plan} onClose={() => setApplying(false)} onApply={apply} />
            <ConfirmModal
                open={confirmUnapply}
                title="Take off planner?"
                message="Removes this plan’s meals from today on that haven’t been eaten yet. Meals you added by hand stay."
                confirmLabel="Take off"
                danger
                onConfirm={() => {
                    setConfirmUnapply(false)
                    void unapply()
                }}
                onClose={() => setConfirmUnapply(false)}
            />
        </div>
    )
}
