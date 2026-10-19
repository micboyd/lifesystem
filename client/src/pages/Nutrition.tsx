import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import Tabs from '../components/Tabs'
import Spinner from '../components/Spinner'
import NutritionPlanner from '../components/nutrition/NutritionPlanner'
import { LARGE_QUERY, useMediaQuery } from '../components/planner/WeekPlannerUI'
import MealLibrary from '../components/nutrition/MealLibrary'
import NutritionStats from '../components/nutrition/NutritionStats'
import PhasesTab from '../components/nutrition/PhasesTab'
import { useAuth } from '../context/AuthContext'
import { listMeals } from '../services/meals'
import type { Meal } from '../types'

const TABS = ['Planner', 'Library', 'Stats', 'Phases'] as const
type Tab = (typeof TABS)[number]

const SUBTITLE: Record<Tab, string> = {
    Planner: 'Plan your meals — drop them into each day, then tick them off as you eat.',
    Library: 'Your meals — breakfast, lunch, dinner and snacks.',
    Stats: 'Calories in and out over a week, a month or a phase.',
    Phases: 'Dated cuts, bulks and maintenance stretches, with their targets.',
}

export default function Nutrition() {
    const { user } = useAuth()

    // `?tab=phases&phase=<id>` is how the Life Plan timeline hands off a phase
    // to edit. Read once on arrival, then dropped from the URL.
    const [searchParams, setSearchParams] = useSearchParams()
    const [tab, setTab] = useState<Tab>(() => (searchParams.get('tab') === 'phases' ? 'Phases' : 'Planner'))
    const [openPhaseId, setOpenPhaseId] = useState<string | null>(() => searchParams.get('phase'))
    const clearOpenPhase = useCallback(() => setOpenPhaseId(null), [])
    useEffect(() => {
        if (searchParams.has('tab') || searchParams.has('phase')) setSearchParams({}, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const [meals, setMeals] = useState<Meal[]>([])
    const [loading, setLoading] = useState(true)
    const reloadMeals = useCallback(() => listMeals().then(setMeals), [])
    useEffect(() => {
        reloadMeals().finally(() => setLoading(false))
    }, [reloadMeals])

    const isLarge = useMediaQuery(LARGE_QUERY)
    // The week board spans the screen below the tabs, as in Fitness; the header,
    // the tabs and every other tab sit in the usual column.
    const fluid = tab === 'Planner' && isLarge

    return (
        <main className="py-10">
            <Container>
                <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                            Nutrition
                        </h1>
                        <p className="mt-1 text-sm text-neutral-500">{SUBTITLE[tab]}</p>
                    </div>
                </header>

                <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setTab(t as Tab)} className="self-start" />
            </Container>

            <Container fluid={fluid} className="mt-6">
                {loading && (tab === 'Planner' || tab === 'Library') ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : tab === 'Planner' ? (
                    <NutritionPlanner meals={meals} settingsGoals={user?.settings?.macroGoals} />
                ) : tab === 'Library' ? (
                    <MealLibrary meals={meals} onChanged={reloadMeals} />
                ) : tab === 'Stats' ? (
                    <NutritionStats settingsGoals={user?.settings?.macroGoals} />
                ) : (
                    <PhasesTab openPhaseId={openPhaseId} onOpened={clearOpenPhase} />
                )}
            </Container>
        </main>
    )
}
