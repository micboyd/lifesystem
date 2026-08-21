import api from './api'
import type { ApiResponse, BodyMeasurements, WeightLog } from '../types'

/**
 * One weigh-in as it is sent. Every measurement is optional and every omitted
 * one is *cleared* server-side, so a partial payload is a deliberate erasure —
 * send what the reading actually contained.
 */
export interface WeightLogPayload extends BodyMeasurements {
    /** "YYYY-MM-DD" — the day the reading was taken. */
    date: string
    /** Bodyweight in kilograms. */
    weight: number
    /** Waist in centimetres; omit or send undefined to clear. */
    waist?: number
    /** Body fat percentage; omit or send undefined to clear. */
    bodyFat?: number
    notes?: string
}

/** List weigh-ins oldest-first, optionally from `since` (YYYY-MM-DD) onwards. */
export async function listWeightLogs(since?: string): Promise<WeightLog[]> {
    const res = await api.get<ApiResponse<WeightLog[]>>('/weight-logs', {
        params: since ? { since } : undefined,
    })
    return res.data.data
}

/** Record a weigh-in, replacing any existing reading for the same date. */
export async function saveWeightLog(payload: WeightLogPayload): Promise<WeightLog> {
    const res = await api.post<ApiResponse<WeightLog>>('/weight-logs', payload)
    return res.data.data
}

export async function deleteWeightLog(id: string): Promise<void> {
    await api.delete(`/weight-logs/${id}`)
}
