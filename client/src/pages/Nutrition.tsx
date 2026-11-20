import { useCallback, useEffect, useState } from 'react'
import ModuleLayout from '../components/ModuleLayout'
import { BarButton, ModuleBar } from '../components/Blok'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import NutritionPlanner from '../components/nutrition/NutritionPlanner'
import { LARGE_QUERY, useMediaQuery } from '../components/planner/WeekPlannerUI'
import MealLibrary from '../components/nutrition/MealLibrary'
import NutritionStats from '../components/nutrition/NutritionStats'
import PhasesTab from '../components/nutrition/PhasesTab'
import { useShopping } from '../components/nutrition/ShoppingList'
import { useAuth } from '../context/AuthContext'
import { listMeals } from '../services/meals'
import type { Meal } from '../types'

const TABS = ['Planner', 'Thinking ahead', 'Library', 'Plans', 'Stats'] as const
type Tab = (typeof TABS)[number]

/** Thinking ahead isn't a tab any more: it opens full screen. */
const AHEAD = '/nutrition/thinking-ahead'

const TAB_ICONS: Record<Tab, string> = {
    Planner: 'fa-solid fa-table-cells',
    'Thinking ahead': 'fa-solid fa-basket-shopping',
    Library: 'fa-solid fa-book-open',
    Plans: 'fa-solid fa-file-lines',
    Stats: 'fa-solid fa-chart-column',
}


export default function Nutrition() {
    const { user } = useAuth()
    const navigate = useNavigate()

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
    void isLarge

    return (
        <>
        <ModuleBar
            title="Nutrition"
            actions={
                <BarButton solid arrow to={AHEAD}>
                    Shopping list
                </BarButton>
            }
        />
        <ModuleLayout
            asideLabel="Meals"
            sectionsLabel="Nutrition sections"
            sections={TABS.map((t) => ({ label: t, icon: TAB_ICONS[t], active: t === tab, onClick: () => (t === 'Thinking ahead' ? navigate(AHEAD) : setTab(t)) }))}
        >
        <main className="px-5 pb-24 pt-10 sm:px-10">
            <div>

                {loading && (tab === 'Planner' || tab === 'Library') ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : tab === 'Planner' ? (
                    <NutritionPlanner
                        meals={meals}
                        settingsGoals={user?.settings?.macroGoals}
                        onMealsChanged={reloadMeals}
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
            </div>
        </main>
        </ModuleLayout>
        </>
    )
}
