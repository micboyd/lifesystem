import api from './api'
import { importBody, importResult, type ImportResult, type OverwriteMap } from './imports'
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

/**
 * Import one or many trays (boxes) with their ingredients. A tray carrying a
 * `cookedGrams` has that cook logged too. Name clashes the user chose to
 * overwrite have their ingredients replaced in place.
 */
export async function importTrays(trays: unknown, overwrite?: OverwriteMap): Promise<ImportResult> {
    const res = await api.post<ApiResponse<PlateFood[]> & { updated?: number }>(
        '/plate-foods/import',
        importBody(trays, overwrite)
    )
    return importResult(res.data.data, res.data)
}

/** The pantry: open batches newest first, then the latest finished ones. */
export async function listCooks(): Promise<{ open: BoxCook[]; finished: BoxCook[] }> {
    const res = await api.get<ApiResponse<{ open: BoxCook[]; finished: BoxCook[] }>>('/box-cooks')
    return res.data.data
}

/**
 * "Cooked a box". `finishOpen` marks the box's earlier batches in use as
 * finished; `frozen` puts the new batch straight in the freezer.
 */
export async function cookBox(fields: {
    food: string
    date: string
    ingredients: Ingredient[]
    /** One weight per batch — each goes in the pantry as its own batch. */
    cookedGrams: number[]
    finishOpen: boolean
    /** Per batch: whether it goes straight in the freezer. */
    frozen: boolean[]
}): Promise<BoxCook[]> {
    const res = await api.post<ApiResponse<BoxCook[]>>('/box-cooks', fields)
    return res.data.data
}

export async function setCookFinished(id: string, finished: boolean): Promise<void> {
    await api.patch(`/box-cooks/${id}`, { finished })
}

/** Into the freezer, or out of it (`thawed` = the day it came out). */
export async function setCookFrozen(id: string, frozen: boolean, thawed?: string): Promise<void> {
    await api.patch(`/box-cooks/${id}`, { frozen, ...(thawed ? { thawed } : {}) })
}

export async function deleteCook(id: string): Promise<void> {
    await api.delete(`/box-cooks/${id}`)
}
