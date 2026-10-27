import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Container from '../components/Container'
import Tabs from '../components/Tabs'
import Spinner from '../components/Spinner'
import NutritionPlanner from '../components/nutrition/NutritionPlanner'
import { LARGE_QUERY, useMediaQuery } from '../components/planner/WeekPlannerUI'
import MealLibrary from '../components/nutrition/MealLibrary'
import BoxLibrary from '../components/nutrition/BoxLibrary'
import Pantry from '../components/nutrition/Pantry'
import NutritionStats from '../components/nutrition/NutritionStats'
import PhasesTab from '../components/nutrition/PhasesTab'
import { ShoppingDrawer, ShoppingPill, useShopping } from '../components/nutrition/ShoppingList'
import { useAuth } from '../context/AuthContext'
import { listMeals } from '../services/meals'
import { listPlateFoods } from '../services/plateFoods'
import type { Meal, PlateFood } from '../types'

const TABS = ['Planner', 'Pantry', 'Library', 'Stats', 'Phases'] as const
type Tab = (typeof TABS)[number]

const LIBRARY_TABS = ['Meals', 'Boxes & foods'] as const
type LibraryTab = (typeof LIBRARY_TABS)[number]

const SUBTITLE: Record<Tab, string> = {
    Planner: 'Plan your meals — drop them into each day, then tick them off as you eat.',
    Pantry: 'What’s cooked and in the fridge — how much is left, and how much is planned.',
    Library: 'Your meals, the boxes you batch-cook, and foods you weigh out.',
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
    const [foods, setFoods] = useState<PlateFood[]>([])
    const [loading, setLoading] = useState(true)
    const reloadMeals = useCallback(() => listMeals().then(setMeals), [])
    const reloadFoods = useCallback(() => listPlateFoods().then(setFoods), [])
    useEffect(() => {
        Promise.all([reloadMeals(), reloadFoods().catch(() => {})]).finally(() => setLoading(false))
    }, [reloadMeals, reloadFoods])

    // The Library is split: saved meals, and the boxes and foods plates are weighed from.
    const [library, setLibrary] = useState<LibraryTab>('Meals')
    const shopping = useShopping()
    const [shoppingOpen, setShoppingOpen] = useState(false)

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
                    <ShoppingPill list={shopping.list} onOpen={() => setShoppingOpen(true)} />
                </header>

                <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setTab(t as Tab)} className="self-start" />
            </Container>

            <Container fluid={fluid} className="mt-6">
                {loading && (tab === 'Planner' || tab === 'Pantry' || tab === 'Library') ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : tab === 'Planner' ? (
                    <NutritionPlanner
                        meals={meals}
                        foods={foods}
                        settingsGoals={user?.settings?.macroGoals}
                        onOpenPantry={() => setTab('Pantry')}
                    />
                ) : tab === 'Pantry' ? (
                    <Pantry foods={foods} onChanged={reloadFoods} />
                ) : tab === 'Library' ? (
                    <div className="flex flex-col gap-6">
                        <Tabs
                            tabs={[...LIBRARY_TABS]}
                            value={library}
                            onChange={(t) => setLibrary(t as LibraryTab)}
                            className="self-start"
                        />
                        {library === 'Meals' ? (
                            <MealLibrary meals={meals} onChanged={reloadMeals} onShop={shopping.add} />
                        ) : (
                            <BoxLibrary foods={foods} onChanged={reloadFoods} onShop={shopping.add} />
                        )}
                    </div>
                ) : tab === 'Stats' ? (
                    <NutritionStats settingsGoals={user?.settings?.macroGoals} />
                ) : (
                    <PhasesTab openPhaseId={openPhaseId} onOpened={clearOpenPhase} />
                )}
            </Container>

            <ShoppingDrawer
                open={shoppingOpen}
                onClose={() => setShoppingOpen(false)}
                list={shopping.list}
                onChange={shopping.setList}
            />
        </main>
    )
}
