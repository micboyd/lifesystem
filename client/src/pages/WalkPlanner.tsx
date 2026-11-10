import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Button from '../components/Button'
import PillToggle from '../components/PillToggle'
import ConfirmModal from '../components/ConfirmModal'
import Spinner from '../components/Spinner'
import DatePicker, { type DatePickerValue } from '../components/DatePicker'
import TimePicker from '../components/TimePicker'
import { FIELD_BASE, FIELD_HINT, FIELD_IDLE, FIELD_LABEL } from '../components/fieldStyles'
import RouteMap, { type MapWaypoint, type StepMarker } from '../components/route/RouteMap'
import PlaceSearch from '../components/walking/PlaceSearch'
import { loadWeightKg } from '../components/walking/useWalks'
import { todayKey } from '../lib/calendar'
import { WEEK_ORDER } from '../lib/perfectDay'
import { haversine } from '../lib/routeTrack'
import { googleMapsUrl, MAPS_WARNING } from '../lib/routeMaps'
import { currentPosition } from '../lib/routeLocation'
import { LIT_WARNING, needsLitCheck } from '../lib/routeSafety'
import {
    convertGoal,
    daysForRepeat,
    DOUBLE_BACK_SHARE,
    doubledBackShare,
    estimateWalk,
    FAVOURITE_NEAR_M,
    finishTime,
    formatMinutes,
    formatWalkKm,
    GOAL_UNITS,
    MAX_WALK_M,
    MIN_WALK_M,
    PACES,
    repeatModeOf,
    sameRoute,
    targetMetres,
    walkGap,
    walkPart,
    type WalkEstimate,
    type WalkGap,
    type WalkGoalKind,
    type WalkPace,
    type RepeatMode,
} from '../lib/walking'
import { getRouteSettings, routeFailure, setHome, type RouteFailure, type RouteSettings, type RouteUsage } from '../services/routes'
import {
    completeWalkRoute,
    createFavourite,
    createLibraryItem,
    createWalk,
    deleteFavourite,
    deleteLibraryItem,
    deleteWalk,
    generateWalkRoute,
    getLibraryItem,
    getWalk,
    listFavourites,
    nameOfPoint,
    updateLibraryItem,
    updateWalk,
    type Walk,
    type WalkPoint,
    type WalkFavourite,
    type WalkRoute,
} from '../services/walks'

/**
 * The walk planner: the whole screen is the map, and you plan on it. Tap to add
 * a place to pass, drag any pin to move it, and the route and figures follow.
 * Settings float over the map. With no places to pass it's a loop sized to the
 * target; with places, they decide the length and the gap to the target shows.
 *
 * Figures use `.nums`, never `tabular-nums`, which switches to the mono face.
 */

const MAX_STOPS = 8
/** A loop stays current until the target moves by more than this share. */
const LOOP_DRIFT = 0.05
/** How long after the last change a route through places is fetched. */
const AUTO_ROUTE_MS = 500
const NO_STEPS: StepMarker[] = []
const PIN = 'Pin on the map'
/** Marks the point "Match my target" added, so pressing again swaps it rather than adding more. */
const ADDED = 'Added to match your target'
const clock = () => Date.now()

const FAILURE_TEXT: Partial<Record<RouteFailure['code'], string>> = {
    quota: "Today's route quota is used up. It resets at midnight (UTC).",
    down: "The routing service isn't responding right now.",
    no_route: 'No walkable route through those points. Try moving them onto a street or path.',
}

type StartMode = 'home' | 'gps' | 'choose'
type TapFor = 'start' | 'stop' | 'end'

const TAP_TEXT: Record<TapFor, string> = {
    start: 'Tap the map to set your start',
    stop: 'Tap the map to add a place to pass',
    end: 'Tap the map to set your finish',
}

interface Form {
    name: string
    date: string
    time: string | null
    pace: WalkPace
    kind: WalkGoalKind
    value: string
    start: WalkPoint | null
    startMode: StartMode
    stops: WalkPoint[]
    finishElsewhere: boolean
    end: WalkPoint | null
    /** Weekdays it repeats on (0 Sunday); empty for a one-off. */
    days: number[]
    /** Remembered apart from `days`, so "Custom" can be open with nothing ticked yet. */
    repeat: RepeatMode
}

/** The next half hour today; midday on any other day. */
function defaultTime(date: string): string {
    if (date !== todayKey()) return '12:00'
    const d = new Date()
    const next = Math.min(23 * 60 + 30, Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 30) * 30)
    return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

function formFrom(walk: Walk | null, date: string, home: RouteSettings['home']): Form {
    if (walk)
        return {
            name: walk.name,
            date: walk.date,
            time: walk.time,
            pace: walk.pace,
            kind: walk.goal.kind,
            value: String(walk.goal.value),
            start: walk.start,
            startMode: 'choose',
            stops: walk.stops,
            finishElsewhere: !!walk.end,
            end: walk.end,
            days: walk.seriesDays ?? [],
            repeat: repeatModeOf(walk.seriesDays ?? []),
        }
    return {
        name: '',
        date,
        time: defaultTime(date),
        pace: 'steady',
        kind: 'time',
        value: String(GOAL_UNITS.time.fallback),
        start: home ? { ...home, label: 'Home' } : null,
        startMode: home ? 'home' : 'choose',
        stops: [],
        finishElsewhere: false,
        end: null,
        days: [],
        repeat: 'once',
    }
}

const REPEAT_OPTIONS: { value: RepeatMode; label: string }[] = [
    { value: 'once', label: 'Just this day' },
    { value: 'weekdays', label: 'Weekdays' },
    { value: 'daily', label: 'Every day' },
    { value: 'custom', label: 'Choose days' },
]
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function starredOn(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const finishOf = (f: Form) => (f.finishElsewhere ? f.end : null)
const isLoop = (f: Form) => f.stops.length === 0 && !finishOf(f)
const at = (p: WalkPoint) => [p.lat, p.lng]
/** The points a route is drawn through. */
const pointsKey = (f: Form) => JSON.stringify([f.start && at(f.start), f.stops.map(at), finishOf(f) && at(finishOf(f)!)])

/** Give a just-dropped pin its real name, if it's still where it was dropped. */
function withName(f: Form, p: { lat: number; lng: number }, label: string): Form {
    const named = (x: WalkPoint) => (x.lat === p.lat && x.lng === p.lng && x.label === PIN ? { ...x, label } : x)
    return { ...f, start: f.start && named(f.start), stops: f.stops.map(named), end: f.end && named(f.end) }
}

/** Fetches what the planner opens with, then starts it fresh. */
export default function WalkPlanner({ library = false }: { library?: boolean }) {
    const { id } = useParams<{ id: string }>()
    const [params] = useSearchParams()
    const walkId = id === 'new' ? null : (id ?? null)
    const raw = params.get('date')
    const date = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayKey()
    const rawTime = params.get('time')
    const time = rawTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : null
    const [loaded, setLoaded] = useState<{ key: string; walk: Walk | null; weightKg: number | null; settings: RouteSettings | null; failed: boolean } | null>(null)
    const key = `${library ? 'library' : 'day'}-${walkId ?? `new-${date}-${time}`}`

    useEffect(() => {
        let live = true
        const opening = !walkId
            ? Promise.resolve(null)
            : library
              ? getLibraryItem(walkId).then((item): Walk => ({ ...item, date: todayKey(), time: '12:00', doneAt: null, series: null, library: item._id }))
              : getWalk(walkId)
        Promise.all([opening, loadWeightKg(), getRouteSettings().catch(() => null)])
            .then(([walk, weightKg, settings]) => live && setLoaded({ key, walk, weightKg, settings, failed: false }))
            .catch(() => live && setLoaded({ key, walk: null, weightKg: null, settings: null, failed: true }))
        return () => {
            live = false
        }
    }, [walkId, key, library])

    const ready = loaded?.key === key ? loaded : null
    if (!ready)
        return (
            <div className="fixed inset-0 grid place-items-center bg-neutral-100">
                <Spinner />
            </div>
        )
    if (ready.failed)
        return (
            <div className="fixed inset-0 grid place-items-center bg-neutral-100 p-6 text-center">
                <div>
                    <p className="text-lg font-semibold text-neutral-900">Couldn’t open that walk</p>
                    <Link to="/walking" className="mt-2 inline-block text-sm font-medium text-neutral-700 underline underline-offset-4">
                        Back to Walking
                    </Link>
                </div>
            </div>
        )
    return <Planner key={key} isLibrary={library} walk={ready.walk} date={date} time={time} weightKg={ready.weightKg} initialSettings={ready.settings} />
}

function Planner({
    isLibrary,
    walk,
    date,
    time,
    weightKg,
    initialSettings,
}: {
    /** Planning a walk with no day: no time or repeat, and it saves to the library. */
    isLibrary: boolean
    walk: Walk | null
    date: string
    /** The slot a new walk was asked for from. */
    time: string | null
    weightKg: number | null
    initialSettings: RouteSettings | null
}) {
    const navigate = useNavigate()
    const [initial] = useState(() => {
        const f = formFrom(walk, date, initialSettings?.home ?? null)
        return !walk && time ? { ...f, time } : f
    })
    const [form, setForm] = useState<Form>(initial)
    const [route, setRoute] = useState<WalkRoute | null>(walk?.route ?? null)
    const [routeKey, setRouteKey] = useState<string | null>(walk?.route ? pointsKey(initial) : null)
    const [routeTargetM, setRouteTargetM] = useState<number | null>(walk?.route ? targetMetres(walk.goal, walk.pace, weightKg) : null)
    const [home, setHomePoint] = useState(initialSettings?.home ?? null)
    const [usage, setUsage] = useState<RouteUsage | null>(initialSettings?.usage ?? null)
    /** One tap's worth of "set this instead of adding a place". */
    const [tapOverride, setTapOverride] = useState<TapFor | null>(null)
    const [fitKey, setFitKey] = useState(1)
    const [sheetOpen, setSheetOpen] = useState(true)
    const [busy, setBusy] = useState(false)
    const [saving, setSaving] = useState(false)
    const [failure, setFailure] = useState<RouteFailure | null>(null)
    const [cooldownUntil, setCooldownUntil] = useState(0)
    const [now, setNow] = useState(0)
    const [confirmMaps, setConfirmMaps] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [confirmLeave, setConfirmLeave] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [completeTries, setCompleteTries] = useState(0)
    const [favourites, setFavourites] = useState<WalkFavourite[]>([])
    const [applyFuture, setApplyFuture] = useState(false)
    const [keptInLibrary, setKeptInLibrary] = useState(false)

    const patch = (change: Partial<Form>) => {
        setDirty(true)
        setForm((f) => ({ ...f, ...change }))
    }
    const refit = () => setFitKey((k) => k + 1)
    const backTo = isLibrary ? '/walking' : `/walking?date=${form.date}`

    // Leave room for the floating panels when fitting the route. Fixed at open, like the layout.
    const [fitPadding] = useState(() =>
        window.innerWidth >= 1024
            ? { topLeft: [468, 48] as [number, number], bottomRight: [80, 150] as [number, number] }
            : { topLeft: [32, 80] as [number, number], bottomRight: [32, Math.round(window.innerHeight * 0.6)] as [number, number] }
    )

    useEffect(() => {
        let live = true
        listFavourites()
            .then((list) => live && setFavourites(list))
            .catch(() => undefined)
        return () => {
            live = false
        }
    }, [])

    useEffect(() => {
        if (cooldownUntil <= now) return
        const t = window.setInterval(() => setNow(clock()), 250)
        return () => window.clearInterval(t)
    }, [cooldownUntil, now])
    const waitSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

    const goalValue = Number(form.value.replace(',', '.'))
    const goal = useMemo(() => ({ kind: form.kind, value: goalValue }), [form.kind, goalValue])
    const targetM = targetMetres(goal, form.pace, weightKg)
    const loop = isLoop(form)
    const end = finishOf(form)
    const key = pointsKey(form)

    const drifted = loop && targetM !== null && routeTargetM !== null && Math.abs(targetM - routeTargetM) > routeTargetM * LOOP_DRIFT
    const fresh = !!route && routeKey === key && !drifted
    const shown = fresh ? route : null

    const estimate = shown ? estimateWalk(shown.distanceM, form.pace, weightKg) : targetM ? estimateWalk(targetM, form.pace, weightKg) : null
    const gap = shown && goalValue > 0 && estimate ? walkGap(goal, estimate) : null

    const tapFor: TapFor | null =
        tapOverride ?? (!form.start ? 'start' : form.finishElsewhere && !form.end ? 'end' : form.stops.length < MAX_STOPS ? 'stop' : null)

    // A route through places follows them as they change.
    const start = form.start
    const stops = form.stops
    const finishReady = !form.finishElsewhere || !!form.end
    const needsAuto = !loop && !!start && finishReady && routeKey !== key
    useEffect(() => {
        if (!needsAuto || !start) return
        let live = true
        const t = window.setTimeout(() => {
            setBusy(true)
            setFailure(null)
            generateWalkRoute({ start, stops, end, targetM: null })
                .then((out) => {
                    if (!live) return
                    setRoute(out.route)
                    setRouteKey(key)
                    setRouteTargetM(null)
                    setUsage(out.usage)
                })
                .catch((err) => live && setFailure(routeFailure(err)))
                .finally(() => live && setBusy(false))
        }, AUTO_ROUTE_MS)
        return () => {
            live = false
            window.clearTimeout(t)
            setBusy(false)
        }
    }, [needsAuto, key, start, stops, end])

    const waypoints = useMemo<MapWaypoint[]>(
        () => [
            ...stops.map((s, i) => ({ lat: s.lat, lng: s.lng, label: s.label, mark: String(i + 1) })),
            ...(end ? [{ lat: end.lat, lng: end.lng, label: end.label, mark: 'F' }] : []),
        ],
        [stops, end]
    )

    const loopOutOfRange = loop && targetM !== null && (targetM < MIN_WALK_M || targetM > MAX_WALK_M)
    const canLoop = loop && !!start && !busy && !!targetM && !loopOutOfRange && waitSec === 0
    const kept = stops.filter((s) => s.label !== ADDED)
    const hasAdded = kept.length < stops.length
    const short = !!shown && !!targetM && shown.distanceM < targetM * 0.95
    const doublesBack = !!shown && doubledBackShare(shown.coords) > DOUBLE_BACK_SHARE
    const canComplete =
        !loop && !!start && finishReady && !!targetM && !!shown && !busy && waitSec === 0 && (short || hasAdded || doublesBack) && kept.length < MAX_STOPS
    const starred = shown ? favourites.find((f) => sameRoute(f.route, shown)) : undefined
    const nearby = start ? favourites.filter((f) => haversine(f.start, start) <= FAVOURITE_NEAR_M) : []
    const repeatChanged = [...form.days].sort().join() !== [...initial.days].sort().join()
    const canSave = !!start && !!form.time && goalValue > 0 && targetM !== null && !saving && !busy && finishReady

    function changeKind(kind: WalkGoalKind) {
        patch({ kind, value: String(convertGoal(shown?.distanceM ?? targetM, kind, form.pace, weightKg)) })
    }

    function nameLater(p: { lat: number; lng: number }) {
        nameOfPoint(p)
            .then((label) => label && setForm((f) => withName(f, p, label)))
            .catch(() => undefined)
    }

    function setPoint(what: TapFor, p: WalkPoint) {
        setFailure(null)
        setTapOverride(null)
        if (what === 'start') patch({ start: p, startMode: p.label === 'Home' ? 'home' : p.label === 'My location' ? 'gps' : 'choose' })
        else if (what === 'end') patch({ end: p })
        else {
            setDirty(true)
            setForm((f) => (f.stops.length >= MAX_STOPS ? f : { ...f, stops: [...f.stops, p] }))
        }
    }

    function tapMap(p: { lat: number; lng: number }) {
        if (!tapFor) return
        setPoint(tapFor, { ...p, label: PIN })
        nameLater(p)
    }

    function searched(what: TapFor, p: WalkPoint) {
        setPoint(what, p)
        refit()
    }

    function dragWaypoint(i: number, p: { lat: number; lng: number }) {
        const moved = { ...p, label: PIN }
        if (i < form.stops.length) patch({ stops: form.stops.map((s, j) => (j === i ? moved : s)) })
        else patch({ end: moved })
        nameLater(p)
    }

    function moveStop(i: number, by: -1 | 1) {
        const next = [...form.stops]
        const [s] = next.splice(i, 1)
        next.splice(i + by, 0, s)
        patch({ stops: next })
    }

    async function chooseStart(mode: StartMode) {
        setFailure(null)
        setTapOverride(null)
        patch({ startMode: mode })
        if (mode === 'home') {
            if (home) {
                patch({ start: { ...home, label: 'Home' } })
                refit()
            } else setFailure({ code: 'no_start', message: 'No home saved yet. Use My location or choose a point, then save it as home.' })
        } else if (mode === 'gps') {
            try {
                patch({ start: { ...(await currentPosition()), label: 'My location' } })
                refit()
            } catch (err) {
                setFailure(err as RouteFailure)
            }
        } else setTapOverride('start')
    }

    async function saveHome() {
        if (!start) return
        const point = { lat: start.lat, lng: start.lng }
        try {
            await setHome(point)
            setHomePoint(point)
            patch({ startMode: 'home', start: { ...point, label: 'Home' } })
        } catch (err) {
            setFailure(routeFailure(err))
        }
    }

    async function generateLoop() {
        if (!start) return
        setFailure(null)
        setBusy(true)
        setCooldownUntil(clock() + (initialSettings?.cooldownMs ?? 8000))
        setNow(clock())
        try {
            const out = await generateWalkRoute({ start, stops: [], end: null, targetM })
            setRoute(out.route)
            setRouteKey(key)
            setRouteTargetM(targetM)
            setUsage(out.usage)
            setDirty(true)
            setSheetOpen(false)
            refit()
        } catch (err) {
            const f = routeFailure(err)
            if (f.code === 'cooldown' && f.retryInMs) setCooldownUntil(clock() + f.retryInMs)
            setFailure(f)
        } finally {
            setBusy(false)
        }
    }

    // Counts up by date, so each day's press starts from a different walk.
    const dayNumber = Math.floor(Date.parse(`${form.date}T00:00:00Z`) / 86_400_000)

    async function toggleStar() {
        if (!shown || !start) return
        setFailure(null)
        try {
            if (starred) {
                await deleteFavourite(starred._id)
                setFavourites((list) => list.filter((f) => f._id !== starred._id))
            } else {
                const saved = await createFavourite({ start, stops, end, route: shown })
                setFavourites((list) => [saved, ...list])
            }
        } catch (err) {
            setFailure(routeFailure(err))
        }
    }

    function loadFavourite(f: WalkFavourite) {
        const updated: Form = {
            ...form,
            start: f.start,
            startMode: f.start.label === 'Home' ? 'home' : 'choose',
            stops: f.stops,
            end: f.end,
            finishElsewhere: !!f.end,
        }
        setFailure(null)
        setForm(updated)
        setRoute(f.route)
        setRouteKey(pointsKey(updated))
        setRouteTargetM(null)
        setDirty(true)
        setSheetOpen(false)
        refit()
    }

    function chooseRepeat(mode: RepeatMode) {
        if (mode === 'custom') patch({ repeat: mode, days: form.days })
        else patch({ repeat: mode, days: daysForRepeat(mode) })
    }

    function toggleDay(day: number) {
        patch({ days: form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day] })
    }

    /** Keep the places, swap any point added last time, and stretch the walk to the target. */
    async function completeToTarget() {
        if (!start || !targetM) return
        setFailure(null)
        setBusy(true)
        setCooldownUntil(clock() + (initialSettings?.cooldownMs ?? 8000))
        setNow(clock())
        try {
            const out = await completeWalkRoute({ start, stops: kept, end, targetM, seed: dayNumber + completeTries })
            const next = [...kept]
            if (out.stop) next.splice(out.stopIndex, 0, { ...out.stop, label: ADDED })
            const updated = { ...form, stops: next }
            setForm(updated)
            setRoute(out.route)
            setRouteKey(pointsKey(updated))
            setRouteTargetM(null)
            setUsage(out.usage)
            setCompleteTries((n) => n + 1)
            setDirty(true)
            setSheetOpen(false)
            refit()
        } catch (err) {
            const f = routeFailure(err)
            if (f.code === 'cooldown' && f.retryInMs) setCooldownUntil(clock() + f.retryInMs)
            setFailure(f)
        } finally {
            setBusy(false)
        }
    }

    async function save() {
        if (!canSave || !start || !form.time) return
        setSaving(true)
        setFailure(null)
        try {
            const plan = { name: form.name, pace: form.pace, goal, start, stops, end, route: shown }
            if (isLibrary) {
                if (walk) await updateLibraryItem(walk._id, plan)
                else await createLibraryItem(plan)
                navigate(backTo)
                return
            }
            const body = {
                date: form.date,
                time: form.time,
                name: form.name,
                pace: form.pace,
                goal,
                start,
                stops,
                end,
                route: shown,
                days: form.days,
                applyToSeries: !!walk?.series && (applyFuture || repeatChanged),
                saveToLibrary: !walk,
            }
            if (walk) await updateWalk(walk._id, body)
            else await createWalk(body)
            navigate(backTo)
        } catch (err) {
            setFailure(routeFailure(err))
            setSaving(false)
        }
    }

    async function remove() {
        if (!walk) return
        try {
            if (isLibrary) await deleteLibraryItem(walk._id)
            else await deleteWalk(walk._id)
            navigate(backTo)
        } catch (err) {
            setFailure(routeFailure(err))
        }
    }

    /** Keep a day's walk, made before the library or changed since, as a plan to reuse. */
    async function keepInLibrary() {
        if (!start) return
        setFailure(null)
        try {
            await createLibraryItem({ name: form.name, pace: form.pace, goal, start, stops, end, route: shown })
            setKeptInLibrary(true)
        } catch (err) {
            setFailure(routeFailure(err))
        }
    }

    function openMaps() {
        if (!shown) return
        const url = googleMapsUrl(shown.coords, end ? 'oneway' : 'loop')
        const win = window.open(url, '_blank', 'noopener')
        if (!win) window.location.href = url
    }

    const leave = () => (dirty ? setConfirmLeave(true) : navigate(backTo))

    const litCheck = !isLibrary && form.time ? needsLitCheck(walkPart(form.time), form.date) : false
    const unit = GOAL_UNITS[form.kind]
    const failureText = failure ? (FAILURE_TEXT[failure.code] ?? failure.message) : ''
    const partName = form.time ? `${walkPart(form.time)[0].toUpperCase()}${walkPart(form.time).slice(1)} walk` : 'Walk'
    const backButton = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-neutral-700 transition-colors hover:bg-neutral-100'
    const smallIcon = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:hover:bg-transparent'
    const note = shown
        ? [form.time && estimate ? `Back around ${finishTime(form.time, estimate.minutes)}` : null, `↑${shown.ascentM} m ↓${shown.descentM} m`].filter(Boolean).join(' · ')
        : busy
          ? 'Finding a route…'
          : 'Estimated from your target'
    const fullNote = doublesBack ? `Doubles back in places · ${note}` : note

    return (
        <div className="fixed inset-0 overflow-hidden bg-neutral-100">
            <div className="absolute inset-0">
                <RouteMap
                    fill
                    coords={shown?.coords ?? null}
                    loop={!end}
                    start={start}
                    waypoints={waypoints}
                    steps={NO_STEPS}
                    hoverM={null}
                    fitKey={fitKey}
                    fitPadding={fitPadding}
                    pickLabel={tapFor ? `Map — ${TAP_TEXT[tapFor]}` : undefined}
                    onPick={tapFor ? tapMap : undefined}
                    onMoveStart={(p) => {
                        patch({ start: { ...p, label: PIN }, startMode: 'choose' })
                        nameLater(p)
                    }}
                    onMoveWaypoint={dragWaypoint}
                />
            </div>

            {/* Phones: the panel is a sheet, so the way back sits on the map. */}
            <button
                type="button"
                onClick={leave}
                aria-label="Back to Walking"
                className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 grid h-11 w-11 place-items-center rounded-xl bg-white text-neutral-800 shadow-md ring-1 ring-neutral-900/10 lg:hidden"
            >
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            </button>

            {tapFor && (
                <p className="pointer-events-none absolute left-1/2 top-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-lg lg:left-[calc(50%+220px)] lg:top-4">
                    <i className="fa-solid fa-location-dot mr-2 text-xs" aria-hidden="true" />
                    {TAP_TEXT[tapFor]}
                </p>
            )}

            {/* Desktop: the figures float over the map, clear of the panel. */}
            <div className="pointer-events-none absolute bottom-6 left-[calc(420px+2rem)] right-4 z-10 hidden justify-center lg:flex">
                <div className="pointer-events-auto rounded-3xl bg-white px-7 py-4 shadow-xl ring-1 ring-neutral-900/[0.06]">
                    <Readout estimate={estimate} />
                    <ReadoutNote gap={gap} note={fullNote} hint={!loop && !short && !doublesBack} />
                </div>
            </div>

            <aside
                aria-label="Plan this walk"
                className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-3xl bg-white shadow-2xl ring-1 ring-neutral-900/[0.06] lg:inset-y-4 lg:left-4 lg:right-auto lg:h-auto lg:w-[420px] lg:rounded-3xl ${sheetOpen ? 'h-[62dvh]' : ''}`}
            >
                <header className="flex shrink-0 items-center gap-2 px-4 pt-3 lg:px-5 lg:pt-4">
                    <button type="button" onClick={leave} aria-label="Back to Walking" className={`${backButton} -ml-2 hidden lg:grid`}>
                        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    </button>
                    <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.015em] text-neutral-950">{form.name || (walk ? (isLibrary ? 'Library walk' : partName) : 'New walk')}</h1>
                    {shown && (
                        <button
                            type="button"
                            onClick={() => void toggleStar()}
                            aria-pressed={!!starred}
                            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors hover:bg-neutral-100 ${starred ? 'text-amber-600' : 'text-neutral-700'}`}
                        >
                            <i className={`${starred ? 'fa-solid' : 'fa-regular'} fa-star`} aria-hidden="true" />
                            {starred ? 'Starred' : 'Star route'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setSheetOpen((o) => !o)}
                        aria-expanded={sheetOpen}
                        aria-label={sheetOpen ? 'Show more of the map' : 'Show the walk settings'}
                        className={`${backButton} -mr-2 lg:hidden`}
                    >
                        <i className={`fa-solid ${sheetOpen ? 'fa-chevron-down' : 'fa-chevron-up'}`} aria-hidden="true" />
                    </button>
                </header>

                <div className="shrink-0 px-4 pb-3 pt-1 lg:hidden">
                    <Readout estimate={estimate} />
                    <ReadoutNote gap={gap} note={fullNote} hint={!loop && !short && !doublesBack} />
                </div>

                <div className={`min-h-0 flex-1 flex-col gap-6 overflow-y-auto border-t border-neutral-100 px-4 py-5 lg:flex lg:px-5 ${sheetOpen ? 'flex' : 'hidden'}`}>
                    {failure && (
                        <p role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50/70 p-4 text-sm text-neutral-800">
                            <i className="fa-solid fa-triangle-exclamation mt-0.5 text-red-500" aria-hidden="true" />
                            {failureText}
                        </p>
                    )}
                    {litCheck && (
                        <p className="flex items-center gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                            <i className="fa-solid fa-lightbulb text-amber-500" aria-hidden="true" />
                            {LIT_WARNING}
                        </p>
                    )}

                    {nearby.length > 0 && (
                        <Group title="Starred routes from here">
                            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                                {nearby.map((f) => {
                                    const viewing = !!shown && sameRoute(f.route, shown)
                                    const kind = f.stops.length ? `via ${f.stops.length} ${f.stops.length === 1 ? 'place' : 'places'}` : f.end ? 'One way' : 'Loop'
                                    return (
                                        <li key={f._id} className="flex items-center gap-1 pr-1.5">
                                            <button type="button" onClick={() => loadFavourite(f)} aria-current={viewing || undefined} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3.5 py-2 text-left text-sm hover:bg-neutral-50">
                                                <span className="nums shrink-0 font-semibold text-neutral-900">{formatWalkKm(f.route.distanceM)}</span>
                                                <span className="nums min-w-0 flex-1 truncate text-neutral-500">
                                                    {kind} · ↑{f.route.ascentM} m · {starredOn(f.createdAt)}
                                                </span>
                                                {viewing && <span className="shrink-0 text-xs font-medium text-success">On the map</span>}
                                            </button>
                                            <button
                                                type="button"
                                                className={`${smallIcon} text-amber-500 hover:text-amber-600`}
                                                aria-label={`Unstar the ${formatWalkKm(f.route.distanceM)} route`}
                                                onClick={() => {
                                                    deleteFavourite(f._id)
                                                        .then(() => setFavourites((list) => list.filter((x) => x._id !== f._id)))
                                                        .catch((err) => setFailure(routeFailure(err)))
                                                }}
                                            >
                                                <i className="fa-solid fa-star" aria-hidden="true" />
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        </Group>
                    )}

                    {isLibrary && (
                        <Group title="Name">
                            <input
                                value={form.name}
                                maxLength={80}
                                onChange={(e) => patch({ name: e.target.value })}
                                placeholder="e.g. Coffee walk"
                                aria-label="Name"
                                className={`${FIELD_BASE} ${FIELD_IDLE} h-11 px-3.5`}
                            />
                        </Group>
                    )}

                    <Group title="Your target">
                        <PillToggle
                            label="Target"
                            value={form.kind}
                            onChange={changeKind}
                            options={(Object.keys(GOAL_UNITS) as WalkGoalKind[]).map((k) => ({ value: k, label: GOAL_UNITS[k].label }))}
                        />
                        <div className="relative">
                            <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={unit.step}
                                value={form.value}
                                onChange={(e) => patch({ value: e.target.value })}
                                aria-label={`Target in ${unit.unit}`}
                                className={`${FIELD_BASE} ${FIELD_IDLE} h-12 pl-3.5 pr-16 text-lg font-semibold`}
                            />
                            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-500">{unit.unit}</span>
                        </div>
                        {form.kind === 'calories' && !weightKg && <p className={FIELD_HINT}>Log a weigh-in first — calories are worked out from your bodyweight.</p>}
                        {loopOutOfRange && <p className={FIELD_HINT}>A loop has to be between 0.4 and 42 km.</p>}
                        <PillToggle
                            label="Pace"
                            value={form.pace}
                            onChange={(pace) => patch({ pace })}
                            options={(Object.keys(PACES) as WalkPace[]).map((p) => ({ value: p, label: `${PACES[p].label} · ${PACES[p].kmh} km/h` }))}
                        />
                    </Group>

                    <Group title="Start from">
                        <PillToggle
                            label="Start point"
                            value={form.startMode}
                            onChange={(m) => void chooseStart(m)}
                            options={[
                                { value: 'home', label: home ? 'Home' : 'Home (not set)' },
                                { value: 'gps', label: 'My location' },
                                { value: 'choose', label: 'Somewhere else' },
                            ]}
                        />
                        {form.startMode === 'choose' && <PlaceSearch near={start ?? home} placeholder="Search for a start point" onPick={(p) => searched('start', p)} />}
                        {start && <PointLine mark="S" tone="bg-emerald-500" label={start.label || 'Start'} />}
                        {start && form.startMode !== 'home' && (
                            <button type="button" onClick={() => void saveHome()} className="self-start text-sm font-medium text-neutral-700 underline-offset-2 hover:underline">
                                <i className="fa-solid fa-house mr-1.5 text-xs" aria-hidden="true" />
                                Save this point as home
                            </button>
                        )}
                    </Group>

                    <Group title="Places to pass">
                        {stops.length > 0 && (
                            <ol className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                                {stops.map((s, i) => {
                                    const name = s.label || `Stop ${i + 1}`
                                    return (
                                        <li key={`${i}-${s.lat},${s.lng}`} className="flex items-center gap-1 py-1 pl-3.5 pr-1.5">
                                            <span className="mr-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">{i + 1}</span>
                                            <span className="min-w-0 flex-1 truncate text-sm text-neutral-800">{name}</span>
                                            <button type="button" className={smallIcon} disabled={i === 0} onClick={() => moveStop(i, -1)} aria-label={`Move ${name} earlier`}>
                                                <i className="fa-solid fa-chevron-up" aria-hidden="true" />
                                            </button>
                                            <button type="button" className={smallIcon} disabled={i === stops.length - 1} onClick={() => moveStop(i, 1)} aria-label={`Move ${name} later`}>
                                                <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                                            </button>
                                            <button type="button" className={smallIcon} onClick={() => patch({ stops: stops.filter((_, j) => j !== i) })} aria-label={`Remove ${name}`}>
                                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                                            </button>
                                        </li>
                                    )
                                })}
                            </ol>
                        )}
                        {stops.length < MAX_STOPS ? (
                            <PlaceSearch near={start ?? home} placeholder="Search for a place to pass" onPick={(p) => searched('stop', p)} />
                        ) : (
                            <p className={FIELD_HINT}>That’s the most a walk can pass ({MAX_STOPS}).</p>
                        )}
                        <p className={FIELD_HINT}>
                            {loop ? 'None yet, so you’ll get a loop sized to your target.' : 'The route goes through these in order. Drag a pin to move it, or press Match my target to fill the distance.'}
                        </p>
                    </Group>

                    <Group title="Finish">
                        <PillToggle
                            label="Finish"
                            value={form.finishElsewhere ? 'other' : 'start'}
                            onChange={(v) => {
                                patch({ finishElsewhere: v === 'other' })
                                setTapOverride(null)
                            }}
                            options={[
                                { value: 'start', label: 'Back to the start' },
                                { value: 'other', label: 'Somewhere else' },
                            ]}
                        />
                        {form.finishElsewhere && <PlaceSearch near={start ?? home} placeholder="Search for a finish point" onPick={(p) => searched('end', p)} />}
                        {form.finishElsewhere && form.end && <PointLine mark="F" tone="bg-neutral-900" label={form.end.label || 'Finish'} />}
                    </Group>

                    {!isLibrary && (
                    <Group title="When">
                        <div className="grid grid-cols-2 gap-3">
                            <DatePicker
                                value={form.date}
                                onChange={(v: DatePickerValue) => {
                                    if (typeof v === 'string' && v) patch({ date: v })
                                }}
                            />
                            <TimePicker value={form.time} onChange={(time) => patch({ time })} align="right" />
                        </div>
                        <input
                            value={form.name}
                            maxLength={80}
                            onChange={(e) => patch({ name: e.target.value })}
                            placeholder={`Name (optional) — ${partName}`}
                            aria-label="Name (optional)"
                            className={`${FIELD_BASE} ${FIELD_IDLE} h-11 px-3.5`}
                        />
                        <span className={`${FIELD_LABEL} mt-1`}>Repeat</span>
                        <PillToggle label="Repeat" value={form.repeat} onChange={chooseRepeat} options={REPEAT_OPTIONS} />
                        {form.repeat === 'custom' && (
                            <div className="flex gap-1.5" role="group" aria-label="Days to repeat on">
                                {WEEK_ORDER.map((d) => (
                                    <button
                                        key={d}
                                        type="button"
                                        aria-pressed={form.days.includes(d)}
                                        aria-label={DAY_NAMES[d]}
                                        onClick={() => toggleDay(d)}
                                        className={`grid h-11 min-w-0 flex-1 place-items-center rounded-xl text-sm font-medium transition-colors ${form.days.includes(d) ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
                                    >
                                        {DAY_LETTERS[d]}
                                    </button>
                                ))}
                            </div>
                        )}
                        {form.days.length > 0 && <p className={FIELD_HINT}>Each day gets its own walk with a blank route, ready for that day’s.</p>}
                        {walk?.series && (
                            <label className="flex min-h-11 items-center gap-2.5 text-sm text-neutral-800">
                                <input type="checkbox" className="h-4 w-4" checked={applyFuture || repeatChanged} disabled={repeatChanged} onChange={(e) => setApplyFuture(e.target.checked)} />
                                {form.days.length === 0 ? 'Stop repeating this walk' : 'Use these settings on future days too'}
                            </label>
                        )}
                    </Group>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {shown && (
                            <Button variant="secondary" icon="fa-solid fa-diamond-turn-right" onClick={() => setConfirmMaps(true)}>
                                Open in Google Maps
                            </Button>
                        )}
                        {walk && !isLibrary && !walk.library && (
                            <Button variant="secondary" icon={keptInLibrary ? 'fa-solid fa-check' : 'fa-solid fa-bookmark'} disabled={keptInLibrary || !start} onClick={() => void keepInLibrary()}>
                                {keptInLibrary ? 'In your library' : 'Save to library'}
                            </Button>
                        )}
                        {walk && (
                            <Button variant="danger" icon="fa-solid fa-trash-can" onClick={() => setConfirmDelete(true)}>
                                Delete walk
                            </Button>
                        )}
                    </div>

                    <p className="text-xs leading-relaxed text-neutral-500">
                        Routes follow walkable streets and paths from OpenStreetMap. They say nothing about whether a route is lit, safe or quiet — check before you go.
                        {usage && ` ${usage.used} of ${usage.limit} routing calls used today.`}
                    </p>
                </div>

                <footer className="flex shrink-0 gap-2 border-t border-neutral-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-5 lg:pb-4">
                    {loop && (
                        <Button variant="secondary" size="lg" className="flex-1" icon={busy ? undefined : 'fa-solid fa-shuffle'} disabled={!canLoop} onClick={() => void generateLoop()}>
                            {busy ? 'Finding…' : waitSec > 0 ? `Another in ${waitSec}s` : fresh ? 'Another loop' : 'Generate loop'}
                        </Button>
                    )}
                    {!loop && (
                        <Button variant="secondary" size="lg" className="flex-1" icon={busy ? undefined : 'fa-solid fa-wand-magic-sparkles'} disabled={!canComplete} onClick={() => void completeToTarget()}>
                            {busy ? 'Finding…' : waitSec > 0 ? `Again in ${waitSec}s` : short ? 'Match my target' : hasAdded ? 'Another route' : doublesBack ? 'Make it a loop' : 'Match my target'}
                        </Button>
                    )}
                    <Button size="lg" className="flex-1" disabled={!canSave} onClick={() => void save()}>
                        {saving ? 'Saving…' : isLibrary ? 'Save to library' : walk ? 'Save walk' : 'Add walk'}
                    </Button>
                </footer>
            </aside>

            <ConfirmModal open={confirmMaps} title="Open in Google Maps" message={MAPS_WARNING} confirmLabel="Open Google Maps" onConfirm={openMaps} onClose={() => setConfirmMaps(false)} />
            <ConfirmModal open={confirmDelete} title="Delete this walk?" message={isLibrary ? 'It leaves your library. Walks already on your days stay.' : walk?.series ? 'Just this day. To stop it repeating, set Repeat to Just this day and save.' : 'It and its route will be gone.'} confirmLabel="Delete walk" danger onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)} />
            <ConfirmModal open={confirmLeave} title="Leave without saving?" message="Your changes to this walk won’t be kept." confirmLabel="Leave" danger onConfirm={() => navigate(backTo)} onClose={() => setConfirmLeave(false)} />
        </div>
    )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-2.5">
            <h2 className={FIELD_LABEL}>{title}</h2>
            {children}
        </section>
    )
}

function PointLine({ mark, tone, label }: { mark: string; tone: string; label: string }) {
    return (
        <p className="flex items-center gap-2 text-sm text-neutral-700">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white ${tone}`}>{mark}</span>
            <span className="min-w-0 truncate">{label}</span>
        </p>
    )
}

/** The walk's four figures, always in view. */
function Readout({ estimate }: { estimate: WalkEstimate | null }) {
    const figures = [
        { label: 'Distance', value: estimate ? formatWalkKm(estimate.distanceM) : '—' },
        { label: 'Time', value: estimate ? formatMinutes(estimate.minutes) : '—' },
        { label: 'Steps', value: estimate ? estimate.steps.toLocaleString('en-GB') : '—' },
        { label: 'Calories', value: estimate?.kcal != null ? `${estimate.kcal.toLocaleString('en-GB')} kcal` : '—' },
    ]
    return (
        <dl className="grid grid-cols-4 gap-3 lg:flex lg:gap-9">
            {figures.map((f) => (
                <div key={f.label} className="flex min-w-0 flex-col-reverse">
                    <dt className="truncate text-[12px] text-neutral-500">{f.label}</dt>
                    <dd className="nums truncate text-[15px] font-semibold tracking-[-0.01em] text-neutral-950 lg:text-[22px] lg:tracking-[-0.025em]">{f.value}</dd>
                </div>
            ))}
        </dl>
    )
}

function ReadoutNote({ gap, note, hint }: { gap: WalkGap | null; note: string; hint: boolean }) {
    return (
        <p className="nums mt-1.5 truncate text-[12px] text-neutral-500 lg:mt-2 lg:text-[13px]">
            {gap && (
                <span className={`font-medium ${gap.onTarget ? 'text-success' : 'text-amber-700'}`}>
                    {gap.text}
                    {!gap.onTarget && hint ? ' · move a pin to change it' : ''}
                    {' · '}
                </span>
            )}
            {note}
        </p>
    )
}
