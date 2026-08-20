import { useState } from 'react'
import { Card } from './Card'
import Button from './Button'
import Alert from './Alert'
import Checkbox from './Checkbox'
import { useToast } from '../context/ToastContext'
import { importPlan, type PlanImportSummary } from '../services/plans'
import samplePlan from '../data/rugbyPhysiquePlan.json'

/** Pull a human-readable message out of an unknown thrown error. */
function errorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
        const resp = (err as { response?: { data?: { message?: unknown } } }).response
        if (typeof resp?.data?.message === 'string') return resp.data.message
        const msg = (err as { message?: unknown }).message
        if (typeof msg === 'string') return msg
    }
    return 'Something went wrong during import.'
}

/**
 * The shape of a plan document, trimmed to one item per section.
 *
 * It doubles as the format's documentation — a plan is usually written against
 * this rather than exported from an existing one — so the fields that are easy
 * to not know about are the ones worth showing: `slot` on anything that has to
 * land in a particular part of the day, and `rounds` + `roundSeconds` +
 * `startAtSec` on an interval block, which are what put a running clock against
 * each rep instead of a bare tick-box.
 */
const TEMPLATE = JSON.stringify(
    {
        planName: 'Winter Strength Block',
        planStart: '2026-09-01',
        planEnd: '2026-12-20',
        source: 'Optional note about where this plan came from.',
        goal: {
            primaryGoal: 'Add strength on the main lifts while holding bodyweight steady.',
            checkpoints: [{ date: '2026-10-15', target: 'Squat back to previous best.' }],
        },
        trainingPhases: [
            {
                name: 'Base',
                dates: '2026-09-01 to 2026-10-15',
                focus: 'Rebuild volume tolerance.',
                strength: 'RPE 7-8.',
            },
        ],
        weeklyTemplate: [
            {
                day: 'Monday',
                strength: 'Upper A',
                conditioning: null,
                mobility: 'Shoulder Mobility',
                recovery: 'Post-Training Recovery Routine',
                slot: 'Morning',
            },
        ],
        exerciseLibrary: [
            { name: 'Barbell bench press', description: 'Horizontal press for chest and triceps.' },
        ],
        strengthWorkouts: [
            {
                day: 'Monday',
                name: 'Upper A',
                duration: 60,
                purpose: 'Build pressing and pulling strength.',
                exercises: [
                    {
                        name: 'Barbell bench press',
                        sets: 4,
                        reps: '5-8',
                        rest: '2-3 min',
                        notes: 'Keep 1-2 reps in reserve.',
                    },
                ],
            },
        ],
        strengthProgression: {
            effortTarget: 'Most working sets at RPE 7-8.',
            deloadRule: 'Every 6th week, cut sets by half.',
        },
        conditioning: {
            existingRunPlan: [
                {
                    name: 'Intervals - Wed 2 Sep',
                    date: '2026-09-02',
                    duration: 33,
                    category: 'Endurance',
                    purpose: 'Aerobic base.',
                    slot: 'Morning',
                    parts: [
                        { name: 'Warm-up', detail: 'Walk 3 min at 4.2 km/h, then 4 min at 5.2 km/h.' },
                        {
                            name: 'Main set',
                            detail: '6 x 90s jog at 7.0 km/h, then 2 min walk at 5.0 km/h.',
                            rounds: 6,
                            roundLabel: 'jog/walk',
                            // One entry per rep, in seconds, covering the rep and
                            // the recovery that follows it. Turns each rep into a
                            // clock window instead of a bare tick-box.
                            roundSeconds: [210, 210, 210, 210, 210, 210],
                            // Where rep 1 starts on the session clock — here, after
                            // the 7 min warm-up above.
                            startAtSec: 420,
                        },
                        { name: 'Cool-down', detail: 'Walk 2 min at 5.0 km/h, then 3 min at 4.0 km/h.' },
                    ],
                },
            ],
            post10KSessionLibrary: [
                {
                    name: 'Bike Intervals',
                    duration: 30,
                    category: 'HIIT',
                    parts: [
                        {
                            name: 'Main set',
                            detail: '8 x 30s hard, 90s easy',
                            rounds: 8,
                            roundSeconds: [120, 120, 120, 120, 120, 120, 120, 120],
                            startAtSec: 300,
                        },
                    ],
                },
            ],
            post10KCalendar: [
                { date: '2026-11-07', session: 'Bike Intervals', notes: 'Keep output repeatable.' },
            ],
        },
        mobility: {
            library: [
                {
                    name: 'Shoulder Mobility',
                    duration: 12,
                    purpose: 'Open the shoulders before pressing.',
                    parts: [{ name: 'Wall slides', detail: '2 x 10 reps' }],
                },
            ],
        },
        recovery: {
            library: [
                {
                    name: 'Post-Training Recovery Routine',
                    duration: 30,
                    purpose: 'Start recovery straight after training.',
                    notes: '10 min easy walking, then food and water.',
                },
            ],
        },
        scheduleOverrides: [
            { date: '2026-10-05', strength: 'Upper A', notes: 'Moved off Tuesday this week' },
            { date: '2026-10-06', strength: null, notes: 'Travelling' },
            {
                start: '2026-10-10',
                end: '2026-10-18',
                suppressRecurringStrength: true,
                notes: 'Holiday — no gym',
            },
        ],
        readinessRules: ['Skip the optional conditioning if sleep has been poor for two nights.'],
    },
    null,
    2
)

interface PlanImportPanelProps {
    /** Return to the plan grid. */
    onBack: () => void
    /** Called after a plan is saved. */
    onImported: () => void
    /** Existing plans, so a re-import can replace one rather than duplicate it. */
    existingPlans?: { _id: string; name: string }[]
}

/**
 * Paste a plan document to build a plan. A plan is bigger than a single library
 * import: it reconciles every library it touches, links what it uses and works
 * out the day each session falls on. Names that already exist in a library are
 * reused rather than duplicated, so re-importing a revised plan is safe.
 */
export default function PlanImportPanel({
    onBack,
    onImported,
    existingPlans = [],
}: PlanImportPanelProps) {
    const toast = useToast()
    const [text, setText] = useState('')
    // Library items are matched by name and left alone by default; this opts into
    // refreshing them, which is how a corrected plan pushes fixes through.
    const [updateExisting, setUpdateExisting] = useState(false)
    // A plan the paste would duplicate, found by name once the JSON parses.
    const [clash, setClash] = useState<{ _id: string; name: string } | null>(null)
    const [replaceClash, setReplaceClash] = useState(true)
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [summary, setSummary] = useState<PlanImportSummary | null>(null)
    const [copied, setCopied] = useState(false)

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(TEMPLATE)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    // Watch the paste for a plan name that already exists. Cheap enough to redo on
    // each keystroke, and it lets the replace choice appear before importing.
    function onText(next: string) {
        setText(next)
        let name: unknown
        try {
            name = (JSON.parse(next) as { planName?: unknown }).planName
        } catch {
            setClash(null)
            return
        }
        const key = typeof name === 'string' ? name.trim().toLowerCase() : ''
        setClash(existingPlans.find((p) => p.name.trim().toLowerCase() === key) ?? null)
    }

    async function handleImport() {
        setError(null)
        setSummary(null)
        const trimmed = text.trim()
        if (!trimmed) {
            setError('Paste a plan to import first.')
            return
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(trimmed)
        } catch {
            setError("That isn't valid JSON. Check for missing commas, quotes or brackets.")
            return
        }

        setImporting(true)
        try {
            const { plan, summary: result } = await importPlan(parsed, {
                updateExisting,
                replaceId: clash && replaceClash ? clash._id : null,
            })
            setSummary(result)
            setText('')
            toast.show(`Imported “${plan.name}”.`, 'success')
            setTimeout(onImported, 1600)
        } catch (err) {
            setError(errorMessage(err))
        } finally {
            setImporting(false)
        }
    }

    const added = summary
        ? summary.exercisesCreated +
          summary.workoutsCreated +
          summary.conditioningCreated +
          summary.mobilityCreated +
          summary.recoveryCreated
        : 0

    return (
        <div className="flex flex-col gap-6">
            <div>
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    Back to plans
                </button>
                <h2 className="text-xl font-bold tracking-tight text-neutral-950">Import a plan</h2>
                <p className="mt-1 text-sm text-neutral-500">
                    Paste a plan document below. Anything it names that your libraries do not have
                    yet is added, and the plan is saved with every session already placed on a date
                    — ready to apply to the planner whenever you want.
                </p>
            </div>

            {error && (
                <Alert variant="danger" onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {summary && (
                <Alert variant="success" title="Plan saved">
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
                        <li>
                            {added} new library {added === 1 ? 'item' : 'items'} added
                            {added > 0 &&
                                ` (${[
                                    [summary.exercisesCreated, 'exercise'],
                                    [summary.workoutsCreated, 'workout'],
                                    [summary.conditioningCreated, 'conditioning'],
                                    [summary.mobilityCreated, 'mobility'],
                                    [summary.recoveryCreated, 'recovery'],
                                ]
                                    .filter(([n]) => (n as number) > 0)
                                    .map(([n, label]) => `${n} ${label}`)
                                    .join(', ')})`}
                        </li>
                        {summary.itemsUpdated > 0 && (
                            <li>{summary.itemsUpdated} existing library items refreshed</li>
                        )}
                        <li>{summary.itemsLinked} items linked to the plan</li>
                        <li>{summary.scheduled} sessions placed on dates</li>
                        {summary.overrides > 0 && (
                            <li>{summary.overrides} dated exceptions applied</li>
                        )}
                        {summary.replacedPlan && (
                            <li>
                                replaced the existing plan
                                {summary.staleEntries > 0 &&
                                    ` — ${summary.staleEntries} of its planner sessions were cleared, ready to re-apply`}
                            </li>
                        )}
                        {summary.warnings > 0 && (
                            <li>
                                {summary.warnings} entries could not be scheduled — see the plan
                            </li>
                        )}
                    </ul>
                </Alert>
            )}

            {/* Template */}
            <Card as="section" hover={false}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
                        Template
                    </h3>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="secondary"
                            icon="fa-solid fa-wand-magic-sparkles"
                            onClick={() => setText(JSON.stringify(samplePlan, null, 2))}
                        >
                            Load rugby plan
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            icon={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'}
                            onClick={copyTemplate}
                        >
                            {copied ? 'Copied' : 'Copy template'}
                        </Button>
                    </div>
                </div>
                <pre className="max-h-96 overflow-auto rounded-xl bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
                    <code>{TEMPLATE}</code>
                </pre>
                <div className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-500">
                    <p>
                        <span className="font-semibold text-neutral-700">planName</span>,{' '}
                        <span className="font-semibold text-neutral-700">planStart</span> and{' '}
                        <span className="font-semibold text-neutral-700">planEnd</span> are
                        required. Every other section is optional.
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-700">strengthWorkouts</span>{' '}
                        each name a <span className="font-semibold text-neutral-700">day</span>, and
                        get scheduled on that weekday for the whole plan. Their exercise lines are
                        matched against your exercise library by name, and missing movements are
                        created.
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-700">existingRunPlan</span>{' '}
                        sessions are one-off dated runs. Give each a{' '}
                        <span className="font-semibold text-neutral-700">date</span>, or end the
                        name with the day it falls on —{' '}
                        <span className="font-semibold text-neutral-700">“… - Mon 10 Aug”</span> —
                        and the year is worked out from the plan window.
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-700">post10KCalendar</span> rows
                        pair a date with the name of a session from{' '}
                        <span className="font-semibold text-neutral-700">
                            post10KSessionLibrary
                        </span>
                        .
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-700">weeklyTemplate</span> fills
                        in mobility and recovery. Cells can be prose — any library name inside the
                        text is picked up, so “Sauna Recovery optional” schedules Sauna Recovery,
                        and a cell can name two routines.
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-700">scheduleOverrides</span>{' '}
                        are dated exceptions to the recurring week — holidays, matches, injuries,
                        deloads. Each takes a{' '}
                        <span className="font-semibold text-neutral-700">date</span> or a{' '}
                        <span className="font-semibold text-neutral-700">start</span>/
                        <span className="font-semibold text-neutral-700">end</span> range, plus
                        optional <span className="font-semibold text-neutral-700">notes</span>{' '}
                        saying why.
                    </p>
                    <p>
                        Naming a category —{' '}
                        <span className="font-semibold text-neutral-700">strength</span>,{' '}
                        <span className="font-semibold text-neutral-700">conditioning</span>,{' '}
                        <span className="font-semibold text-neutral-700">mobility</span> or{' '}
                        <span className="font-semibold text-neutral-700">recovery</span> — replaces
                        everything of that category on those days.{' '}
                        <span className="font-semibold text-neutral-700">null</span> empties it;
                        leaving the key out altogether leaves the day alone.
                    </p>
                    <p>
                        <span className="font-semibold text-neutral-700">
                            suppressRecurringStrength
                        </span>{' '}
                        (and the Conditioning / Mobility / Recovery variants, or{' '}
                        <span className="font-semibold text-neutral-700">suppressRecurring</span>{' '}
                        for all four) drops only the weekly repeats — so a week away clears the gym
                        work while the runs written for those exact days stay put. Overrides apply
                        in order, so a later one wins.
                    </p>
                    <p>
                        Library items are matched by name. By default an existing one is reused
                        untouched, so importing a revised plan keeps whatever you have tuned by hand
                        — tick “Update items that already exist” below to push the plan’s version
                        through instead.
                    </p>
                </div>
            </Card>

            {/* Paste + import */}
            <Card as="section" hover={false}>
                <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                    Paste plan JSON
                </h3>

                <textarea
                    value={text}
                    onChange={(e) => onText(e.target.value)}
                    spellCheck={false}
                    rows={12}
                    placeholder="Paste your plan here…"
                    className="w-full resize-y rounded-xl border border-neutral-200 bg-white p-4 font-mono text-xs leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                />

                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-neutral-200 p-3">
                    <Checkbox
                        label="Update items that already exist"
                        checked={updateExisting}
                        onChange={setUpdateExisting}
                    />
                    <p className="pl-7 text-xs text-neutral-400">
                        Refreshes matching workouts, sessions and routines from this plan — how a
                        correction reaches items an earlier import already created. They keep their
                        ids, so anything on the planner and every completed log stays linked.
                    </p>
                </div>

                {clash && (
                    <Alert
                        variant="warning"
                        className="mt-3"
                        title="You already have a plan with this name"
                    >
                        <Checkbox
                            label={`Replace “${clash.name}” instead of adding a second one`}
                            checked={replaceClash}
                            onChange={setReplaceClash}
                            className="mt-2"
                        />
                        <p className="mt-1 pl-7 text-xs">
                            {replaceClash
                                ? 'The existing plan is overwritten in place. Sessions it put on the planner are cleared, ready to re-apply from the new schedule.'
                                : 'Two plans will share the name, and applying both can double up on the planner.'}
                        </p>
                    </Alert>
                )}

                <div className="mt-4 flex items-center justify-end gap-3">
                    <Button
                        variant="ghost"
                        onClick={() => onText('')}
                        disabled={!text || importing}
                    >
                        Clear
                    </Button>
                    <Button
                        icon="fa-solid fa-file-import"
                        onClick={handleImport}
                        disabled={importing}
                    >
                        {importing ? 'Importing…' : 'Import plan'}
                    </Button>
                </div>
            </Card>
        </div>
    )
}
