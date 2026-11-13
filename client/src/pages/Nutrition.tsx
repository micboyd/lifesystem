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
import { ShoppingPill, useShopping } from '../components/nutrition/ShoppingList'
import ThinkingAhead from '../components/nutrition/ThinkingAhead'
import { useAuth } from '../context/AuthContext'
import { listMeals } from '../services/meals'
import type { Meal } from '../types'

const TABS = ['Planner', 'Thinking ahead', 'Library', 'Plans', 'Stats'] as const
type Tab = (typeof TABS)[number]

const SUBTITLE: Record<Tab, string> = {
    Planner: 'Plan your meals — drop them into each day, then tick them off as you eat.',
    'Thinking ahead': 'Batch cooking in three steps: plan what you’re making, shop for it, then portion it into boxes.',
    Library: 'Your meals and their macros. Made a batch? It splits it into meals for you.',
    Plans: 'Dated cuts, bulks and maintenance stretches — each plan sets the daily targets the planner judges against.',
    Stats: 'Calories in and out over a week, a month or a plan.',
}

export default function Nutrition() {
    const { user } = useAuth()

    // `?tab=plans&plan=<id>` is how the Timeline page hands off a nutrition
    // plan to edit (the old `phases`/`phase` names still work). Read once on
    // arrival, then dropped from the URL.
    const [searchParams, setSearchParams] = useSearchParams()
    const [tab, setTab] = useState<Tab>(() => (['plans', 'phases'].includes(searchParams.get('tab') ?? '') ? 'Plans' : 'Planner'))
    const [openPhaseId, setOpenPhaseId] = useState<string | null>(() => searchParams.get('plan') ?? searchParams.get('phase'))
    const clearOpenPhase = useCallback(() => setOpenPhaseId(null), [])
    useEffect(() => {
        if (searchParams.has('tab') || searchParams.has('plan') || searchParams.has('phase')) setSearchParams({}, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const [meals, setMeals] = useState<Meal[]>([])
    const [loading, setLoading] = useState(true)
    const reloadMeals = useCallback(() => listMeals().then(setMeals), [])
    useEffect(() => {
        reloadMeals().finally(() => setLoading(false))
    }, [reloadMeals])

    const shopping = useShopping()

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
                    {tab !== 'Thinking ahead' && (
                        <ShoppingPill list={shopping.list} onOpen={() => setTab('Thinking ahead')} />
                    )}
                </header>

                <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setTab(t as Tab)} className="self-start" />
            </Container>

            <Container fluid={fluid} className="mt-6">
                {loading && (tab === 'Planner' || tab === 'Library' || tab === 'Thinking ahead') ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : tab === 'Planner' ? (
                    <NutritionPlanner
                        meals={meals}
                        settingsGoals={user?.settings?.macroGoals}
                        onMealsChanged={reloadMeals}
                    />
                ) : tab === 'Thinking ahead' ? (
                    <ThinkingAhead
                        meals={meals}
                        list={shopping.list}
                        onChange={shopping.setList}
                    />
                ) : tab === 'Library' ? (
                    <MealLibrary
                        meals={meals}
                        onChanged={reloadMeals}
                        onShop={shopping.add}
                        settingsGoals={user?.settings?.macroGoals}
                    />
                ) : tab === 'Stats' ? (
                    <NutritionStats settingsGoals={user?.settings?.macroGoals} />
                ) : (
                    <PhasesTab openPhaseId={openPhaseId} onOpened={clearOpenPhase} />
                )}
            </Container>
        </main>
    )
}
