import type { ReactNode } from 'react'
import { Card } from '../Card'
import Button from '../Button'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { daysUntil, formatTargetDate } from '../../lib/daysUntil'
import { MoreTrigger, SectionLabel, deadlineLabel, deadlineTone } from './ui'
import type { Goal } from '../../types'

interface SystemCardProps {
    /** Null for the standalone group — habits kept for their own sake. */
    goal: Goal | null
    today: string
    /** The habit rows. */
    children: ReactNode
    habitCount: number
    onOpenGoal?: () => void
    onAddHabit: () => void
    goalMenu?: MenuEntry[]
}

/**
 * A goal and the habits that build toward it, read left to right on wide
 * screens: the daily inputs, an arrow, the outcome. On a phone the outcome
 * comes first so the card says what it's for before what it asks of you.
 */
export default function SystemCard({
    goal,
    today,
    children,
    habitCount,
    onOpenGoal,
    onAddHabit,
    goalMenu,
}: SystemCardProps) {
    return (
        <Card flush hover={false} className="overflow-hidden">
            <div className="flex flex-col lg:flex-row">
                {/* Inputs: the habits */}
                <div className="order-2 min-w-0 flex-1 px-4 pb-3 pt-4 sm:px-6 lg:order-1 lg:py-5">
                    <SectionLabel>{goal ? 'Daily habits' : 'Standalone habits'}</SectionLabel>
                    {habitCount > 0 ? (
                        <div className="divide-y divide-neutral-100">{children}</div>
                    ) : (
                        <p className="py-3 text-sm text-neutral-500">
                            Nothing feeding this yet. What will you do each day to get there?
                        </p>
                    )}
                    <Button variant="ghost" size="sm" icon="fa-solid fa-plus" onClick={onAddHabit} className="-ml-3 mt-1">
                        Add habit
                    </Button>
                </div>

                {/* The arrow between them, wide screens only */}
                {goal && (
                    <div className="order-2 hidden items-center text-neutral-300 lg:flex" aria-hidden="true">
                        <i className="fa-solid fa-arrow-right" />
                    </div>
                )}

                {/* Outcome: the goal */}
                {goal ? (
                    <GoalPanel goal={goal} today={today} onOpen={onOpenGoal} menu={goalMenu ?? []} />
                ) : (
                    <div className="order-1 border-b border-neutral-100 bg-neutral-50 px-4 py-4 sm:px-6 lg:order-3 lg:w-80 lg:border-b-0 lg:border-l">
                        <p className="text-sm font-semibold text-neutral-900">Kept for their own sake</p>
                        <p className="mt-1 text-sm text-neutral-500">
                            Routines that don&apos;t build toward a goal. Link one to a goal from its menu.
                        </p>
                    </div>
                )}
            </div>
        </Card>
    )
}

function GoalPanel({
    goal,
    today,
    onOpen,
    menu,
}: {
    goal: Goal
    today: string
    onOpen?: () => void
    menu: MenuEntry[]
}) {
    const days = goal.targetDate ? daysUntil(goal.targetDate, today) : null
    const milestonesDone = goal.milestones.filter((m) => m.completed).length
    const fromHabits = goal.progressMode === 'auto'

    return (
        <div className="order-1 border-b border-neutral-100 bg-neutral-50 px-4 py-4 sm:px-6 lg:order-3 lg:w-80 lg:border-b-0 lg:border-l lg:py-5">
            <div className="flex items-start justify-between gap-2">
                <SectionLabel>Goal</SectionLabel>
                <div className="-mr-2 -mt-2">
                    <DropdownMenu align="right" trigger={<MoreTrigger label={`${goal.title} options`} />} items={menu} />
                </div>
            </div>
            <button type="button" onClick={onOpen} className="mt-1 block w-full text-left">
                <p className="text-lg font-bold tracking-tight text-neutral-950">{goal.title}</p>
                {goal.targetDate && days !== null && (
                    <p className="mt-0.5 text-xs font-semibold">
                        <span className="text-neutral-500">{formatTargetDate(goal.targetDate)}</span>
                        <span className={`ml-1.5 ${deadlineTone(days)}`}>· {deadlineLabel(days)}</span>
                    </p>
                )}
                <div className="mt-4">
                    {/* Own bar rather than <Progress>: its track vanishes on the tinted panel. */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={goal.progress} aria-valuemin={0} aria-valuemax={100}>
                        <div
                            className={`h-full rounded-full transition-all ${goal.progress >= 100 ? 'bg-herb' : 'bg-neutral-900'}`}
                            style={{ width: `${Math.min(100, goal.progress)}%` }}
                        />
                    </div>
                    <p className="mt-1.5 flex justify-between gap-2 text-xs text-neutral-500">
                        <span>
                            <span className="font-bold tabular-nums text-neutral-700">{goal.progress}%</span>
                            {fromHabits ? ' consistency' : ' done'}
                        </span>
                        {goal.milestones.length > 0 && (
                            <span className="tabular-nums">
                                {milestonesDone}/{goal.milestones.length} milestones
                            </span>
                        )}
                    </p>
                </div>
            </button>
        </div>
    )
}
