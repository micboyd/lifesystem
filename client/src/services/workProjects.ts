import api from './api'
import type { ApiResponse, WorkProject, WorkProjectColor, WorkProjectStatus } from '../types'

export interface WorkProjectInput {
    name: string
    summary?: string
    state?: string
    status?: WorkProjectStatus
    dueDate?: string | null
    color?: WorkProjectColor
    order?: number
}

export async function listProjects(): Promise<WorkProject[]> {
    const res = await api.get<ApiResponse<WorkProject[]>>('/work/projects')
    return res.data.data
}

export async function createProject(input: WorkProjectInput): Promise<WorkProject> {
    const res = await api.post<ApiResponse<WorkProject>>('/work/projects', input)
    return res.data.data
}

export async function updateProject(
    id: string,
    input: Partial<WorkProjectInput>
): Promise<WorkProject> {
    const res = await api.put<ApiResponse<WorkProject>>(`/work/projects/${id}`, input)
    return res.data.data
}

/** The project's tasks survive as unfiled work. */
export async function deleteProject(id: string): Promise<{ detachedTasks: number }> {
    const res = await api.delete<ApiResponse<{ detachedTasks: number }>>(`/work/projects/${id}`)
    return res.data.data
}
