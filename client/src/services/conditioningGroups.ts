import api from './api'
import type { ApiResponse, ConditioningGroup, ConditioningGroupColor } from '../types'

export async function listGroups(): Promise<ConditioningGroup[]> {
    const res = await api.get<ApiResponse<ConditioningGroup[]>>('/conditioning/groups')
    return res.data.data
}

export async function createGroup(fields: {
    name: string
    color?: ConditioningGroupColor
}): Promise<ConditioningGroup> {
    const res = await api.post<ApiResponse<ConditioningGroup>>('/conditioning/groups', fields)
    return res.data.data
}

export async function updateGroup(
    id: string,
    fields: Partial<Pick<ConditioningGroup, 'name' | 'color' | 'order'>>
): Promise<ConditioningGroup> {
    const res = await api.put<ApiResponse<ConditioningGroup>>(`/conditioning/groups/${id}`, fields)
    return res.data.data
}

export async function deleteGroup(id: string): Promise<void> {
    await api.delete(`/conditioning/groups/${id}`)
}
