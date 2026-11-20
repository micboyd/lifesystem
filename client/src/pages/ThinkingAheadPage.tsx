import { useEffect, useState } from 'react'
import Spinner from '../components/Spinner'
import ThinkingAhead from '../components/nutrition/ThinkingAhead'
import { useShopping } from '../components/nutrition/ShoppingList'
import { listMeals } from '../services/meals'
import type { Meal } from '../types'

/** Nutrition → Thinking ahead, on its own: the whole screen, no app shell. */
export default function ThinkingAheadPage() {
    const [meals, setMeals] = useState<Meal[] | null>(null)
    const shopping = useShopping()

    useEffect(() => {
        listMeals()
            .then(setMeals)
            .catch(() => setMeals([]))
    }, [])

    if (!meals) {
        return (
            <div className="grid min-h-dvh place-items-center bg-canvas">
                <Spinner />
            </div>
        )
    }
    return <ThinkingAhead meals={meals} list={shopping.list} onChange={shopping.setList} />
}
