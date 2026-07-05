/** Whole days elapsed from `startDate` up to `todayKey` (both "YYYY-MM-DD"). */
export function daysBetween(startDate: string, todayKey: string): number {
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ty, tm, td] = todayKey.split('-').map(Number)
    const start = Date.UTC(sy, sm - 1, sd)
    const today = Date.UTC(ty, tm - 1, td)
    return Math.round((today - start) / 86_400_000)
}
