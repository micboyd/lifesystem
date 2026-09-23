import api from './api'
import type {
    ApiResponse,
    BatchStorage,
    BuffetRole,
    Food,
    FoodBatch,
    Macros,
    MealPlanEntry,
    MealType,
    PrepCategory,
    PrepContainer,
    PrepIngredient,
    PrepRecipe,
    StockMovement,
} from '../types'

/** A fresh idempotency key: a retried request carrying it is applied once. */
export function requestKey(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// ── Recipes ──────────────────────────────────────────────────────────────────

/** A blank or null clears an optional setting. */
type Clearable<T> = T | '' | null

export interface RecipeInput {
    name?: string
    category?: PrepCategory
    ingredients?: PrepIngredient[]
    instructions?: string
    prepMinutes?: Clearable<number>
    estimatedYieldGrams?: Clearable<number>
    usualPortionGrams?: Clearable<number>
    lowStock?: PrepRecipe['lowStock'] | null
    leadDays?: Clearable<number>
    favourite?: boolean
    archived?: boolean
}

export async function listRecipes(): Promise<PrepRecipe[]> {
    const res = await api.get<ApiResponse<PrepRecipe[]>>('/meal-prep/recipes')
    return res.data.data
}

export async function createRecipe(fields: RecipeInput): Promise<PrepRecipe> {
    const res = await api.post<ApiResponse<PrepRecipe>>('/meal-prep/recipes', fields)
    return res.data.data
}

export async function updateRecipe(id: string, fields: RecipeInput): Promise<PrepRecipe> {
    const res = await api.put<ApiResponse<PrepRecipe>>(`/meal-prep/recipes/${id}`, fields)
    return res.data.data
}

export async function duplicateRecipe(id: string): Promise<PrepRecipe> {
    const res = await api.post<ApiResponse<PrepRecipe>>(`/meal-prep/recipes/${id}/duplicate`)
    return res.data.data
}

export async function archiveRecipe(id: string): Promise<void> {
    await api.delete(`/meal-prep/recipes/${id}`)
}

// ── Batches ──────────────────────────────────────────────────────────────────

export async function listBatches(all = false): Promise<FoodBatch[]> {
    const res = await api.get<ApiResponse<FoodBatch[]>>('/meal-prep/batches', {
        params: all ? { status: 'all' } : {},
    })
    return res.data.data
}

export interface CookInput {
    recipe: string
    cookedDate: string
    ingredients: PrepIngredient[]
    cookedGrams?: number
    weighing?: { grossGrams: number; containerGrams: number; containerName?: string }
    storage: BatchStorage
    label?: string
    useBy?: string
    thawedDate?: string
    requestId: string
}

export async function cookBatch(input: CookInput): Promise<FoodBatch> {
    const res = await api.post<ApiResponse<FoodBatch>>('/meal-prep/batches', input)
    return res.data.data
}

export async function updateBatch(
    id: string,
    fields: { label?: string; useBy?: string; thawedDate?: string }
): Promise<FoodBatch> {
    const res = await api.patch<ApiResponse<FoodBatch>>(`/meal-prep/batches/${id}`, fields)
    return res.data.data
}

export type AdjustInput =
    | { kind: 'others'; grams: number }
    | { kind: 'discard'; grams?: number; all?: boolean }
    | { kind: 'correction'; remainingGrams: number }
    | { kind: 'move'; storage: BatchStorage }
    | { kind: 'finish' }

export async function adjustBatch(
    id: string,
    input: AdjustInput & { date: string; note?: string; requestId: string }
): Promise<FoodBatch> {
    const res = await api.post<ApiResponse<FoodBatch>>(`/meal-prep/batches/${id}/adjust`, input)
    return res.data.data
}

export async function listMovements(id: string): Promise<StockMovement[]> {
    const res = await api.get<ApiResponse<StockMovement[]>>(`/meal-prep/batches/${id}/movements`)
    return res.data.data
}

// ── Foods & containers ───────────────────────────────────────────────────────

/** Blank density or item weight clears it. */
export type FoodInput = Partial<Omit<Food, '_id' | 'density' | 'unitGrams'>> & {
    density?: number | ''
    unitGrams?: number | ''
}

export async function listFoods(): Promise<Food[]> {
    const res = await api.get<ApiResponse<Food[]>>('/meal-prep/foods')
    return res.data.data
}

export async function createFood(fields: FoodInput): Promise<Food> {
    const res = await api.post<ApiResponse<Food>>('/meal-prep/foods', fields)
    return res.data.data
}

export async function updateFood(id: string, fields: FoodInput): Promise<Food> {
    const res = await api.put<ApiResponse<Food>>(`/meal-prep/foods/${id}`, fields)
    return res.data.data
}

export async function archiveFood(id: string): Promise<void> {
    await api.delete(`/meal-prep/foods/${id}`)
}

export async function listContainers(): Promise<PrepContainer[]> {
    const res = await api.get<ApiResponse<PrepContainer[]>>('/meal-prep/containers')
    return res.data.data
}

export async function createContainer(name: string, grams: number): Promise<PrepContainer> {
    const res = await api.post<ApiResponse<PrepContainer>>('/meal-prep/containers', { name, grams })
    return res.data.data
}

export async function deleteContainer(id: string): Promise<void> {
    await api.delete(`/meal-prep/containers/${id}`)
}

// ── Buffet meals (they live in the meal plan) ────────────────────────────────

/** A plate component as the forms send it; the server recomputes all figures. */
export interface ComponentInput {
    _id?: string
    role: BuffetRole
    batch?: string
    recipe?: string
    food?: string
    /** A one-off label: name and per-100 g figures, for a packaged side. */
    label?: { name: string; per100: Macros }
    plannedGrams?: number
    grams?: number
    /** Planning a recipe with no cooked weight yet needs a guess at one. */
    estimatedYieldGrams?: number
}

export async function createBuffetEntry(
    date: string,
    slot: MealType,
    buffet: { name?: string; components: ComponentInput[]; status?: 'planned' | 'eaten'; clientKey?: string }
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>('/meal-plan', { date, slot, buffet })
    return res.data.data
}

export async function updateBuffetPlan(
    id: string,
    body: { name?: string; components: ComponentInput[]; rev: number }
): Promise<MealPlanEntry> {
    const res = await api.put<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}/buffet`, body)
    return res.data.data
}

export async function logBuffet(
    id: string,
    body: { name?: string; components: ComponentInput[]; rev: number }
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}/log`, body)
    return res.data.data
}

export async function unlogBuffet(
    id: string,
    body: { status: 'planned' | 'skipped'; rev: number }
): Promise<MealPlanEntry> {
    const res = await api.post<ApiResponse<MealPlanEntry>>(`/meal-plan/${id}/unlog`, body)
    return res.data.data
}

/** The structured part of a refusal from the buffet endpoints. */
export interface BuffetApiError {
    message: string
    code?: 'INSUFFICIENT_STOCK' | 'BATCH_INACTIVE' | 'STALE' | 'UNRESOLVED' | 'NEEDS_YIELD' | 'CONFLICT' | 'INVALID_GRAMS' | 'USE_LOG'
    shortfalls?: { batchId: string; name?: string; remainingGrams: number; neededGrams: number }[]
    recipe?: string
    data?: MealPlanEntry
}

export function buffetError(err: unknown): BuffetApiError {
    const data = (err as { response?: { data?: BuffetApiError } })?.response?.data
    if (data && typeof data.message === 'string') return data
    return { message: 'Could not save that — check your connection and try again' }
}
