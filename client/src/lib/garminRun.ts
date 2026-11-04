/**
 * Reading a finished Garmin run for the screen: plain numbers (distance, time,
 * pace), each lap against the step it was planned as, and the charts' series.
 * Pure, so it's tested without the page.
 */
import type { GarminRun, GarminRunLap, PlannedStep } from '../services/garmin'
import { formatPace } from './garminSteps'

/** 5012 → "5.01 km"; 850 → "850 m". */
export function runDistance(m: number | null | undefined): string {
    if (m == null) return '—'
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

/** 1810 → "30:10"; 3723 → "1:02:03". */
export function clock(sec: number | null | undefined): string {
    if (sec == null || !Number.isFinite(sec)) return '—'
    const s = Math.round(sec)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const r = String(s % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** Metres per second → seconds per km; null when too slow to be moving. */
export function secPerKm(speed: number | null | undefined): number | null {
    if (speed == null || speed < 0.3) return null
    return 1000 / speed
}

/** 2.78 m/s → "6:00". */
export function paceText(speed: number | null | undefined): string {
    const p = secPerKm(speed)
    return p == null ? '—' : formatPace(p)
}

const TYPE_LABEL: [RegExp, string][] = [
    [/treadmill/, 'Treadmill run'],
    [/trail/, 'Trail run'],
    [/track/, 'Track run'],
    [/running/, 'Run'],
    [/hiking/, 'Hike'],
    [/walking/, 'Walk'],
    [/cycling|biking/, 'Ride'],
    [/strength/, 'Strength'],
    [/hiit/, 'HIIT'],
]

/** Garmin's type key as a word: "treadmill_running" → "Treadmill run". */
export function activityType(typeKey: string): string {
    for (const [re, label] of TYPE_LABEL) if (re.test(typeKey)) return label
    return typeKey ? typeKey.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Activity'
}

/** "2026-11-04 07:01:00" → "07:01". */
export function startTime(startLocal: string): string {
    return startLocal.slice(11, 16)
}

export type LapVerdict = 'on' | 'fast' | 'slow' | null

export interface LapRow {
    key: number
    /** The planned step's name, or "Lap 3" with nothing planned for it. */
    label: string
    planned: PlannedStep | null
    lap: GarminRunLap | null
    pace: number | null
    verdict: LapVerdict
}

/**
 * Laps against the steps they were planned as. A watch running the workout
 * takes one lap per step, so they pair in order; extra laps (a stop pressed
 * late) stand alone, and steps never reached show as not run.
 */
export function lapRows(planned: PlannedStep[], laps: GarminRunLap[]): LapRow[] {
    const n = Math.max(planned.length, laps.length)
    const rows: LapRow[] = []
    for (let i = 0; i < n; i++) {
        const step = planned[i] ?? null
        const lap = laps[i] ?? null
        const pace = secPerKm(lap?.avgSpeed)
        let verdict: LapVerdict = null
        if (step?.paceTarget && pace != null) {
            if (pace < step.paceTarget.fastestSecPerKm) verdict = 'fast'
            else if (pace > step.paceTarget.slowestSecPerKm) verdict = 'slow'
            else verdict = 'on'
        }
        rows.push({ key: i, label: step?.label ?? `Lap ${i + 1}`, planned: step, lap, pace, verdict })
    }
    return rows
}

/** How many paced laps landed in their band, of how many had one. */
export function paceScore(rows: LapRow[]): { on: number; of: number } | null {
    const judged = rows.filter((r) => r.verdict)
    return judged.length ? { on: judged.filter((r) => r.verdict === 'on').length, of: judged.length } : null
}

/** Whether the run finished where it started (within 150 m). */
export function isLoop(track: number[][]): boolean {
    if (track.length < 2) return false
    const [a, b] = [track[0], track[track.length - 1]]
    const dLat = ((b[1] - a[1]) * Math.PI) / 180
    const dLng = ((b[0] - a[0]) * Math.PI) / 180
    const x = dLng * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
    return Math.sqrt(x * x + dLat * dLat) * 6_371_000 < 150
}

/** Seconds in each of the five HR zones, as shares of the total. */
export function zoneShares(run: Pick<GarminRun, 'zones'>): { zone: number; seconds: number; share: number; lowBpm: number | null }[] {
    const byZone = new Map(run.zones.map((z) => [z.zone, z]))
    const total = run.zones.reduce((n, z) => n + z.seconds, 0)
    if (!total) return []
    return [1, 2, 3, 4, 5].map((zone) => {
        const z = byZone.get(zone)
        const seconds = z?.seconds ?? 0
        return { zone, seconds, share: seconds / total, lowBpm: z?.lowBpm ?? null }
    })
}

export interface SeriesPoint {
    /** Elapsed seconds. */
    t: number
    /** Metres along, when Garmin sent distance. */
    d: number | null
    v: number
}

/**
 * One chart series, paired with time and distance, nulls dropped. Pace is
 * smoothed over a few samples so GPS jitter doesn't make it a hedge.
 */
export function series(run: Pick<GarminRun, 'chart'>, key: 'hr' | 'pace' | 'elev'): SeriesPoint[] {
    const { t = [], d = [], hr = [], speed = [], elev = [] } = run.chart
    const out: SeriesPoint[] = []
    const raw = key === 'hr' ? hr : key === 'elev' ? elev : speed
    for (let i = 0; i < t.length; i++) {
        const ti = t[i]
        if (ti == null) continue
        let v: number | null
        if (key === 'pace') {
            const win = speed.slice(Math.max(0, i - 2), i + 3).filter((s): s is number => s != null)
            const avg = win.length ? win.reduce((a, b) => a + b, 0) / win.length : null
            v = secPerKm(avg)
            // A stop or a walk break off the chart's scale.
            if (v != null && v > 20 * 60) v = null
        } else v = raw[i] ?? null
        if (v == null) continue
        out.push({ t: ti, d: d[i] ?? null, v })
    }
    return out
}

/** The link to the run on Garmin Connect. */
export function connectUrl(activityId: string): string {
    return `https://connect.garmin.com/modern/activity/${encodeURIComponent(activityId)}`
}
