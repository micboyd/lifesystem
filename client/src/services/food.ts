import api from './api'
import type {
    ApiResponse,
    Batch,
    EntryStatus,
    FoodEntry,
    FoodEntryUnit,
    RecipeIngredient,
    Macros,
    MealType,
    Recipe,
} from '../types'

// ── Recipes ──────────────────────────────────────────────────────────────────

export async function listRecipes(includeArchived = false): Promise<Recipe[]> {
    const res = await api.get<ApiResponse<Recipe[]>>('/recipes', {
        params: includeArchived ? { archived: 1 } : {},
    })
    return res.data.data
}

/** Every ingredient used before, with its latest label figures, for autofill. */
export async function listIngredients(): Promise<RecipeIngredient[]> {
    const res = await api.get<ApiResponse<RecipeIngredient[]>>('/recipes/ingredients')
    return res.data.data
}

// ── Batches ──────────────────────────────────────────────────────────────────

export async function listBatches(includeArchived = false): Promise<Batch[]> {
    const res = await api.get<ApiResponse<Batch[]>>('/batches', {
        params: includeArchived ? { archived: 1 } : {},
    })
    return res.data.data
}

/** "I cooked this": copies the recipe; anything passed overrides it for this cook. */
export async function createBatch(
    fields: { recipe?: string } & Partial<Omit<Batch, '_id' | 'recipe'>>
): Promise<Batch> {
    const res = await api.post<ApiResponse<Batch>>('/batches', fields)
    return res.data.data
}

/** Pass `null` for a weight to clear it. */
export async function updateBatch(
    id: string,
    fields: Partial<Omit<Batch, 'cookedGrams' | 'estimatedCookedGrams'>> & {
        cookedGrams?: number | null
        estimatedCookedGrams?: number | null
    }
): Promise<Batch> {
    const res = await api.patch<ApiResponse<Batch>>(`/batches/${id}`, fields)
    return res.data.data
}

// ── Day lines ────────────────────────────────────────────────────────────────

export async function listFoodEntries(start: string, end: string): Promise<FoodEntry[]> {
    const res = await api.get<ApiResponse<FoodEntry[]>>('/food-entries', {
        params: { start, end },
    })
    return res.data.data
}

export type NewFoodEntry = {
    date: string
    slot: MealType
    status?: EntryStatus
} & (
    | { batch: string; amount: number; unit: FoodEntryUnit }
    | { recipe: string; amount: number; unit: FoodEntryUnit }
    | { name: string; macros: Macros }
)

export async function addFoodEntry(entry: NewFoodEntry): Promise<FoodEntry> {
    const res = await api.post<ApiResponse<FoodEntry>>('/food-entries', entry)
    return res.data.data
}

/**
 * Tick off, move, or change the amount. A new amount in the same unit scales the
 * line's own figures; `restamp: true` recalculates from its batch or recipe.
 */
export async function updateFoodEntry(
    id: string,
    fields: Partial<Pick<FoodEntry, 'date' | 'slot' | 'status' | 'amount' | 'unit' | 'name' | 'macros'>> & {
        restamp?: boolean
    }
): Promise<FoodEntry> {
    const res = await api.patch<ApiResponse<FoodEntry>>(`/food-entries/${id}`, fields)
    return res.data.data
}

export async function deleteFoodEntry(id: string): Promise<void> {
    await api.delete(`/food-entries/${id}`)
}

/** Repeat lines as planned — one meal (with `slot`), a day, or a week. */
export async function copyFoodEntries(body: {
    fromStart: string
    fromEnd: string
    toStart: string
    slot?: MealType
}): Promise<FoodEntry[]> {
    const res = await api.post<ApiResponse<FoodEntry[]>>('/food-entries/copy', body)
    return res.data.data
}
