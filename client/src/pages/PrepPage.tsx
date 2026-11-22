import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Prep from '../components/nutrition/Prep'
import { listMeals } from '../services/meals'
import { getShopping } from '../services/shopping'
import type { Meal, ShoppingList } from '../types'

/** Nutrition → Prep, on its own: the whole screen, no app shell. `?from=&to=` picks the days. */
export default function PrepPage() {
    const [params] = useSearchParams()
    const [meals, setMeals] = useState<Meal[] | null>(null)
    const [list, setList] = useState<ShoppingList | null>(null)

    useEffect(() => {
        listMeals()
            .then(setMeals)
            .catch(() => setMeals([]))
        getShopping()
            .then(setList)
            .catch(() => setList({ groups: [], ticked: [] }))
    }, [])

    if (!meals || !list) {
        return (
            <div className="grid min-h-dvh place-items-center bg-canvas">
                <Spinner />
            </div>
        )
    }
    return (
        <Prep
            meals={meals}
            list={list}
            onChange={setList}
            asked={{ from: params.get('from'), to: params.get('to') }}
        />
    )
}
