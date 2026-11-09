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
}

export type WalkPayload = Omit<Walk, '_id' | 'doneAt'>

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
