import api from './api'
import type { ApiResponse, SavingsTarget } from '../types'

export type SavingsTargetInput = Omit<SavingsTarget, '_id' | 'createdAt' | 'updatedAt'>

export async function listSavingsTargets(): Promise<SavingsTarget[]> {
    const res = await api.get<ApiResponse<SavingsTarget[]>>('/savings-targets')
    return res.data.data
}

export async function createSavingsTarget(input: SavingsTargetInput): Promise<SavingsTarget> {
    const res = await api.post<ApiResponse<SavingsTarget>>('/savings-targets', input)
    return res.data.data
}

export async function renameSavingsTarget(id: string, name: string): Promise<SavingsTarget> {
    const res = await api.put<ApiResponse<SavingsTarget>>(`/savings-targets/${id}`, { name })
    return res.data.data
}

export async function deleteSavingsTarget(id: string): Promise<void> {
    await api.delete(`/savings-targets/${id}`)
}
