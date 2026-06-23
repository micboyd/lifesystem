import api from './api'
import type { ApiResponse, Goal } from '../types'

export interface GoalInput {
    title: string
    description?: string
    targetDate?: string
    progress?: number
    status?: Goal['status']
}

export async function listGoals(): Promise<Goal[]> {
    const res = await api.get<ApiResponse<Goal[]>>('/goals')
    return res.data.data
}

export async function createGoal(input: GoalInput): Promise<Goal> {
    const res = await api.post<ApiResponse<Goal>>('/goals', input)
    return res.data.data
}

export async function updateGoal(id: string, input: Partial<GoalInput>): Promise<Goal> {
    const res = await api.put<ApiResponse<Goal>>(`/goals/${id}`, input)
    return res.data.data
}

export async function deleteGoal(id: string): Promise<void> {
    await api.delete(`/goals/${id}`)
}

export async function addMilestone(goalId: string, title: string): Promise<Goal> {
    const res = await api.post<ApiResponse<Goal>>(`/goals/${goalId}/milestones`, { title })
    return res.data.data
}

export async function updateMilestone(goalId: string, milestoneId: string, fields: { title?: string; completed?: boolean }): Promise<Goal> {
    const res = await api.put<ApiResponse<Goal>>(`/goals/${goalId}/milestones/${milestoneId}`, fields)
    return res.data.data
}

export async function deleteMilestone(goalId: string, milestoneId: string): Promise<Goal> {
    const res = await api.delete<ApiResponse<Goal>>(`/goals/${goalId}/milestones/${milestoneId}`)
    return res.data.data
}
