import api from './api'
import type { ApiResponse, Birthday } from '../types'

export async function listBirthdays(): Promise<Birthday[]> {
    const res = await api.get<ApiResponse<Birthday[]>>('/birthdays')
    return res.data.data
}

export async function createBirthday(name: string, date: string): Promise<Birthday> {
    const res = await api.post<ApiResponse<Birthday>>('/birthdays', { name, date })
    return res.data.data
}

export async function updateBirthday(id: string, name: string, date: string): Promise<Birthday> {
    const res = await api.put<ApiResponse<Birthday>>(`/birthdays/${id}`, { name, date })
    return res.data.data
}

export async function deleteBirthday(id: string): Promise<void> {
    await api.delete(`/birthdays/${id}`)
}
