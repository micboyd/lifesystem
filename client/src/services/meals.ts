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

/** Bulk-import meals from a parsed JSON document. Returns the created meals. */
export async function importMeals(meals: unknown): Promise<Meal[]> {
    const res = await api.post<ApiResponse<Meal[]>>('/meals/import', meals)
    return res.data.data
}
