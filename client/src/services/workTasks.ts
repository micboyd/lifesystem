import api from './api'
import type { ApiResponse, WorkTask, WorkTaskPriority, WorkTaskStatus } from '../types'

export interface WorkTaskInput {
    title: string
    notes?: string
    status?: WorkTaskStatus
    priority?: WorkTaskPriority
    project?: string | null
    dueDate?: string | null
    source?: string
    waitingOn?: string | null
    waitingFor?: string
    order?: number
}

/**
 * 'recent' (the default) is open work plus the last month of completed tasks —
 * enough to show what you just ticked off without pulling down a year.
 */
export type TaskScope = 'open' | 'recent' | 'all'

export async function listTasks(scope: TaskScope = 'recent'): Promise<WorkTask[]> {
    const res = await api.get<ApiResponse<WorkTask[]>>('/work/tasks', { params: { scope } })
    return res.data.data
}

export async function createTask(input: WorkTaskInput): Promise<WorkTask> {
    const res = await api.post<ApiResponse<WorkTask>>('/work/tasks', input)
    return res.data.data
}

export async function updateTask(id: string, input: Partial<WorkTaskInput>): Promise<WorkTask> {
    const res = await api.put<ApiResponse<WorkTask>>(`/work/tasks/${id}`, input)
    return res.data.data
}

/** Record that you chased it today; the server stamps the date. */
export async function nudgeTask(id: string): Promise<WorkTask> {
    const res = await api.post<ApiResponse<WorkTask>>(`/work/tasks/${id}/nudge`)
    return res.data.data
}

export async function deleteTask(id: string): Promise<void> {
    await api.delete(`/work/tasks/${id}`)
}
