import { useCallback, useEffect, useState } from 'react'
import { listBatches, listContainers, listFoods, listRecipes } from '../../../services/mealPrep'
import type { Food, FoodBatch, PrepContainer, PrepRecipe } from '../../../types'

export interface MealPrepData {
    recipes: PrepRecipe[]
    /** Active batches only — finished and discarded ones are history. */
    batches: FoodBatch[]
    foods: Food[]
    containers: PrepContainer[]
    loading: boolean
    reload: () => Promise<void>
    /** Swap one batch in place after an adjustment, without a round trip. */
    putBatch: (batch: FoodBatch) => void
}

function fetchAll() {
    return Promise.all([
        listRecipes().catch(() => [] as PrepRecipe[]),
        listBatches().catch(() => [] as FoodBatch[]),
        listFoods().catch(() => [] as Food[]),
        listContainers().catch(() => [] as PrepContainer[]),
    ])
}

/**
 * The meal-prep library, loaded once per view. The planner, the Today tab and
 * the Meal Prep tab each need the same four lists to offer foods and forecast
 * stock; this keeps them loading them the same way. Fails soft to empty lists —
 * an unreachable meal-prep endpoint must never blank the planner.
 */
export function useMealPrep(): MealPrepData {
    const [recipes, setRecipes] = useState<PrepRecipe[]>([])
    const [batches, setBatches] = useState<FoodBatch[]>([])
    const [foods, setFoods] = useState<Food[]>([])
    const [containers, setContainers] = useState<PrepContainer[]>([])
    const [loading, setLoading] = useState(true)

    const apply = useCallback(([r, b, f, c]: Awaited<ReturnType<typeof fetchAll>>) => {
        setRecipes(r)
        setBatches(b)
        setFoods(f)
        setContainers(c)
        setLoading(false)
    }, [])

    const reload = useCallback(() => fetchAll().then(apply), [apply])

    useEffect(() => {
        let active = true
        fetchAll().then((data) => active && apply(data))
        return () => {
            active = false
        }
    }, [apply])

    const putBatch = useCallback((batch: FoodBatch) => {
        setBatches((prev) =>
            batch.status === 'active'
                ? prev.some((b) => b._id === batch._id)
                    ? prev.map((b) => (b._id === batch._id ? batch : b))
                    : [...prev, batch]
                : prev.filter((b) => b._id !== batch._id)
        )
    }, [])

    return { recipes, batches, foods, containers, loading, reload, putBatch }
}
