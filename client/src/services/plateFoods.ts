import api from './api'
import type { ApiResponse, BoxCook, Ingredient, PlateFood, PlateFoodInput } from '../types'

/** Boxes and plain foods, each box with its open batches and latest cook. */
export async function listPlateFoods(): Promise<PlateFood[]> {
    const res = await api.get<ApiResponse<PlateFood[]>>('/plate-foods')
    return res.data.data
}

export async function createPlateFood(fields: PlateFoodInput): Promise<void> {
    await api.post('/plate-foods', fields)
}

/** A plain food's new macros also reach plates still planned. */
export async function updatePlateFood(id: string, fields: PlateFoodInput): Promise<void> {
    await api.put(`/plate-foods/${id}`, fields)
}

export async function deletePlateFood(id: string): Promise<void> {
    await api.delete(`/plate-foods/${id}`)
}

/** "Cooked a box". `finishOpen` marks the box's earlier batches as finished. */
export async function cookBox(fields: {
    food: string
    date: string
    ingredients: Ingredient[]
    cookedGrams: number
    finishOpen: boolean
}): Promise<BoxCook> {
    const res = await api.post<ApiResponse<BoxCook>>('/box-cooks', fields)
    return res.data.data
}

export async function setCookFinished(id: string, finished: boolean): Promise<void> {
    await api.patch(`/box-cooks/${id}`, { finished })
}

export async function deleteCook(id: string): Promise<void> {
    await api.delete(`/box-cooks/${id}`)
}
