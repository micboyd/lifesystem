import { RepList } from '../components/session/RepList'
import { useEffect, useMemo, useState } from 'react'
import ModuleLayout from '../components/ModuleLayout'
import { BarButton, ModuleBar } from '../components/Blok'
import { useSearchParams } from 'react-router-dom'
import PhaseHeading, { phaseSpan } from '../components/PhaseHeading'
import { Card } from '../components/Card'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import Input from '../components/Input'
import LibraryToolbar, { LibraryFilters } from '../components/LibraryToolbar'
import { useLibraryView } from '../lib/librarySort'
import Textarea from '../components/Textarea'
import Select from '../components/Select'
import EmptyState from '../components/EmptyState'
import DropdownMenu from '../components/DropdownMenu'
import Drawer from '../components/Drawer'
import Tabs from '../components/Tabs'
import Pagination from '../components/Pagination'
import LineIcon from '../components/LineIcon'
import StrengthLibraries from '../components/StrengthLibraries'
import ConditioningSessionsLog from '../components/ConditioningSessionsLog'
import FitnessWeeklyPlanner from '../components/FitnessWeeklyPlanner'
import { LARGE_QUERY, useMediaQuery } from '../components/planner/WeekPlannerUI'
import PlanLibrary from '../components/PlanLibrary'
import BodyMetrics from '../components/BodyMetrics'
import FitnessExportCenter from '../components/FitnessExportCenter'
import FitnessStats from '../components/stats/FitnessStats'
import ConditioningSessionDetail from '../components/ConditioningSessionDetail'
import ConditioningGroupsDrawer, { GroupChip } from '../components/ConditioningGroupsDrawer'
import { findGroup, useConditioningGroups } from '../lib/conditioningGroups'
import ConditioningLogDrawer, { type ConditioningLogTarget } from '../components/ConditioningLogDrawer'
import { listLogs as listConditioningLogs } from '../services/conditioningLogs'
import { todayKey } from '../lib/calendar'
import JsonImportPanel from '../components/JsonImportPanel'
import { SlotInputs } from '../components/SessionPace'
import { StepsInput, cleanSteps } from '../components/session/SessionUI'
import {
    listSessions,
    createSession,
    updateSession,
    deleteSession,
    importSessions,
    type ConditioningInput,
} from '../services/conditioning'
import { CONDITIONING_CATEGORIES, SESSION_PHASES } from '../types'
import type {
    ConditioningSession,
    ConditioningCategory,
    Phased,
    SessionPart,
    SessionPhase,
} from '../types'
import { allInPhases, emptyPhases, mapPhases } from '../lib/phases'
import { minutesLabel } from '../lib/sessionPace'

// ─── Import template ──────────────────────────────────────────────────────────

/**
 * The conditioning import format, annotated. JSON with comments — the importer
 * ignores them, so the template pastes straight back in as it is.
 */
const SESSION_TEMPLATE = `[
  // ── THE RULE: phases → sections → reps ───────────────────────────────────
  // Every session is written the same way, whatever the exercise:
  //   • three phases, in order: "warmUp", "main", "coolDown"
  //   • each phase is a list of sections ({ "name", "startMin", "endMin", "reps" })
  //   • each section is a list of "reps" — always, even a single steady block
  //     (that's one rep). The numbers live on the rep, never in prose.
  //
  // A rep — use the fields that apply, leave the rest out:
  //   "do"        what it is: "Run", "Walk", "Bike", "Row", "Calf raises"  (required)
  //   "time"      how long: "90s", "2 min", "1:30"
  //   "distance"  how far: "400 m", "1.5 km"
  //   "count"     how many, for a movement: 15
  //   "speed"     "7.0 km/h"      "pace"     "8:30/km"      "incline"  "1%"
  //   "effort"    how hard: "Easy", "Zone 2", "RPE 7", "200 W"
  //   "note"      anything else: "each side"
  //   "rest"      the recovery after it — a rep of its own ({ "do": "Walk", "time": "2 min" })
  //               or just a time for standing rest ("60s")
  //   "times"     repeat this rep: 6 identical reps are ONE entry with "times": 6
  //
  // Don't: describe reps in "detail", use "steps", "rounds", "roundDetails" or
  // "roundSeconds", or split one interval set into a section per rep.
  // "detail" is only a short coaching cue for the section.
  //
  // Sections need "startMin" and "endMin" — minutes from the start of the
  // session, in order. Your Completed press on each section is timed against
  // them so you see if you're on time. Decimals are fine (1.5 = 1:30).
  {
    "name": "Treadmill Run-Walk Intervals",   // required
    "duration": 36,                            // minutes
    "category": "Endurance",                   // HIIT | Cardio | Endurance | Mobility | Recovery
    "purpose": "Rebuild tolerance to running impact through controlled run-walk intervals.",
    "warmUp": [
      {
        // A list of drills: one rep each.
        "name": "Mobility drills",
        "startMin": 0,
        "endMin": 3,
        "reps": [
          { "do": "Leg swings", "count": 10, "note": "each side" },
          { "do": "Walking lunges", "count": 10 },
          { "do": "Ankle circles", "count": 10, "note": "each way" }
        ]
      },
      {
        // A steady block in two stages: two reps.
        "name": "Walk",
        "startMin": 3,
        "endMin": 7,
        "reps": [
          { "do": "Walk", "time": "2 min", "speed": "4.2 km/h", "incline": "0.5%" },
          { "do": "Walk", "time": "2 min", "speed": "5.2 km/h", "incline": "0.5%" }
        ]
      }
    ],
    "main": [
      {
        // An interval set: one entry, repeated with "times".
        "name": "Run-walk intervals",
        "detail": "Relaxed shoulders, short quick steps.",  // optional cue
        "startMin": 7,
        "endMin": 28,
        "reps": [
          {
            "times": 6,
            "do": "Jog",
            "time": "90s",
            "speed": "7.0 km/h",
            "effort": "Conversational",
            "rest": { "do": "Walk", "time": "2 min", "speed": "5.0 km/h" }
          }
        ]
      }
    ],
    "coolDown": [
      {
        "name": "Walk",
        "startMin": 28,
        "endMin": 33,
        "reps": [
          { "do": "Walk", "time": "2 min", "speed": "5.0 km/h" },
          { "do": "Walk", "time": "3 min", "speed": "4.0 km/h" }
        ]
      },
      {
        "name": "Stretch",
        "startMin": 33,
        "endMin": 36,
        "reps": [
          { "do": "Calf stretch", "time": "30s", "note": "each side" },
          { "do": "Hamstring stretch", "time": "30s", "note": "each side" },
          { "do": "Quad stretch", "time": "30s", "note": "each side" }
        ]
      }
    ],
    "howToUse": "Leave at least one non-running day before the next run.",
    "helpers": ["Cones at 0, 5 and 10 m"],
    // Optional: put it straight on the planner — a date, or a date and slot.
    "plan": [{ "date": "2026-08-11", "part": "evening" }, "2026-08-14"]
  }
]
`

const TABS = ['Planner', 'Strength', 'Conditioning', 'Plans', 'Stats', 'Body'] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, string> = {
    Planner: 'fa-solid fa-table-cells',
    Strength: 'fa-solid fa-dumbbell',
    Conditioning: 'fa-solid fa-heart-pulse',
    Plans: 'fa-solid fa-file-lines',
    Stats: 'fa-solid fa-chart-column',
    Body: 'fa-solid fa-weight-scale',
}


export default function Fitness() {
    // `?tab=plans` / `?tab=body` lets another page (the Timeline's setup list)
    // land on a tab. Read once on arrival, then dropped from the URL.
    const [searchParams, setSearchParams] = useSearchParams()
    const [tab, setTab] = useState<Tab>(
        () => TABS.find((t) => t.toLowerCase() === searchParams.get('tab')) ?? 'Planner'
    )
    useEffect(() => {
        if (searchParams.has('tab')) setSearchParams({}, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const [exportOpen, setExportOpen] = useState(false)
    // Set when applying a plan sends us to the planner, so it opens on the week
    // the plan actually starts rather than on this one. Cleared as soon as the
    // user picks a tab themselves, so the planner goes back to opening on today.
    const [plannerStart, setPlannerStart] = useState<string | null>(null)
    const isLarge = useMediaQuery(LARGE_QUERY)
    void isLarge

    return (
        <>
        <ModuleBar
            title="Fitness"
            actions={
                <BarButton onClick={() => setExportOpen(true)}>Export</BarButton>
            }
        />
        <ModuleLayout
            asideLabel="Library"
            sectionsLabel="Fitness sections"
            sections={TABS.map((t) => ({
                label: t,
                icon: TAB_ICONS[t],
                active: t === tab,
                onClick: () => {
                    setTab(t)
                    setPlannerStart(null)
                },
            }))}
        >
        <main className="px-5 pb-24 pt-10 sm:px-10">
            <div>

                {tab === 'Planner' ? (
                    // Keyed so a fresh week request remounts the planner on it.
                    <FitnessWeeklyPlanner
                        key={plannerStart ?? 'today'}
                        startOn={plannerStart ?? undefined}
                    />
                ) : tab === 'Plans' ? (
                    <PlanLibrary
                        onApplied={(firstDate) => {
                            setPlannerStart(firstDate)
                            setTab('Planner')
                        }}
                    />
                ) : tab === 'Stats' ? (
                    <FitnessStats />
                ) : tab === 'Body' ? (
                    <BodyMetrics />
                ) : tab === 'Strength' ? (
                    <StrengthLibraries />
                ) : (
                    <ConditioningSection />
                )}
            </div>

            <FitnessExportCenter open={exportOpen} onClose={() => setExportOpen(false)} />
        </main>
        </ModuleLayout>
        </>
    )
}

// ─── Conditioning section ───────────────────────────────────────────────────────

const CONDITIONING_SUB_TABS = ['Session Library', 'Sessions'] as const
type ConditioningSubTab = (typeof CONDITIONING_SUB_TABS)[number]

/** Conditioning splits into logged Sessions and the reusable Session Library. */
function ConditioningSection() {
    const [sub, setSub] = useState<ConditioningSubTab>('Session Library')

    return (
        <div className="flex flex-col gap-6">
            <Tabs
                tabs={[...CONDITIONING_SUB_TABS]}
                value={sub}
                onChange={(t) => setSub(t as ConditioningSubTab)}
                className="self-start"
            />

            {sub === 'Sessions' ? <ConditioningSessionsLog /> : <ConditioningLibrary />}
        </div>
    )
}

// ─── Category presentation ─────────────────────────────────────────────────────

const CATEGORY_META: Record<ConditioningCategory, string> = {
    HIIT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    Cardio: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    Endurance: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    Mobility: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Recovery: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

function CategoryChip({ category }: { category: ConditioningCategory }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CATEGORY_META[category]}`}
        >
            {category}
        </span>
    )
}

// ─── Library ────────────────────────────────────────────────────────────────────

/** Drawer state: viewing a session, adding a new one, or editing an existing one. */
type Drawered =
    | { mode: 'view'; session: ConditioningSession }
    | { mode: 'create' }
    | { mode: 'edit'; session: ConditioningSession }
    | null

const PAGE_SIZE = 9

function ConditioningLibrary() {
    const [loading, setLoading] = useState(true)
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [importing, setImporting] = useState(false)
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState<'all' | ConditioningCategory>('all')
    const [groupFilter, setGroupFilter] = useState('all')
    const [groupsOpen, setGroupsOpen] = useState(false)
    const groups = useConditioningGroups()
    const [page, setPage] = useState(1)

    useEffect(() => {
        listSessions()
            .then(setSessions)
            .finally(() => setLoading(false))
    }, [])

    // Filter by name/purpose and type, sort, then paginate the matches 9 at a time.
    const searched = useMemo(() => {
        const q = search.trim().toLowerCase()
        return sessions.filter(
            (s) =>
                (category === 'all' || s.category === category) &&
                (groupFilter === 'all' ||
                    (groupFilter === 'none' ? !findGroup(groups, s.group) : s.group === groupFilter)) &&
                (!q || s.name.toLowerCase().includes(q) || (s.purpose ?? '').toLowerCase().includes(q))
        )
    }, [sessions, search, category, groupFilter, groups])
    const view = useLibraryView('sessions', searched)
    const filtered = view.shown
    const types = CONDITIONING_CATEGORIES.filter((c) => sessions.some((s) => s.category === c))

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    async function reload() {
        setSessions(await listSessions())
    }

    // Log a session today. If it's already been logged today, pick that log back
    // up rather than adding a second one — the same rule the planner ticks by.
    const [logTarget, setLogTarget] = useState<ConditioningLogTarget | null>(null)
    async function startSession(session: ConditioningSession) {
        const date = todayKey()
        const existing = await listConditioningLogs()
            .then((logs) => logs.find((l) => l.session === session._id && l.date === date))
            .catch(() => undefined)
        setDrawer(null)
        setLogTarget({
            session,
            date,
            tapsKey: `session:${session._id}:${date}`,
            stepsKey: `session:${session._id}:${date}`,
            existingLogId: existing?._id ?? null,
            notes: existing?.notes,
        })
    }

    async function handleAdd(fields: ConditioningInput) {
        const session = await createSession(fields)
        setSessions((prev) => [...prev, session])
    }

    async function handleSave(id: string, fields: ConditioningInput) {
        const updated = await updateSession(id, fields)
        setSessions((prev) => prev.map((s) => (s._id === id ? updated : s)))
        setDrawer((d) =>
            d && d.mode === 'view' && d.session._id === id ? { mode: 'view', session: updated } : d
        )
    }

    async function handleDelete(id: string) {
        setSessions((prev) => prev.filter((s) => s._id !== id))
        setDrawer((d) => (d && 'session' in d && d.session._id === id ? null : d))
        await deleteSession(id)
    }

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import sessions"
                description="Copy the template, fill it in with your own conditioning sessions, then paste the JSON below to add them all to your library at once."
                template={SESSION_TEMPLATE}
                itemNoun="session"
                onBack={() => setImporting(false)}
                doImport={importSessions}
                resource="conditioning"
                existingItems={sessions}
                onLibraryChanged={reload}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
                notes={
                    <>
                        <p>
                            <span className="font-semibold text-neutral-700">name</span> is the only
                            required field. Everything else is optional and defaults sensibly.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">category</span> must be
                            one of: {CONDITIONING_CATEGORIES.join(', ')}.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">plan</span> is optional
                            — add it to also drop the session onto your weekly planner. Use a date
                            string{' '}
                            <span className="font-semibold text-neutral-700">"2026-08-11"</span>{' '}
                            (lands in the morning), a{' '}
                            <span className="font-semibold text-neutral-700">
                                {'{ date, part }'}
                            </span>{' '}
                            object (part is morning, afternoon or evening), or an array of either to
                            schedule it on several days. Leave it out to just add to the library.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">
                                One structure, always: phases → sections → reps.
                            </span>{' '}
                            Every session has{' '}
                            <span className="font-semibold text-neutral-700">warmUp</span>,{' '}
                            <span className="font-semibold text-neutral-700">main</span> and{' '}
                            <span className="font-semibold text-neutral-700">coolDown</span>. Each
                            is a list of sections with a{' '}
                            <span className="font-semibold text-neutral-700">name</span>, a slot (
                            <span className="font-semibold text-neutral-700">startMin</span> /{' '}
                            <span className="font-semibold text-neutral-700">endMin</span>) and a{' '}
                            <span className="font-semibold text-neutral-700">reps</span> list — even
                            a steady block is one rep.
                        </p>
                        <p>
                            A rep says what you do in fields, not prose:{' '}
                            <span className="font-semibold text-neutral-700">do</span>,{' '}
                            <span className="font-semibold text-neutral-700">time</span>,{' '}
                            <span className="font-semibold text-neutral-700">distance</span>,{' '}
                            <span className="font-semibold text-neutral-700">count</span>,{' '}
                            <span className="font-semibold text-neutral-700">speed</span>,{' '}
                            <span className="font-semibold text-neutral-700">pace</span>,{' '}
                            <span className="font-semibold text-neutral-700">incline</span>,{' '}
                            <span className="font-semibold text-neutral-700">effort</span>,{' '}
                            <span className="font-semibold text-neutral-700">note</span>, plus a{' '}
                            <span className="font-semibold text-neutral-700">rest</span> after it.{' '}
                            <span className="font-semibold text-neutral-700">times</span> repeats a
                            rep, so six identical intervals are one entry.
                        </p>
                        <p>
                            Older files using <span className="font-semibold text-neutral-700">rounds</span>,{' '}
                            <span className="font-semibold text-neutral-700">roundDetails</span> or{' '}
                            <span className="font-semibold text-neutral-700">steps</span> still
                            import — they&apos;re turned into reps — but new files should use{' '}
                            <span className="font-semibold text-neutral-700">reps</span> only.
                        </p>
                    </>
                }
            />
        )
    }

    return (
        <>
            <LibraryToolbar
                search={search}
                onSearch={(v) => {
                    setSearch(v)
                    setPage(1)
                }}
                placeholder="Search sessions…"
                count={loading || !sessions.length ? undefined : filtered.length}
                noun="session"
                onImport={() => setImporting(true)}
                newLabel="New session"
                onNew={() => setDrawer({ mode: 'create' })}
                menu={
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-tags"
                        onClick={() => setGroupsOpen(true)}
                        aria-label="Categories"
                        className="px-3.5 sm:px-[18px]"
                    >
                        <span className="hidden sm:inline">Categories</span>
                    </Button>
                }
            >
                {sessions.length > 0 && (
                    <LibraryFilters
                        sort={view.sort}
                        onSort={(v) => {
                            view.onSort(v)
                            setPage(1)
                        }}
                        newCount={view.newCount}
                        newOnly={view.newOnly}
                        onNewOnly={(v) => {
                            view.onNewOnly(v)
                            setPage(1)
                        }}
                    >
                        {groups.length > 0 && (
                            <Select
                                value={groupFilter}
                                onChange={(v) => {
                                    setGroupFilter(v)
                                    setPage(1)
                                }}
                                options={[
                                    { value: 'all', label: 'All categories' },
                                    ...groups.map((g) => ({ value: g._id, label: g.name })),
                                    { value: 'none', label: 'No category' },
                                ]}
                                className="w-full sm:w-44"
                            />
                        )}
                        {types.length > 1 && (
                            <Select
                                value={category}
                                onChange={(v) => {
                                    setCategory(v as 'all' | ConditioningCategory)
                                    setPage(1)
                                }}
                                options={[
                                    { value: 'all', label: 'All types' },
                                    ...types.map((c) => ({ value: c, label: c })),
                                ]}
                                className="w-full sm:w-40"
                            />
                        )}
                    </LibraryFilters>
                )}
            </LibraryToolbar>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : sessions.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-heart-pulse"
                    title="No sessions yet"
                    description="Add your first conditioning session to start building a library."
                    action={
                        <Button
                            icon="fa-solid fa-plus"
                            onClick={() => setDrawer({ mode: 'create' })}
                        >
                            New session
                        </Button>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={
                        search.trim()
                            ? `No sessions match “${search.trim()}”.`
                            : 'No sessions fit these filters.'
                    }
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {pageItems.map((session) => (
                            <SessionCard
                                key={session._id}
                                session={session}
                                onOpen={() => setDrawer({ mode: 'view', session })}
                                onEdit={() => setDrawer({ mode: 'edit', session })}
                                onDelete={() => handleDelete(session._id)}
                            />
                        ))}
                    </div>
                    <Pagination
                        page={page}
                        pageCount={pageCount}
                        onChange={setPage}
                        className="mt-6 justify-center"
                    />
                </>
            )}

            <SessionViewDrawer
                session={drawer?.mode === 'view' ? drawer.session : null}
                onClose={() => setDrawer(null)}
                onEdit={(session) => setDrawer({ mode: 'edit', session })}
                onDelete={handleDelete}
                onStart={startSession}
            />

            <ConditioningLogDrawer target={logTarget} onClose={() => setLogTarget(null)} />

            <ConditioningGroupsDrawer open={groupsOpen} onClose={() => setGroupsOpen(false)} />

            <SessionFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

// ─── Session card ───────────────────────────────────────────────────────────────

function SessionCard({
    session,
    onOpen,
    onEdit,
    onDelete,
}: {
    session: ConditioningSession
    onOpen: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const partCount = allInPhases(session).length
    const group = findGroup(useConditioningGroups(), session.group)
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`View ${session.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{session.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                        {minutesLabel(session.duration)}
                        {partCount > 0
                            ? ` · ${partCount} ${partCount === 1 ? 'part' : 'parts'}`
                            : ''}
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Session actions"
                            className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        {
                            label: 'Delete',
                            icon: 'fa-solid fa-trash-can',
                            danger: true,
                            onClick: onDelete,
                        },
                    ]}
                />
            </div>

            <div className="flex flex-wrap gap-1.5">
                {group && <GroupChip group={group} />}
                <CategoryChip category={session.category} />
            </div>

            {session.purpose && (
                <p className="mt-auto line-clamp-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                    {session.purpose}
                </p>
            )}
        </Card>
    )
}

// ─── View drawer ────────────────────────────────────────────────────────────────

function SessionViewDrawer({
    session,
    onClose,
    onEdit,
    onDelete,
    onStart,
}: {
    session: ConditioningSession | null
    onClose: () => void
    onEdit: (session: ConditioningSession) => void
    onDelete: (id: string) => void
    /** Open the session logger on this session, dated today. */
    onStart: (session: ConditioningSession) => Promise<void>
}) {
    // Retain the last session while the drawer animates closed.
    const [view, setView] = useState<ConditioningSession | null>(session)
    useEffect(() => {
        if (session) setView(session)
    }, [session])
    const [starting, setStarting] = useState(false)

    const s = view
    return (
        <Drawer
            open={!!session}
            onClose={onClose}
            size="2xl"
            title={s?.name ?? 'Session'}
            footer={
                s && (
                    <div className="flex w-full items-center gap-2">
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(s._id)}
                            aria-label="Delete"
                            className="mr-auto"
                        >
                            <span className="hidden sm:inline">Delete</span>
                        </Button>
                        <Button variant="secondary" icon="fa-solid fa-pen" onClick={() => onEdit(s)}>
                            Edit
                        </Button>
                        <Button
                            icon="fa-solid fa-play"
                            disabled={starting}
                            onClick={async () => {
                                setStarting(true)
                                try {
                                    await onStart(s)
                                } finally {
                                    setStarting(false)
                                }
                            }}
                        >
                            Start session
                        </Button>
                    </div>
                )
            }
        >
            {s && <ConditioningSessionDetail session={s} overview />}
        </Drawer>
    )
}

// ─── Add / edit drawer ──────────────────────────────────────────────────────────

type FormState = { mode: 'create' } | { mode: 'edit'; session: ConditioningSession }

/** A part row carries a stable key for React list editing. */
interface PartRow extends SessionPart {
    key: string
}

let rowSeq = 0
const nextKey = () => `row-${rowSeq++}`

function SessionFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: FormState | null
    onClose: () => void
    onAdd: (fields: ConditioningInput) => Promise<void>
    onSave: (id: string, fields: ConditioningInput) => Promise<void>
}) {
    const [view, setView] = useState<FormState | null>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.session : undefined

    const [name, setName] = useState('')
    const [duration, setDuration] = useState('0')
    const [category, setCategory] = useState<ConditioningCategory>('HIIT')
    const groups = useConditioningGroups()
    const [group, setGroup] = useState('')
    const [purpose, setPurpose] = useState('')
    const [parts, setParts] = useState<Phased<PartRow>>(emptyPhases)
    const [howToUse, setHowToUse] = useState('')
    const [helpers, setHelpers] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset all fields whenever the drawer opens for a different session.
    useEffect(() => {
        setName(editing?.name ?? '')
        setDuration(editing?.duration != null ? String(editing.duration) : '0')
        setCategory(editing?.category ?? 'HIIT')
        setGroup(editing?.group ?? '')
        setPurpose(editing?.purpose ?? '')
        setParts(
            editing
                ? mapPhases(editing, (list) => list.map((p) => ({ ...p, key: nextKey() })))
                : emptyPhases()
        )
        setHowToUse(editing?.howToUse ?? '')
        setHelpers((editing?.helpers ?? []).join('\n'))
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const valid = name.trim() !== ''

    function num(s: string): number {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 ? n : 0
    }

    async function submit() {
        if (!view || !valid) return
        const fields: ConditioningInput = {
            name: name.trim(),
            duration: num(duration),
            category,
            group: group || null,
            purpose: purpose.trim() || undefined,
            ...mapPhases(parts, (list) =>
                list
                    .map((p) => {
                        const rounds = p.rounds && p.rounds >= 1 ? Math.floor(p.rounds) : undefined
                        return {
                            name: p.name.trim(),
                            detail: p.detail?.trim() || undefined,
                            rounds,
                            roundLabel: rounds ? p.roundLabel?.trim() || undefined : undefined,
                            // Preserve per-rep info/timing set via import (no form editor for it yet).
                            roundDetails:
                                rounds && p.roundDetails?.length ? p.roundDetails : undefined,
                            roundSeconds:
                                rounds && p.roundSeconds?.length ? p.roundSeconds : undefined,
                            startAtSec: rounds ? p.startAtSec : undefined,
                            startMin: p.startMin,
                            endMin: p.endMin,
                            steps: cleanSteps(p.steps),
                            // Reps come from an import; the form keeps them as they are.
                            reps: p.reps?.length ? p.reps : undefined,
                        }
                    })
                    .filter((p) => p.name !== '')
            ),
            howToUse: howToUse.trim() || undefined,
            helpers: helpers
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
        }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.session._id, fields)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={view?.mode === 'edit' ? 'Edit session' : 'New session'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : view?.mode === 'edit' ? 'Save' : 'Add'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Input
                    label="Session name *"
                    autoFocus
                    placeholder="e.g. Extensive Tempo Runs"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <div className="flex gap-3">
                    <Input
                        label="Duration (min) *"
                        type="number"
                        min={0}
                        step="any"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="flex-1"
                    />
                    <Select
                        label="Type *"
                        value={category}
                        onChange={(v) => setCategory(v as ConditioningCategory)}
                        options={CONDITIONING_CATEGORIES.map((c) => ({ label: c, value: c }))}
                        className="flex-1"
                    />
                </div>

                {groups.length > 0 && (
                    <Select
                        label="Category"
                        value={findGroup(groups, group) ? group : ''}
                        onChange={setGroup}
                        options={[
                            { value: '', label: 'None' },
                            ...groups.map((g) => ({ value: g._id, label: g.name })),
                        ]}
                    />
                )}

                <Textarea
                    label="Purpose"
                    rows={2}
                    placeholder="e.g. Build aerobic base, support recovery, improve work capacity"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                />

                {SESSION_PHASES.map((phase) => (
                    <PartsEditor
                        key={phase}
                        phase={phase}
                        rows={parts[phase]}
                        onChange={(rows) => setParts((prev) => ({ ...prev, [phase]: rows }))}
                    />
                ))}

                <Textarea
                    label="Helpers"
                    rows={3}
                    placeholder={
                        'Setup to lay out first, one per line, e.g.\nCones at 0, 5 and 10 m (5 m apart)\nStart line + turn line'
                    }
                    value={helpers}
                    onChange={(e) => setHelpers(e.target.value)}
                />

                <Textarea
                    label="How to use"
                    rows={3}
                    placeholder="When to run this session, pacing cues, progressions…"
                    value={howToUse}
                    onChange={(e) => setHowToUse(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

// ─── Parts editor ───────────────────────────────────────────────────────────────

const EMPTY_PHASE_HINT: Record<SessionPhase, string> = {
    warmUp: 'No warm-up yet — easy movement to build up to the main session.',
    main: 'No main session yet — the intervals, run or circuit itself.',
    coolDown: 'No cool-down yet — easy movement to bring things back down.',
}

function PartsEditor({
    phase,
    rows,
    onChange,
}: {
    phase: SessionPhase
    rows: PartRow[]
    onChange: (rows: PartRow[]) => void
}) {
    function update(key: string, patch: Partial<SessionPart>) {
        onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    }
    function remove(key: string) {
        onChange(rows.filter((r) => r.key !== key))
    }
    function add() {
        // A new part picks up where the last one's slot ends.
        const after = rows[rows.length - 1]?.endMin
        onChange([
            ...rows,
            {
                key: nextKey(),
                name: '',
                detail: '',
                ...(after !== undefined ? { startMin: after } : {}),
            },
        ])
    }

    return (
        <div className="flex flex-col gap-2">
            <PhaseHeading
                phase={phase}
                meta={phaseSpan(rows)}
                right={
                    <Button variant="ghost" size="sm" icon="fa-solid fa-plus" onClick={add}>
                        Add part
                    </Button>
                }
            />

            {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-500">
                    {EMPTY_PHASE_HINT[phase]}
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {rows.map((r, i) => (
                        <div
                            key={r.key}
                            className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3"
                        >
                            <div className="flex items-center gap-2">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <Input
                                    wrapperClassName="min-w-0 flex-1"
                                    placeholder={
                                        phase === 'main'
                                            ? 'Part name (e.g. Intervals)'
                                            : 'Part name (e.g. Easy jog)'
                                    }
                                    value={r.name}
                                    onChange={(e) => update(r.key, { name: e.target.value })}
                                />
                                <button
                                    type="button"
                                    aria-label="Remove part"
                                    onClick={() => remove(r.key)}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-red-600"
                                >
                                    <i className="fa-solid fa-xmark" />
                                </button>
                            </div>
                            <Textarea
                                className="resize-y" wrapperClassName="w-full"
                                rows={2}
                                placeholder="Details (sets, reps, distance, pace…)"
                                value={r.detail ?? ''}
                                onChange={(e) => update(r.key, { detail: e.target.value })}
                            />

                            {r.reps?.length ? (
                                <div className="flex flex-col gap-1.5 pl-8">
                                    <RepList part={r} />
                                    <p className="text-xs text-neutral-500">
                                        Reps come from the import — re-import the session to change them.
                                    </p>
                                </div>
                            ) : (
                                <StepsInput
                                    steps={r.steps}
                                    label={r.name || `part ${i + 1}`}
                                    onChange={(steps) => update(r.key, { steps })}
                                />
                            )}

                            <div className="pl-8">
                                <SlotInputs
                                    slot={r}
                                    label={r.name || `part ${i + 1}`}
                                    onChange={(s) =>
                                        update(r.key, { startMin: s.startMin, endMin: s.endMin })
                                    }
                                />
                            </div>

                            {/* Optional interval counter — leave rounds blank for plain parts. */}
                            {!r.reps?.length && (
                            <div className="flex flex-wrap items-center gap-2 pl-8 text-xs text-neutral-500">
                                <span className="font-medium">Tap-to-count</span>
                                <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    wrapperClassName="w-16"
                                    placeholder="6"
                                    value={r.rounds ?? ''}
                                    onChange={(e) =>
                                        update(r.key, {
                                            rounds: e.target.value
                                                ? Number(e.target.value)
                                                : undefined,
                                        })
                                    }
                                />
                                <span>rounds of</span>
                                <Input
                                    wrapperClassName="w-28"
                                    placeholder="round"
                                    disabled={!r.rounds}
                                    value={r.roundLabel ?? ''}
                                    onChange={(e) => update(r.key, { roundLabel: e.target.value })}
                                />
                            </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
