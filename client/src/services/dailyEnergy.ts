import api from './api'
import type { ApiResponse, DailyEnergy } from '../types'

/** Burn figures in [start, end] (inclusive), oldest first. Both bounds optional. */
export async function listDailyEnergy(start?: string, end?: string): Promise<DailyEnergy[]> {
    const res = await api.get<ApiResponse<DailyEnergy[]>>('/daily-energy', {
        params: start || end ? { start, end } : undefined,
    })
    return res.data.data
}

/** Record a day's total burn, replacing whatever was there. */
export async function saveDailyEnergy(
    date: string,
    caloriesOut: number,
    notes?: string
): Promise<DailyEnergy> {
    const res = await api.post<ApiResponse<DailyEnergy>>('/daily-energy', {
        date,
        caloriesOut,
        notes,
    })
    return res.data.data
}

/**
 * Clear a day's typed figure. Returns the row as it now stands — back on
 * Garmin's figure — or null when there's no Garmin figure and the day is unknown.
 */
export async function deleteDailyEnergy(date: string): Promise<DailyEnergy | null> {
    const res = await api.delete<ApiResponse<DailyEnergy | null>>(`/daily-energy/${date}`)
    return res.data.data ?? null
}
