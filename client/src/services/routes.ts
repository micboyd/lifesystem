import api from './api'
import type { ApiResponse } from '../types'

/** A generated route saved against a conditioning session. */
export type StartPref = 'any' | 'uphill' | 'downhill'

export interface RunRoute {
    _id: string
    session: string
    kind: 'loop' | 'outback'
    /** [lng, lat, ele] */
    coords: number[][]
    targetM: number
    distanceM: number
    ascentM: number
    descentM: number
    startPref?: StartPref
    /** Net climb (+) or drop (−) over the opening stretch, in metres. */
    openingM?: number
    seed: number
    points: number
    /** No candidate was within tolerance; this was the closest. */
    offTarget: boolean
    /** Planned entries this is the chosen route for. */
    chosenFor: string[]
    reported: boolean
    createdAt: string
}

export interface RouteUsage {
    used: number
    limit: number
}

export interface RouteSettings {
    home: { lat: number; lng: number } | null
    usage: RouteUsage
    cooldownMs: number
}

export type RouteStart = 'home' | { lat: number; lng: number }

/** Why a press didn't give a route — the code picks the message and retry. */
export interface RouteFailure {
    code: 'quota' | 'down' | 'no_route' | 'no_new' | 'no_start' | 'cooldown' | 'config' | 'location_denied' | 'unknown'
    message: string
    retryInMs?: number
}

export function routeFailure(err: unknown): RouteFailure {
    const res = (err as { response?: { status?: number; data?: Partial<RouteFailure> } })?.response
    if (!res) return { code: 'down', message: 'Could not reach the server. Check your connection.' }
    return {
        code: (res.data?.code as RouteFailure['code']) ?? 'unknown',
        message: res.data?.message ?? 'Something went wrong.',
        retryInMs: res.data?.retryInMs,
    }
}

export async function getRouteSettings(): Promise<RouteSettings> {
    const res = await api.get<ApiResponse<RouteSettings>>('/routes/settings')
    return res.data.data
}

export async function setHome(home: { lat: number; lng: number } | null): Promise<void> {
    await api.put('/routes/settings/home', { home })
}

export async function listRoutes(session: string): Promise<RunRoute[]> {
    const res = await api.get<ApiResponse<RunRoute[]>>('/routes', { params: { session } })
    return res.data.data
}

export async function generateRoute(body: {
    session: string
    targetM: number
    kind: 'loop' | 'outback'
    startPref: StartPref
    start: RouteStart
}): Promise<{ route: RunRoute; diffM: number; usage: RouteUsage }> {
    const res = await api.post<ApiResponse<RunRoute> & { diffM: number; usage: RouteUsage }>('/routes/generate', body)
    return { route: res.data.data, diffM: res.data.diffM, usage: res.data.usage }
}

export async function chooseRoute(id: string, entry: string): Promise<RunRoute> {
    const res = await api.put<ApiResponse<RunRoute>>(`/routes/${id}/choose`, { entry })
    return res.data.data
}

export async function unchooseRoute(id: string, entry: string): Promise<RunRoute> {
    const res = await api.put<ApiResponse<RunRoute>>(`/routes/${id}/unchoose`, { entry })
    return res.data.data
}

export async function reportRoute(id: string): Promise<RunRoute> {
    const res = await api.post<ApiResponse<RunRoute>>(`/routes/${id}/report`)
    return res.data.data
}

export async function deleteRoute(id: string): Promise<void> {
    await api.delete(`/routes/${id}`)
}
