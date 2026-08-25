import api from './api'
import type { ApiResponse, Person, Relationship } from '../types'

export interface PersonInput {
    name: string
    role?: string
    team?: string
    relationship?: Relationship
    notes?: string
    archived?: boolean
}

export async function listPeople(includeArchived = false): Promise<Person[]> {
    const res = await api.get<ApiResponse<Person[]>>('/work/people', {
        params: includeArchived ? { includeArchived: '1' } : undefined,
    })
    return res.data.data
}

/**
 * Creating a name that already exists returns the existing person (and
 * un-archives them), so the inline "add someone" path in the pickers can't
 * quietly produce a second Sarah.
 */
export async function createPerson(input: PersonInput): Promise<Person> {
    const res = await api.post<ApiResponse<Person>>('/work/people', input)
    return res.data.data
}

export async function updatePerson(id: string, input: Partial<PersonInput>): Promise<Person> {
    const res = await api.put<ApiResponse<Person>>(`/work/people/${id}`, input)
    return res.data.data
}

/** Rejected with a 409 while open items are still waiting on them. */
export async function deletePerson(id: string): Promise<void> {
    await api.delete(`/work/people/${id}`)
}
