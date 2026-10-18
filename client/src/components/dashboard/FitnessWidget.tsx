import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { SectionLoading } from './DashSection'
import { listPlanEntries } from '../../services/fitnessPlan'
import type { FitnessPlanEntry, FitnessPlanKind, ConditioningCategory } from '../../types'

// ── Presentation ────────────────────────────────────────────────────────────────

const KIND_META: Record<FitnessPlanKind, { icon: string }> = {
    workout: { icon: 'fa-solid fa-dumbbell' },
    conditioning: { icon: 'fa-solid fa-heart-pulse' },
    mobility: { icon: 'fa-solid fa-person-walking' },
    recovery: { icon: 'fa-solid fa-spa' },
}

/** The icon colour each kind takes on the ink panel. Full class strings so Tailwind keeps them. */
const TONES = {
    coral: 'text-coral-300',
    rose: 'text-rose-300',
    sky: 'text-sky-300',
    indigo: 'text-indigo-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
}

type Tone = (typeof TONES)[keyof typeof TONES]

const CATEGORY_TONE: Record<ConditioningCategory, Tone> = {
    HIIT: TONES.rose,
    Cardio: TONES.sky,
    Endurance: TONES.indigo,
    Mobility: TONES.amber,
    Recovery: TONES.emerald,
}

/** Strength reads coral; conditioning takes its category's colour. */
function toneFor(entry: FitnessPlanEntry): Tone {
    if (entry.kind === 'workout') return TONES.coral
    if (entry.kind === 'conditioning') return entry.session ? CATEGORY_TONE[entry.session.category] : TONES.rose
    if (entry.kind === 'mobility') return TONES.amber
    return TONES.emerald
}

/** "HIIT · 25 min", "6 exercises" — the one line of detail under the name. */
function detailFor(entry: FitnessPlanEntry): string | null {
    const mins = (n: number | undefined) => (n && n > 0 ? `${n} min` : null)
    const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(' · ') || null
    if (entry.kind === 'workout' && entry.workout) {
        const n = entry.workout.main.length
        return `Strength · ${n} ${n === 1 ? 'exercise' : 'exercises'}`
    }
    if (entry.kind === 'conditioning' && entry.session) return join(entry.session.category, mins(entry.session.duration))
    if (entry.kind === 'mobility' && entry.mobility) return join('Mobility', mins(entry.mobility.duration))
    if (entry.recovery) return join('Recovery', mins(entry.recovery.duration))
    return null
}

/** Name + a one-line detail for a single planned item. */
function planName(entry: FitnessPlanEntry): string {
    const name =
        entry.kind === 'workout'
            ? entry.workout?.name
            : entry.kind === 'conditioning'
              ? entry.session?.name
              : entry.kind === 'mobility'
                ? entry.mobility?.name
                : entry.recovery?.name
    return name ?? 'Untitled'
}

/** One planned item on the ink panel. */
function PlanRow({ entry }: { entry: FitnessPlanEntry }) {
    const detail = detailFor(entry)
    return (
        <li className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
            <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-base ${toneFor(entry)}`}
            >
                <i className={KIND_META[entry.kind].icon} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold tracking-[-0.015em] text-white">{planName(entry)}</p>
                {detail && <p className="mt-0.5 truncate text-sm text-brand-100">{detail}</p>}
            </div>
        </li>
    )
}

// ── Today ─────────────────────────────────────────────────────────────────────

function TodayFitness({ date }: { date: string }) {
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    // Derived loading — avoids a synchronous setState inside the fetch effect.
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date

    useEffect(() => {
        let active = true
        listPlanEntries(date, date)
            .then((rows) => active && setEntries(rows))
            .catch(() => active && setEntries([]))
            .finally(() => active && setLoadedDate(date))
        return () => {
            active = false
        }
    }, [date])

    const count = entries.length

    return (
        <DashSection
            title="Training"
            icon="fa-solid fa-dumbbell"
            tone="coral"
            meta={loading ? undefined : count === 0 ? 'Rest day' : `${count} ${count === 1 ? 'session' : 'sessions'} today`}
            to="/fitness"
            action="Planner"
        >
            {loading ? (
                <SectionLoading rows={2} />
            ) : count === 0 ? (
                <div className="flex items-center gap-4 border-y border-neutral-200 py-5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success-bg text-base text-success">
                        <i className="fa-solid fa-mug-hot" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-base font-medium text-neutral-900">Nothing scheduled</p>
                        <p className="mt-0.5 text-sm text-neutral-500">Recover well.</p>
                    </div>
                </div>
            ) : (
                // The one coloured surface on the page: what training today looks like.
                <div className="rounded-3xl bg-brand-700 p-6 sm:p-8">
                    <ul className="divide-y divide-white/10">
                        {entries.map((e) => (
                            <PlanRow key={e._id} entry={e} />
                        ))}
                    </ul>
                    <Link
                        to="/fitness"
                        className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    >
                        Open today&apos;s plan
                        <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                    </Link>
                </div>
            )}
        </DashSection>
    )
}

// ── Entry point ────────────────────────────────────────────────────────────────

export default function FitnessWidget({ date }: { date: string }) {
    return <TodayFitness date={date} />
}
