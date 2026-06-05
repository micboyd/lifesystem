import api from './api'
import type { ApiResponse, User, UserSettings } from '../types'

export async function updateProfile(name: string, email: string): Promise<User> {
    const res = await api.put<ApiResponse<User>>('/users/me', { name, email })
    return res.data.data
}

export async function updateSettings(settings: UserSettings): Promise<User> {
    const res = await api.put<ApiResponse<User>>('/users/me/settings', settings)
    return res.data.data
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.put('/users/me/password', { currentPassword, newPassword })
}
