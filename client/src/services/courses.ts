import api from './api'
import type { ApiResponse, Course } from '../types'

export async function listCourses(): Promise<Course[]> {
    const res = await api.get<ApiResponse<Course[]>>('/courses')
    return res.data.data
}

export async function createCourse(fields: {
    name: string
    kind?: Course['kind']
    category?: string
    requiredHours: number
    completedHours?: number
    notes?: string
    link?: string
}): Promise<Course> {
    const res = await api.post<ApiResponse<Course>>('/courses', fields)
    return res.data.data
}

export async function updateCourse(
    id: string,
    fields: Partial<
        Pick<
            Course,
            'name' | 'kind' | 'category' | 'requiredHours' | 'completedHours' | 'order' | 'notes' | 'link'
        >
    >
): Promise<Course> {
    const res = await api.put<ApiResponse<Course>>(`/courses/${id}`, fields)
    return res.data.data
}

export async function deleteCourse(id: string): Promise<void> {
    await api.delete(`/courses/${id}`)
}
