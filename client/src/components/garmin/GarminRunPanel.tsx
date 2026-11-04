import { useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import Spinner from '../Spinner'
import RouteMap from '../route/RouteMap'
import RunChart from './RunChart'
import { GarminErrorBlock } from './GarminParts'
import {
    checkGarminRuns,
    GARMIN_RUNS_LINKED,
    garminError,
    getEntryRun,
    getGarminStatus,
    linkEntryRun,
    unlinkEntryRun,
    type GarminErrorCode,
    type GarminRun,
    type GarminRunCandidate,
} from '../../services/garmin'
import { listRoutes } from '../../services/routes'
import type { FitnessPlanEntry } from '../../types'
import { todayKey } from '../../lib/calendar'
import { STEP_TYPE_LABEL, stepEnd, stepPace, formatPace } from '../../lib/garminSteps'
import {
    activityType,
    clock,
    connectUrl,
    isLoop,
    lapRows,
    paceScore,
    paceText,
    runDistance,
    series,
    startTime,
    zoneShares,
    type LapVerdict,
} from '../../lib/garminRun'

type Phase =
    | { kind: 'loading' }
    | { kind: 'hidden' }
    | { kind: 'looking' }
    | { kind: 'none'; candidates: GarminRunCandidate[] }
    | { kind: 'run'; run: GarminRun }
    | { kind: 'error'; code: GarminErrorCode; message: string }

/**
 * The finished run, inside a planned conditioning session's drawer. Once the
 * watch has synced, the run is found on Garmin and linked (by the workout it
 * was started from, or as the day's one run); then it reads as stats, the
 * track on a map, each lap against its planned step, HR zones and charts.
 * When it can't tell which run it was, it asks.
 */
export default function GarminRunPanel({
    entry,
    done,
    onLinked,
    framed = false,
}: {
    entry: FitnessPlanEntry
    /** Draw its own border — when it isn't a row of a divided list. */
    framed?: boolean
    /** Whether the entry is ticked off — re-read when it changes (a log deleted takes its run off too). */
    done: boolean
    /** A run was linked and its log written or attached — the entry is done. */
    onLinked: (logId: string) => void
}) {
    const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
    const [busy, setBusy] = useState<string | null>(null)
    const future = entry.date > todayKey()

    async function look(force: boolean) {
        setPhase({ kind: 'looking' })
        try {
            const r = await checkGarminRuns(entry.date, entry.date, force)
            const mine = r.linked.find((l) => l.entryId === entry._id)
            if (mine) {
                const run = await getEntryRun(entry._id)
                if (run) {
                    setPhase({ kind: 'run', run })
                    onLinked(mine.logId)
                    return
                }
            }
            // Another entry on the day took a run: it's done too.
            for (const l of r.linked) if (l.entryId !== entry._id) window.dispatchEvent(new CustomEvent(GARMIN_RUNS_LINKED, { detail: [l] }))
            setPhase({ kind: 'none', candidates: r.candidates[entry.date] ?? [] })
        } catch (err) {
            const e = garminError(err)
            setPhase({ kind: 'error', ...e })
        }
    }

    // Start fresh for each entry, and when it's ticked or unticked.
    const loadKey = `${entry._id}|${entry.date}|${done}`
    const [loadedFor, setLoadedFor] = useState(loadKey)
    if (loadedFor !== loadKey) {
        setLoadedFor(loadKey)
        setPhase({ kind: 'loading' })
    }

    useEffect(() => {
        let live = true
        ;(async () => {
            try {
                const run = await getEntryRun(entry._id)
                if (!live) return
                if (run) return setPhase({ kind: 'run', run })
                if (future) return setPhase({ kind: 'hidden' })
                const status = await getGarminStatus()
                if (!live) return
                if (status.status !== 'connected') return setPhase({ kind: 'hidden' })
                await look(false)
            } catch {
                if (live) setPhase({ kind: 'hidden' })
            }
        })()
        return () => {
            live = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entry._id, entry.date, done])

    async function pick(c: GarminRunCandidate) {
        setBusy(c.activityId)
        try {
            const run = await linkEntryRun(entry._id, c.activityId)
            setPhase({ kind: 'run', run })
            if (run.log) onLinked(run.log)
        } catch (err) {
            setPhase({ kind: 'error', ...garminError(err) })
        } finally {
            setBusy(null)
        }
    }

    async function unlink() {
        setBusy('unlink')
        try {
            await unlinkEntryRun(entry._id)
            await look(false)
        } catch (err) {
            setPhase({ kind: 'error', ...garminError(err) })
        } finally {
            setBusy(null)
        }
    }

    if (phase.kind === 'hidden' || phase.kind === 'loading') return null
    if (phase.kind === 'run') return <RunView run={phase.run} entry={entry} onUnlink={unlink} unlinking={busy === 'unlink'} />

    return (
        <div className={`flex flex-col gap-3 px-4 py-3.5 ${framed ? 'rounded-2xl border border-neutral-200' : ''}`}>
            <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">Run from Garmin</p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                        {phase.kind === 'looking'
                            ? 'Looking on Garmin…'
                            : phase.kind === 'none' && phase.candidates.length
                              ? 'Which one was this session?'
                              : 'Nothing for this day yet. Sync your watch, then check.'}
                    </p>
                </div>
                {phase.kind === 'looking' ? (
                    <Spinner size="sm" />
                ) : (
                    <Button
                        variant="secondary"
                        size="sm"
                        icon="fa-solid fa-rotate"
                        onClick={() => void look(true)}
                        className="shrink-0"
                    >
                        Check
                    </Button>
                )}
            </div>
            {phase.kind === 'error' && (
                <GarminErrorBlock code={phase.code} message={phase.message} onRetry={() => void look(true)} />
            )}
            {phase.kind === 'none' && phase.candidates.length > 0 && (
                <ul className="flex flex-col divide-y divide-neutral-100">
                    {phase.candidates.map((c) => (
                        <li key={c.activityId} className="flex min-w-0 items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-neutral-900">{c.name || activityType(c.typeKey)}</p>
                                <p className="text-[13px] tabular-nums text-neutral-500">
                                    {activityType(c.typeKey)} · {startTime(c.startLocal)}
                                    {c.distanceM ? ` · ${runDistance(c.distanceM)}` : ''}
                                    {c.durationS ? ` · ${clock(c.durationS)}` : ''}
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void pick(c)}
                                disabled={busy !== null}
                            >
                                {busy === c.activityId ? 'Linking…' : 'This one'}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

const LINKED_BY: Record<NonNullable<GarminRun['linkedBy']>, string> = {
    workout: 'Matched by its workout',
    day: 'Matched as the day’s run',
    manual: 'Picked by you',
}

const VERDICT: Record<Exclude<LapVerdict, null>, { label: string; tone: string }> = {
    on: { label: 'On pace', tone: 'bg-emerald-50 text-emerald-700' },
    fast: { label: 'Fast', tone: 'bg-amber-50 text-amber-700' },
    slow: { label: 'Slow', tone: 'bg-amber-50 text-amber-700' },
}

const ZONE_TONE = ['bg-neutral-300', 'bg-sky-400', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500']

function RunView({
    run,
    entry,
    onUnlink,
    unlinking,
}: {
    run: GarminRun
    entry: FitnessPlanEntry
    onUnlink: () => void
    unlinking: boolean
}) {
    const s = run.summary
    const [more, setMore] = useState(false)
    const [hover, setHover] = useState<{ t: number; d: number | null } | null>(null)
    const [plannedRoute, setPlannedRoute] = useState<number[][] | null>(null)

    // The route chosen for this entry, drawn under the run as done.
    const sessionId = entry.session?._id
    useEffect(() => {
        if (!sessionId || run.track.length < 2) return
        let live = true
        listRoutes(sessionId)
            .then((rs) => live && setPlannedRoute(rs.find((r) => r.chosenFor.includes(entry._id))?.coords ?? null))
            .catch(() => {})
        return () => {
            live = false
        }
    }, [sessionId, entry._id, run.track.length])

    const rows = useMemo(() => lapRows(run.planned, run.laps), [run.planned, run.laps])
    const score = paceScore(rows)
    const zones = useMemo(() => zoneShares(run), [run])
    const charts = useMemo(
        () => ({ pace: series(run, 'pace'), hr: series(run, 'hr'), elev: series(run, 'elev') }),
        [run]
    )
    const loop = useMemo(() => isLoop(run.track), [run.track])

    const stats = [
        { label: 'Distance', value: s.distanceM ? runDistance(s.distanceM).replace(/ (km|m)$/, '') : '—', unit: s.distanceM && s.distanceM >= 1000 ? 'km' : 'm' },
        { label: 'Time', value: clock(s.movingS ?? s.durationS) },
        { label: 'Pace', value: paceText(s.avgSpeed), unit: '/km' },
        { label: 'Avg HR', value: s.avgHr ? Math.round(s.avgHr) : '—', unit: s.avgHr ? 'bpm' : undefined },
        { label: 'Climb', value: s.elevGainM != null ? Math.round(s.elevGainM) : '—', unit: s.elevGainM != null ? 'm' : undefined },
    ]
    const extras = [
        s.maxHr ? `Max HR ${Math.round(s.maxHr)}` : null,
        s.cadence ? `Cadence ${Math.round(s.cadence)} spm` : null,
        s.calories ? `${Math.round(s.calories)} kcal` : null,
        s.aerobicTE ? `Aerobic effect ${s.aerobicTE.toFixed(1)}` : null,
        s.elapsedS && s.movingS && s.elapsedS - s.movingS > 30 ? `Stopped ${clock(s.elapsedS - s.movingS)}` : null,
    ].filter(Boolean) as string[]

    return (
        <section className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                        <i className="fa-solid fa-person-running text-sm" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-neutral-900">{s.name || activityType(s.typeKey)}</p>
                        <p className="truncate text-[13px] text-neutral-500">
                            {activityType(s.typeKey)} at {startTime(s.startLocal)}
                            {s.deviceName ? ` · ${s.deviceName}` : ''}
                            {run.linkedBy ? ` · ${LINKED_BY[run.linkedBy]}` : ''}
                        </p>
                    </div>
                </div>
            </div>

            <dl className="grid grid-cols-3 gap-y-3 rounded-2xl bg-neutral-50 py-3 sm:grid-cols-5">
                {stats.map((st) => (
                    <div key={st.label} className="flex min-w-0 flex-col items-center gap-0.5 px-2">
                        <dt className="order-last text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">{st.label}</dt>
                        <dd className="truncate text-lg font-semibold tabular-nums text-neutral-900">
                            {st.value}
                            {st.unit && st.value !== '—' && <span className="ml-0.5 text-xs font-medium text-neutral-500">{st.unit}</span>}
                        </dd>
                    </div>
                ))}
            </dl>
            {extras.length > 0 && <p className="-mt-3 text-[13px] tabular-nums text-neutral-500">{extras.join(' · ')}</p>}

            {run.track.length > 1 && (
                <div className="flex flex-col gap-1.5">
                    <RouteMap coords={run.track} loop={loop} start={null} planned={plannedRoute} hoverM={hover?.d ?? null} />
                    {plannedRoute && (
                        <p className="text-[13px] text-neutral-500">
                            <span className="mr-1.5 inline-block w-4 border-t-2 border-dashed border-neutral-500 align-middle" aria-hidden="true" />
                            Planned route
                        </p>
                    )}
                </div>
            )}

            {rows.length > 0 && (
                <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-sm font-semibold text-neutral-900">{run.planned.length ? 'Planned vs done' : 'Laps'}</h3>
                        {score && (
                            <p className="text-[13px] tabular-nums text-neutral-500">
                                {score.on} of {score.of} on pace
                            </p>
                        )}
                    </div>
                    <ol className="flex flex-col divide-y divide-neutral-100">
                        {rows.map((r) => (
                            <li key={r.key} className="flex min-w-0 items-start justify-between gap-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-neutral-900">{r.label}</p>
                                    <p className="text-[13px] tabular-nums text-neutral-500">
                                        {r.planned
                                            ? [STEP_TYPE_LABEL[r.planned.type], stepEnd(r.planned), stepPace(r.planned)].filter(Boolean).join(' · ')
                                            : 'Not in the plan'}
                                    </p>
                                </div>
                                <div className="shrink-0 text-right">
                                    {r.lap ? (
                                        <>
                                            <p className="text-sm tabular-nums text-neutral-900">
                                                {runDistance(r.lap.distanceM)} · {clock(r.lap.movingS ?? r.lap.durationS)}
                                            </p>
                                            <p className="flex items-center justify-end gap-1.5 text-[13px] tabular-nums text-neutral-500">
                                                {r.pace != null ? `${formatPace(r.pace)} /km` : ''}
                                                {r.lap.avgHr ? ` · ${Math.round(r.lap.avgHr)} bpm` : ''}
                                                {r.verdict && (
                                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${VERDICT[r.verdict].tone}`}>
                                                        {VERDICT[r.verdict].label}
                                                    </span>
                                                )}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="text-[13px] text-neutral-400">Not run</p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {zones.length > 0 && (
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">Heart rate zones</h3>
                    <ul className="flex flex-col gap-1.5">
                        {zones.map((z) => (
                            <li key={z.zone} className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3 text-[13px] tabular-nums">
                                <span className="text-neutral-600">Zone {z.zone}</span>
                                <span className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                                    <span className={`block h-full rounded-full ${ZONE_TONE[z.zone - 1]}`} style={{ width: `${Math.round(z.share * 100)}%` }} />
                                </span>
                                <span className="text-right text-neutral-900">{Math.round(z.seconds / 60)} min</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {(charts.pace.length > 1 || charts.hr.length > 1 || charts.elev.length > 1) && (
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={() => setMore((m) => !m)}
                        className="flex items-center gap-1.5 self-start text-sm font-medium text-neutral-700 hover:text-neutral-900"
                        aria-expanded={more}
                    >
                        <i className={`fa-solid fa-chevron-${more ? 'up' : 'down'} text-[11px]`} aria-hidden="true" />
                        {more ? 'Hide charts' : 'Pace, heart rate and elevation'}
                    </button>
                    {more && (
                        <>
                            <RunChart label="Pace" points={charts.pace} format={(v) => `${formatPace(v)} /km`} invert hoverT={hover?.t ?? null} onHover={setHover} />
                            <RunChart label="Heart rate" points={charts.hr} format={(v) => `${Math.round(v)} bpm`} hoverT={hover?.t ?? null} onHover={setHover} />
                            <RunChart label="Elevation" points={charts.elev} format={(v) => `${Math.round(v)} m`} hoverT={hover?.t ?? null} onHover={setHover} />
                        </>
                    )}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <a
                    href={connectUrl(run.activityId)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-neutral-200 bg-white px-3.5 text-[13px] font-medium text-neutral-900 hover:border-neutral-300 hover:bg-neutral-50"
                >
                    <i className="fa-solid fa-arrow-up-right-from-square text-[11px]" aria-hidden="true" />
                    Open in Garmin Connect
                </a>
                <Button variant="ghost" size="sm" icon="fa-solid fa-link-slash" onClick={onUnlink} disabled={unlinking}>
                    {unlinking ? 'Unlinking…' : 'Not this run'}
                </Button>
            </div>
        </section>
    )
}
