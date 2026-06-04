import api from './api'
import type { ApiResponse, Task } from '../types'

export async function listTasks(from: string, to: string): Promise<Task[]> {
    const res = await api.get<ApiResponse<Task[]>>('/tasks', { params: { from, to } })
    return res.data.data
}

export async function createTask(date: string, title: string): Promise<Task> {
    const res = await api.post<ApiResponse<Task>>('/tasks', { date, title })
    return res.data.data
}

export async function updateTask(
    id: string,
    fields: Partial<Pick<Task, 'title' | 'completed' | 'order'>>
): Promise<Task> {
    const res = await api.put<ApiResponse<Task>>(`/tasks/${id}`, fields)
    return res.data.data
}

export async function deleteTask(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`)
}
