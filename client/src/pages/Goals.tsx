import { useCallback, useEffect, useMemo, useState } from 'react'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import Tabs from '../components/Tabs'
import EmptyState from '../components/EmptyState'
import ConfirmModal from '../components/ConfirmModal'
import DropdownMenu, { type MenuEntry } from '../components/DropdownMenu'
import SystemCard from '../components/goals/SystemCard'
import HabitRow from '../components/goals/HabitRow'
import HabitModal, { type HabitDraft } from '../components/goals/HabitModal'
import GoalModal, { type GoalDraft } from '../components/goals/GoalModal'
import GoalDrawer from '../components/goals/GoalDrawer'
import { MoreTrigger, SectionLabel } from '../components/goals/ui'
import { listGoals, createGoal, updateGoal, deleteGoal } from '../services/goals'
import { listHabits, listLogs, createHabit, updateHabit, deleteHabit, checkHabit, uncheckHabit } from '../services/habits'
import { useInvalidate } from '../context/DataSyncContext'
import { addDays, todayKey } from '../lib/calendar'
import { iconForHabit } from '../lib/habitIcons'
import { buildSystems, completedDates, lastDays, linkChange, streakFor } from '../lib/habitSystem'
import type { Goal, HabitDef, HabitLog } from '../types'

/** How far back logs are pulled — long enough for any realistic streak. */
const LOG_WINDOW_DAYS = 120
const DOT_DAYS = 14
const TABS = ['Active', 'Done'] as const
type Tab = (typeof TABS)[number]

type Confirm = { kind: 'goal'; goal: Goal } | { kind: 'habit'; habit: HabitDef }

/**
 * Habits and the goals they build toward, as systems: each goal sits beside the
 * daily habits that feed it, and today's ticks happen right there in the row.
 */
export default function Goals() {
    const invalidate = useInvalidate()
    const today = todayKey()
    const [goals, setGoals] = useState<Goal[]>([])
    const [habits, setHabits] = useState<HabitDef[]>([])
    const [logs, setLogs] = useState<HabitLog[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<Tab>('Active')
    const [busy, setBusy] = useState<Set<string>>(new Set())

    const [habitEditor, setHabitEditor] = useState<{ habit: HabitDef | null; presetGoalIds: string[] } | null>(null)
    const [goalEditor, setGoalEditor] = useState<{ goal: Goal | null } | null>(null)
    const [openGoalId, setOpenGoalId] = useState<string | null>(null)
    const [confirm, setConfirm] = useState<Confirm | null>(null)

    useEffect(() => {
        Promise.all([listGoals(), listHabits(), listLogs(addDays(today, -LOG_WINDOW_DAYS), today)])
            .then(([g, h, l]) => {
                setGoals(g)
                setHabits(h)
                setLogs(l)
            })
            .finally(() => setLoading(false))
    }, [today])

    const done = useMemo(() => completedDates(logs), [logs])
    const days = useMemo(() => lastDays(today, DOT_DAYS), [today])
    const systems = useMemo(() => buildSystems(goals, habits), [goals, habits])
    const activeHabits = habits.filter((h) => h.active)
    const doneToday = activeHabits.filter((h) => done.get(h._id)?.has(today)).length
    const bestStreak = Math.max(0, ...activeHabits.map((h) => streakFor(done.get(h._id), today)))
    const activeGoals = goals.filter((g) => g.status === 'active')
    const finishedGoals = goals.filter((g) => g.status !== 'active')
    const archivedHabits = habits.filter((h) => !h.active)
    const openGoal = goals.find((g) => g._id === openGoalId) ?? null

    const replaceGoal = useCallback(
        (g: Goal) => setGoals((prev) => prev.map((x) => (x._id === g._id ? g : x))),
        []
    )

    // ─── Ticking ────────────────────────────────────────────────────────────

    async function toggle(habit: HabitDef) {
        if (busy.has(habit._id)) return
        setBusy((s) => new Set(s).add(habit._id))
        const isDone = done.get(habit._id)?.has(today) ?? false
        try {
            if (isDone) {
                await uncheckHabit(habit._id, today)
                setLogs((prev) => prev.filter((l) => !(l.habit === habit._id && l.date === today)))
            } else {
                const log = await checkHabit(habit._id, today)
                setLogs((prev) => [...prev.filter((l) => !(l.habit === habit._id && l.date === today)), log])
            }
            invalidate('habits')
            // Habit-driven progress is computed server-side, so re-read it.
            if (goals.some((g) => g.progressMode === 'auto' && g.linkedHabits.includes(habit._id))) {
                setGoals(await listGoals())
            }
        } finally {
            setBusy((s) => {
                const n = new Set(s)
                n.delete(habit._id)
                return n
            })
        }
    }

    // ─── Saving ─────────────────────────────────────────────────────────────

    async function saveHabit(draft: HabitDraft) {
        const existing = habitEditor?.habit ?? null
        const habit = existing
            ? await updateHabit(existing._id, {
                  name: draft.name,
                  description: draft.description || undefined,
                  icon: draft.icon ?? null,
                  part: draft.part ?? null,
              })
            : await createHabit(draft.name, draft.description || undefined, draft.icon, draft.part)
        setHabits((prev) => (existing ? prev.map((h) => (h._id === habit._id ? habit : h)) : [...prev, habit]))

        // Links live on the goal, so join or leave each goal whose membership changed.
        const changed = activeGoals.filter(
            (g) => g.linkedHabits.includes(habit._id) !== draft.goalIds.includes(g._id)
        )
        const updated = await Promise.all(
            changed.map((g) => updateGoal(g._id, linkChange(g, habit._id, draft.goalIds.includes(g._id))))
        )
        updated.forEach(replaceGoal)
        invalidate('habits')
        setHabitEditor(null)
    }

    async function saveGoal(draft: GoalDraft) {
        const existing = goalEditor?.goal ?? null
        const fields = {
            title: draft.title,
            description: draft.description || undefined,
            targetDate: draft.targetDate || undefined,
            linkedHabits: draft.habitIds,
        }
        if (existing) {
            // Mirror linkChange: first habit in → follow habits; last one out → manual.
            const hadHabits = existing.linkedHabits.length > 0
            const hasHabits = draft.habitIds.length > 0
            const mode = !hadHabits && hasHabits ? 'auto' : hadHabits && !hasHabits ? 'manual' : undefined
            replaceGoal(await updateGoal(existing._id, { ...fields, ...(mode ? { progressMode: mode } : {}) }))
        } else {
            const created = await createGoal({
                ...fields,
                progressMode: draft.habitIds.length > 0 ? 'auto' : 'manual',
            })
            setGoals((prev) => [created, ...prev])
        }
        setGoalEditor(null)
    }

    async function setGoalStatus(goal: Goal, status: Goal['status']) {
        replaceGoal(await updateGoal(goal._id, { status }))
    }

    async function setHabitActive(habit: HabitDef, active: boolean) {
        const updated = await updateHabit(habit._id, { active })
        setHabits((prev) => prev.map((h) => (h._id === habit._id ? updated : h)))
        invalidate('habits')
    }

    async function handleConfirm() {
        if (!confirm) return
        if (confirm.kind === 'goal') {
            await deleteGoal(confirm.goal._id)
            setGoals((prev) => prev.filter((g) => g._id !== confirm.goal._id))
            if (openGoalId === confirm.goal._id) setOpenGoalId(null)
        } else {
            await deleteHabit(confirm.habit._id)
            setHabits((prev) => prev.filter((h) => h._id !== confirm.habit._id))
            // The server unlinks it from every goal, which can change their progress.
            setGoals(await listGoals())
            invalidate('habits')
        }
        setConfirm(null)
    }

    // ─── Menus ──────────────────────────────────────────────────────────────

    function habitMenu(habit: HabitDef): MenuEntry[] {
        return [
            { label: 'Edit', icon: 'fa-solid fa-pen', onClick: () => setHabitEditor({ habit, presetGoalIds: [] }) },
            { label: 'Archive', icon: 'fa-solid fa-box-archive', onClick: () => setHabitActive(habit, false) },
            'divider',
            {
                label: 'Delete',
                icon: 'fa-solid fa-trash-can',
                danger: true,
                onClick: () => setConfirm({ kind: 'habit', habit }),
            },
        ]
    }

    function goalMenu(goal: Goal): MenuEntry[] {
        const status: MenuEntry[] =
            goal.status === 'active'
                ? [
                      { label: 'Mark achieved', icon: 'fa-solid fa-check', onClick: () => setGoalStatus(goal, 'completed') },
                      { label: 'Drop it', icon: 'fa-solid fa-ban', onClick: () => setGoalStatus(goal, 'abandoned') },
                  ]
                : [
                      {
                          label: 'Make active again',
                          icon: 'fa-solid fa-rotate-left',
                          onClick: () => setGoalStatus(goal, 'active'),
                      },
                  ]
        return [
            { label: 'Edit', icon: 'fa-solid fa-pen', onClick: () => setGoalEditor({ goal }) },
            ...status,
            'divider',
            {
                label: 'Delete',
                icon: 'fa-solid fa-trash-can',
                danger: true,
                onClick: () => setConfirm({ kind: 'goal', goal }),
            },
        ]
    }

    function archivedHabitMenu(habit: HabitDef): MenuEntry[] {
        return [
            { label: 'Restore', icon: 'fa-solid fa-rotate-left', onClick: () => setHabitActive(habit, true) },
            'divider',
            {
                label: 'Delete',
                icon: 'fa-solid fa-trash-can',
                danger: true,
                onClick: () => setConfirm({ kind: 'habit', habit }),
            },
        ]
    }

    // ─── Render ─────────────────────────────────────────────────────────────

    return (
        <Container as="main" className="py-10">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">Habits &amp; goals</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        What you do each day, and what it builds toward.
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    trigger={<Button icon="fa-solid fa-plus">New</Button>}
                    items={[
                        {
                            label: 'Habit',
                            icon: 'fa-solid fa-repeat',
                            onClick: () => setHabitEditor({ habit: null, presetGoalIds: [] }),
                        },
                        { label: 'Goal', icon: 'fa-solid fa-bullseye', onClick: () => setGoalEditor({ goal: null }) },
                    ]}
                />
            </header>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : (
                <>
                    {/* Today at a glance */}
                    <div className="mb-6 grid grid-cols-3 gap-3">
                        <Stat label="Today" value={`${doneToday}/${activeHabits.length}`} sub="habits done" />
                        <Stat label="Best streak" value={`${bestStreak}d`} sub="running" />
                        <Stat label="Goals" value={String(activeGoals.length)} sub="in progress" />
                    </div>

                    <Tabs tabs={[...TABS]} value={tab} onChange={(t) => setTab(t as Tab)} className="mb-6" />

                    {tab === 'Active' ? (
                        systems.length === 0 ? (
                            <EmptyState
                                icon="fa-solid fa-diagram-project"
                                title="Nothing set up yet"
                                description="Start with a goal and the daily habits that get you there, or just a habit."
                                action={
                                    <Button icon="fa-solid fa-plus" onClick={() => setGoalEditor({ goal: null })}>
                                        New goal
                                    </Button>
                                }
                            />
                        ) : (
                            <div className="flex flex-col gap-5">
                                {systems.map(({ goal, habits: own }) => (
                                    <SystemCard
                                        key={goal?._id ?? 'standalone'}
                                        goal={goal}
                                        today={today}
                                        habitCount={own.length}
                                        onOpenGoal={goal ? () => setOpenGoalId(goal._id) : undefined}
                                        onAddHabit={() =>
                                            setHabitEditor({ habit: null, presetGoalIds: goal ? [goal._id] : [] })
                                        }
                                        goalMenu={goal ? goalMenu(goal) : undefined}
                                    >
                                        {own.map((h) => (
                                            <HabitRow
                                                key={h._id}
                                                habit={h}
                                                done={done.get(h._id)}
                                                days={days}
                                                today={today}
                                                busy={busy.has(h._id)}
                                                onToggle={() => toggle(h)}
                                                menu={habitMenu(h)}
                                            />
                                        ))}
                                    </SystemCard>
                                ))}
                            </div>
                        )
                    ) : (
                        <DoneTab
                            goals={finishedGoals}
                            habits={archivedHabits}
                            goalMenu={goalMenu}
                            habitMenu={archivedHabitMenu}
                        />
                    )}
                </>
            )}

            {habitEditor && (
                <HabitModal
                    habit={habitEditor.habit}
                    presetGoalIds={habitEditor.presetGoalIds}
                    goals={goals}
                    onClose={() => setHabitEditor(null)}
                    onSave={saveHabit}
                />
            )}
            {goalEditor && (
                <GoalModal
                    goal={goalEditor.goal}
                    habits={habits}
                    onClose={() => setGoalEditor(null)}
                    onSave={saveGoal}
                />
            )}
            <GoalDrawer
                goal={openGoal}
                habits={habits}
                onClose={() => setOpenGoalId(null)}
                onChange={replaceGoal}
                onEdit={() => openGoal && setGoalEditor({ goal: openGoal })}
            />
            <ConfirmModal
                open={confirm !== null}
                danger
                title={confirm?.kind === 'goal' ? 'Delete goal?' : 'Delete habit?'}
                message={
                    confirm?.kind === 'goal'
                        ? `"${confirm.goal.title}" and its milestones will be gone. Its habits stay.`
                        : confirm
                          ? `"${confirm.habit.name}" and every tick it has will be gone. Archive it instead to keep the history.`
                          : ''
                }
                confirmLabel="Delete"
                onConfirm={handleConfirm}
                onClose={() => setConfirm(null)}
            />
        </Container>
    )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <Card hover={false} className="!p-4">
            <SectionLabel>{label}</SectionLabel>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-neutral-950">{value}</p>
            <p className="text-xs text-neutral-500">{sub}</p>
        </Card>
    )
}

/** Finished goals and archived habits — out of the way, but recoverable. */
function DoneTab({
    goals,
    habits,
    goalMenu,
    habitMenu,
}: {
    goals: Goal[]
    habits: HabitDef[]
    goalMenu: (g: Goal) => MenuEntry[]
    habitMenu: (h: HabitDef) => MenuEntry[]
}) {
    if (goals.length === 0 && habits.length === 0) {
        return (
            <EmptyState
                icon="fa-solid fa-box-archive"
                title="Nothing here yet"
                description="Achieved or dropped goals and archived habits land here."
            />
        )
    }
    return (
        <div className="flex flex-col gap-8">
            {goals.length > 0 && (
                <section>
                    <SectionLabel className="mb-3">Goals</SectionLabel>
                    <Card flush hover={false} className="divide-y divide-neutral-100">
                        {goals.map((g) => (
                            <div key={g._id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                                <span
                                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                                        g.status === 'completed' ? 'bg-herb-50 text-herb' : 'bg-neutral-100 text-neutral-500'
                                    }`}
                                >
                                    <i
                                        className={`fa-solid ${g.status === 'completed' ? 'fa-trophy' : 'fa-ban'}`}
                                        aria-hidden="true"
                                    />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-neutral-900">{g.title}</p>
                                    <p className="text-xs text-neutral-500">
                                        {g.status === 'completed' ? 'Achieved' : 'Dropped'}
                                    </p>
                                </div>
                                <DropdownMenu align="right" trigger={<MoreTrigger />} items={goalMenu(g)} />
                            </div>
                        ))}
                    </Card>
                </section>
            )}
            {habits.length > 0 && (
                <section>
                    <SectionLabel className="mb-3">Archived habits</SectionLabel>
                    <Card flush hover={false} className="divide-y divide-neutral-100">
                        {habits.map((h) => (
                            <div key={h._id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-500">
                                    <i className={iconForHabit(h.name, h.icon)} aria-hidden="true" />
                                </span>
                                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">{h.name}</p>
                                <DropdownMenu align="right" trigger={<MoreTrigger />} items={habitMenu(h)} />
                            </div>
                        ))}
                    </Card>
                </section>
            )}
        </div>
    )
}
