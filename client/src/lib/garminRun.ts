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

/**
 * Whether the laps can't be the workout's steps: no lap names a step, and they
 * are either the watch's automatic whole-km laps or a different count from
 * the plan. Happens when a plain run is started instead of the workout.
 */
export function lapsAreNotSteps(planned: PlannedStep[], laps: GarminRunLap[]): boolean {
    if (!planned.length || !laps.length) return false
    if (laps.some((l) => l.stepIndex != null)) return false
    const whole = laps.slice(0, -1)
    const autoKm =
        whole.length > 0 &&
        whole.every((l) => l.distanceM != null && l.distanceM >= 990 && Math.abs(l.distanceM - Math.round(l.distanceM / 1000) * 1000) <= 10)
    return autoKm || laps.length !== planned.length
}

/** The chart's samples with time and distance both known, in time order. */
function samples(chart: GarminRun['chart']): { t: number; d: number; hr: number | null }[] {
    const { t = [], d = [], hr = [] } = chart
    const out: { t: number; d: number; hr: number | null }[] = []
    for (let i = 0; i < t.length; i++) {
        const ti = t[i]
        const di = d[i]
        if (ti == null || di == null) continue
        if (out.length && ti < out[out.length - 1].t) continue
        out.push({ t: ti, d: di, hr: hr[i] ?? null })
    }
    return out
}

/** Linear read of `want` along samples by `by`; clamps to the ends. */
function at(pts: { t: number; d: number }[], by: 't' | 'd', value: number, want: 't' | 'd'): number {
    if (value <= pts[0][by]) return pts[0][want]
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        if (b[by] >= value) {
            const span = b[by] - a[by]
            const f = span > 0 ? (value - a[by]) / span : 1
            return a[want] + f * (b[want] - a[want])
        }
    }
    return pts[pts.length - 1][want]
}

/** A made-up lap covering [t0, t1] of the run. */
function sliceLap(pts: { t: number; d: number; hr: number | null }[], t0: number, t1: number, index: number): GarminRunLap {
    const distanceM = Math.max(0, at(pts, 't', t1, 'd') - at(pts, 't', t0, 'd'))
    const durationS = t1 - t0
    const hrs = pts.filter((p) => p.t >= t0 && p.t <= t1 && p.hr != null).map((p) => p.hr as number)
    return {
        index,
        distanceM,
        durationS,
        movingS: null,
        avgSpeed: durationS > 0 ? distanceM / durationS : null,
        avgHr: hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null,
        maxHr: hrs.length ? Math.max(...hrs) : null,
        elevGainM: null,
        intensity: null,
        stepIndex: index,
    }
}

/**
 * The run cut into the planned steps by their own times or distances, from
 * the second-by-second data. Null when a step ends on the lap button (no way
 * to know where it stopped) or there's no data to cut. Anything left after
 * the last step over a minute shows as its own row.
 */
export function splitByPlan(planned: PlannedStep[], chart: GarminRun['chart']): GarminRunLap[] | null {
    if (!planned.length || planned.some((s) => s.end.kind === 'lapButton')) return null
    const pts = samples(chart)
    if (pts.length < 2) return null
    const tEnd = pts[pts.length - 1].t
    const out: GarminRunLap[] = []
    let t0 = pts[0].t
    for (let i = 0; i < planned.length; i++) {
        if (t0 >= tEnd) break
        const end = planned[i].end
        const t1 =
            end.kind === 'time'
                ? Math.min(t0 + end.seconds, tEnd)
                : end.kind === 'distance'
                  ? at(pts, 'd', at(pts, 't', t0, 'd') + end.metres, 't')
                  : tEnd
        out.push(sliceLap(pts, t0, t1, i))
        t0 = t1
    }
    if (out.length === planned.length && tEnd - t0 > 60) out.push(sliceLap(pts, t0, tEnd, out.length))
    return out
}

/**
 * The rows for "Planned vs done": real laps when they're the steps, else the
 * run cut by the plan's times (`split` says so, so the screen can).
 */
export function runRows(run: Pick<GarminRun, 'planned' | 'laps' | 'chart'>): { rows: LapRow[]; split: boolean } {
    if (lapsAreNotSteps(run.planned, run.laps)) {
        const cut = splitByPlan(run.planned, run.chart)
        if (cut) return { rows: lapRows(run.planned, cut), split: true }
    }
    return { rows: lapRows(run.planned, run.laps), split: false }
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
