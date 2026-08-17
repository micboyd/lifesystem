import api from './api'
import type { ApiResponse, LifePlan, LifePlanInput, SeasonInput, SeasonReview } from '../types'

export async function listLifePlans(): Promise<LifePlan[]> {
    const res = await api.get<ApiResponse<LifePlan[]>>('/life-plans')
    return res.data.data
}

export async function createLifePlan(input: LifePlanInput): Promise<LifePlan> {
    const res = await api.post<ApiResponse<LifePlan>>('/life-plans', input)
    return res.data.data
}

export async function updateLifePlan(id: string, input: LifePlanInput): Promise<LifePlan> {
    const res = await api.put<ApiResponse<LifePlan>>(`/life-plans/${id}`, input)
    return res.data.data
}

export async function deleteLifePlan(id: string): Promise<void> {
    await api.delete(`/life-plans/${id}`)
}

// Season writes all return the whole plan: seasons are re-sorted server-side on
// every change, so the plan is the only trustworthy thing to render from.

export async function createSeason(planId: string, input: SeasonInput): Promise<LifePlan> {
    const res = await api.post<ApiResponse<LifePlan>>(`/life-plans/${planId}/seasons`, input)
    return res.data.data
}

export async function updateSeason(
    planId: string,
    seasonId: string,
    input: SeasonInput
): Promise<LifePlan> {
    const res = await api.put<ApiResponse<LifePlan>>(
        `/life-plans/${planId}/seasons/${seasonId}`,
        input
    )
    return res.data.data
}

export async function deleteSeason(planId: string, seasonId: string): Promise<LifePlan> {
    const res = await api.delete<ApiResponse<LifePlan>>(
        `/life-plans/${planId}/seasons/${seasonId}`
    )
    return res.data.data
}

export async function saveSeasonReview(
    planId: string,
    seasonId: string,
    review: SeasonReview
): Promise<LifePlan> {
    const res = await api.put<ApiResponse<LifePlan>>(
        `/life-plans/${planId}/seasons/${seasonId}/review`,
        review
    )
    return res.data.data
}
