import api from './api'
import type { ApiResponse } from '../types'
import type { WalkGoal, WalkPace } from '../lib/walking'
import type { RouteUsage } from './routes'

export interface WalkPoint {
    lat: number
    lng: number
    label: string
}

export interface WalkRoute {
    /** [lng, lat, ele] */
    coords: number[][]
    distanceM: number
    ascentM: number
    descentM: number
}

export interface Walk {
    _id: string
    date: string
    time: string
    name: string
    pace: WalkPace
    goal: WalkGoal
    start: WalkPoint
    stops: WalkPoint[]
    /** Null: back to the start. */
    end: WalkPoint | null
    route: WalkRoute | null
    doneAt: string | null
    /** The repeating walk this day belongs to. */
    series: string | null
    /** Which weekdays it repeats on (0 Sunday); only when fetched singly. */
    seriesDays?: number[]
    /** The library walk this was copied from. */
    library: string | null
}

export type WalkPayload = Omit<Walk, '_id' | 'doneAt' | 'series' | 'seriesDays' | 'library'> & {
    /** New walks: also keep the plan in the library. */
    saveToLibrary?: boolean
    /** Weekdays to repeat on; empty for a one-off. */
    days: number[]
    /** Also change the repeating walk from here on (empty `days` ends it). */
    applyToSeries?: boolean
}

/** A walk with no day. Putting it on a day copies it. */
export interface WalkLibraryItem {
    _id: string
    name: string
    pace: WalkPace
    goal: WalkGoal
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    route: WalkRoute | null
}

export type LibraryPayload = Omit<WalkLibraryItem, '_id'>

export async function listLibrary(): Promise<WalkLibraryItem[]> {
    const res = await api.get<ApiResponse<WalkLibraryItem[]>>('/walks/library')
    return res.data.data
}

export async function getLibraryItem(id: string): Promise<WalkLibraryItem> {
    const res = await api.get<ApiResponse<WalkLibraryItem>>(`/walks/library/${id}`)
    return res.data.data
}

export async function createLibraryItem(body: LibraryPayload): Promise<WalkLibraryItem> {
    const res = await api.post<ApiResponse<WalkLibraryItem>>('/walks/library', body)
    return res.data.data
}

export async function updateLibraryItem(id: string, body: LibraryPayload): Promise<WalkLibraryItem> {
    const res = await api.put<ApiResponse<WalkLibraryItem>>(`/walks/library/${id}`, body)
    return res.data.data
}

export async function deleteLibraryItem(id: string): Promise<void> {
    await api.delete(`/walks/library/${id}`)
}

export async function assignLibraryItem(id: string, date: string, time: string): Promise<Walk> {
    const res = await api.post<ApiResponse<Walk>>(`/walks/library/${id}/assign`, { date, time })
    return res.data.data
}

export interface WalkFavourite {
    _id: string
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    route: WalkRoute
    createdAt: string
}

export async function listFavourites(): Promise<WalkFavourite[]> {
    const res = await api.get<ApiResponse<WalkFavourite[]>>('/walks/favourites')
    return res.data.data
}

export async function createFavourite(body: Omit<WalkFavourite, '_id' | 'createdAt'>): Promise<WalkFavourite> {
    const res = await api.post<ApiResponse<WalkFavourite>>('/walks/favourites', body)
    return res.data.data
}

export async function deleteFavourite(id: string): Promise<void> {
    await api.delete(`/walks/favourites/${id}`)
}

export async function listWalks(from: string, to: string): Promise<Walk[]> {
    const res = await api.get<ApiResponse<Walk[]>>('/walks', { params: { from, to } })
    return res.data.data
}

export async function getWalk(id: string): Promise<Walk> {
    const res = await api.get<ApiResponse<Walk>>(`/walks/${id}`)
    return res.data.data
}

export async function createWalk(body: WalkPayload): Promise<Walk> {
    const res = await api.post<ApiResponse<Walk>>('/walks', body)
    return res.data.data
}

export async function updateWalk(id: string, body: WalkPayload): Promise<Walk> {
    const res = await api.put<ApiResponse<Walk>>(`/walks/${id}`, body)
    return res.data.data
}

export async function setWalkDone(id: string, done: boolean): Promise<Walk> {
    const res = await api.put<ApiResponse<Walk>>(`/walks/${id}/done`, { done })
    return res.data.data
}

export async function deleteWalk(id: string): Promise<void> {
    await api.delete(`/walks/${id}`)
}

export async function generateWalkRoute(body: {
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    targetM: number | null
}): Promise<{ route: WalkRoute; usage: RouteUsage }> {
    const res = await api.post<ApiResponse<WalkRoute> & { usage: RouteUsage }>('/walks/route', body)
    return { route: res.data.data, usage: res.data.usage }
}

/** Stretch a walk through places to its target. `stop` is the point added to do it, if any. */
export async function completeWalkRoute(body: {
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    targetM: number
    seed: number
}): Promise<{ route: WalkRoute; stop: { lat: number; lng: number } | null; stopIndex: number; usage: RouteUsage }> {
    const res = await api.post<ApiResponse<{ route: WalkRoute; stop: { lat: number; lng: number } | null; stopIndex: number }> & { usage: RouteUsage }>(
        '/walks/route/complete',
        body
    )
    return { ...res.data.data, usage: res.data.usage }
}

export interface Place {
    label: string
    lat: number
    lng: number
}

export async function searchPlaces(q: string, near: { lat: number; lng: number } | null, signal?: AbortSignal): Promise<Place[]> {
    const res = await api.get<ApiResponse<Place[]>>('/walks/places', { params: { q, ...near }, signal })
    return res.data.data
}

/** What's at a point on the map, in a few words. Null when nothing's known. */
export async function nameOfPoint(p: { lat: number; lng: number }): Promise<string | null> {
    const res = await api.get<ApiResponse<string | null>>('/walks/places/name', { params: p })
    return res.data.data
}
