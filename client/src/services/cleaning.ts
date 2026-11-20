import api from './api'
import type { ApiResponse, CleaningHome } from '../types'
import type { CleaningBlock } from '../lib/cleaning'

/** The saved home, or null before the wizard has been run. */
export async function getCleaningHome(): Promise<CleaningHome | null> {
    const res = await api.get<ApiResponse<CleaningHome | null>>('/cleaning')
    return res.data.data
}

export async function saveCleaningHome(home: CleaningHome): Promise<CleaningHome> {
    const res = await api.put<ApiResponse<CleaningHome>>('/cleaning', home)
    return res.data.data
}

/** Puts cleaning blocks into Timebox for from…to, replacing ones sent before. */
export async function sendCleaningToTimebox(
    from: string,
    to: string,
    blocks: CleaningBlock[]
): Promise<{ added: number; replaced: number }> {
    const res = await api.post<ApiResponse<{ added: number; replaced: number }>>('/cleaning/timebox', { from, to, blocks })
    return res.data.data
}
