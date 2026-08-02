import api from './api'
import type { ApiResponse, Meal, MealType } from '../types'

/** Fields the create/update endpoints accept. */
export interface MealInput {
    name: string
    types?: Meal['types']
    servings?: number
    servingLabel?: string
    macros?: Meal['macros']
    ingredients?: Meal['ingredients']
    method?: Meal['method']
    notes?: string
    link?: string
}

/** The server's paginated list envelope: meals plus page metadata. */
interface MealListResponse extends ApiResponse<Meal[]> {
    page: number
    pages: number
    total: number
}

/** One page of the meal library. */
export interface MealsPage {
    meals: Meal[]
    page: number
    pages: number
    total: number
}

/** The whole library in one go — used where every meal is needed (e.g. the planner). */
export async function listMeals(): Promise<Meal[]> {
    const res = await api.get<MealListResponse>('/meals', { params: { all: 1 } })
    return res.data.data
}

/**
 * A single page of the library (18 per page), optionally filtered by meal type
 * and/or a name search term (case-insensitive substring).
 */
export async function listMealsPage(
    page: number,
    type?: MealType,
    search?: string
): Promise<MealsPage> {
    const res = await api.get<MealListResponse>('/meals', {
        params: { page, type, search: search?.trim() || undefined },
    })
    const { data, page: p, pages, total } = res.data
    return { meals: data, page: p, pages, total }
}

export async function createMeal(fields: MealInput): Promise<Meal> {
    const res = await api.post<ApiResponse<Meal>>('/meals', fields)
    return res.data.data
}

export async function updateMeal(
    id: string,
    fields: Partial<MealInput & Pick<Meal, 'order'>>
): Promise<Meal> {
    const res = await api.put<ApiResponse<Meal>>(`/meals/${id}`, fields)
    return res.data.data
}

export async function deleteMeal(id: string): Promise<void> {
    await api.delete(`/meals/${id}`)
}

/** Outcome of an import: how many meals were created, overwritten and skipped. */
export interface ImportResult {
    created: number
    updated: number
    skipped: number
    /** The meals that were created or overwritten. */
    meals: Meal[]
}

/** The import response envelope: the standard data plus per-outcome counts. */
interface ImportResponse extends ApiResponse<Meal[]> {
    created: number
    updated: number
    skipped: number
}

/**
 * Bulk-import meals from a parsed JSON document.
 *
 * `overwrite` lists the names (case-insensitive) of duplicate meals that should
 * replace the existing library entry; duplicates not listed are skipped.
 */
export async function importMeals(meals: unknown[], overwrite: string[] = []): Promise<ImportResult> {
    const res = await api.post<ImportResponse>('/meals/import', { meals, overwrite })
    const { created, updated, skipped, data } = res.data
    return { created, updated, skipped, meals: data }
}

/** The fields worth keeping when exporting a meal — i.e. everything but server bookkeeping. */
const EXPORT_KEYS = [
    'name',
    'types',
    'servings',
    'servingLabel',
    'macros',
    'ingredients',
    'method',
    'notes',
    'link',
] as const

/**
 * Serialise meals into the same shape the importer accepts — a pretty-printed
 * JSON array, stripped of ids, ordering and timestamps — so an export can be
 * edited and re-imported cleanly.
 */
export function mealsToExportJson(meals: Meal[]): string {
    const clean = meals.map((m) => {
        const out: Record<string, unknown> = {}
        for (const key of EXPORT_KEYS) {
            const value = (m as unknown as Record<string, unknown>)[key]
            if (value !== undefined && value !== '') out[key] = value
        }
        return out
    })
    return JSON.stringify(clean, null, 2)
}
