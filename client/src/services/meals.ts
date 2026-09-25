import api from './api'
import type { ApiResponse, Meal, MealInput } from '../types'

/** The whole library, in order. */
export async function listMeals(): Promise<Meal[]> {
    const res = await api.get<ApiResponse<Meal[]>>('/meals')
    return res.data.data
}

export async function createMeal(fields: MealInput): Promise<Meal> {
    const res = await api.post<ApiResponse<Meal>>('/meals', fields)
    return res.data.data
}

/** Also updates the meal on days where it's still only planned. */
export async function updateMeal(id: string, fields: MealInput): Promise<Meal> {
    const res = await api.put<ApiResponse<Meal>>(`/meals/${id}`, fields)
    return res.data.data
}

export async function deleteMeal(id: string): Promise<void> {
    await api.delete(`/meals/${id}`)
}

/** Add meals in bulk from JSON: [{ name, types, macros }]. */
export async function importMeals(meals: unknown[]): Promise<{ created: number; skipped: number }> {
    const res = await api.post<ApiResponse<{ created: number; skipped: number }>>('/meals/import', meals)
    return res.data.data
}
