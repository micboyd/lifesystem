import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import Checkbox from '../components/Checkbox'
import Input from '../components/Input'
import Alert from '../components/Alert'
import { SectionLoading } from '../components/dashboard/DashSection'
import { PANEL } from '../components/lifeplan/ui'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../services/users'
import { listHabits } from '../services/habits'
import { listMeals } from '../services/meals'
import { listPlateFoods } from '../services/plateFoods'
import { iconForHabit } from '../lib/habitIcons'
import { ALL_DAYS, WEEK_ORDER, daysFor, habitKey, mealKey, normFood } from '../lib/perfectDay'
import type { HabitDef, PerfectDaySelection } from '../types'

/**
 * Perfect day: tick what Your day counts, and on which weekdays — a weigh-in
 * on Mondays only, no snack on rest days — and which foods never count, so a
 * flat white with breakfast isn't one more thing to tick.
 */

const DAY_LETTER: Record<number, string> = { 0: 'S', 1: 'M', 2: 'T', 3: 'W', 4: 'T', 5: 'F', 6: 'S' }
const DAY_NAME: Record<number, string> = {
    0: 'Sunday',
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
}

interface Row {
    key: string
    label: string
    detail: string
    icon: string
}

const FIXED_GROUPS: { title: string; rows: Row[] }[] = [
    {
        title: 'Body',
        rows: [
            {
                key: 'weigh',
                label: 'Weigh in',
                detail: 'Pick days to make it a must. With every day ticked, it shows while you’re weighing in regularly.',
                icon: 'fa-solid fa-weight-scale',
            },
        ],
    },
    {
        title: 'Training',
        rows: [
            { key: 'training', label: 'Planned sessions', detail: 'Each session on the planner that day.', icon: 'fa-solid fa-dumbbell' },
            { key: 'rest', label: 'Rest day note', detail: 'Shown when nothing’s planned. Never a task.', icon: 'fa-solid fa-mug-hot' },
        ],
    },
    {
        title: 'Meals',
        rows: [
            { key: mealKey('breakfast'), label: 'Breakfast', detail: 'Each meal planned in the slot.', icon: 'fa-solid fa-mug-saucer' },
            { key: mealKey('lunch'), label: 'Lunch', detail: 'Each meal planned in the slot.', icon: 'fa-solid fa-bowl-food' },
            { key: mealKey('snack'), label: 'Snacks', detail: 'Each snack planned that day.', icon: 'fa-solid fa-apple-whole' },
            { key: mealKey('dinner'), label: 'Dinner', detail: 'Each meal planned in the slot.', icon: 'fa-solid fa-utensils' },
            { key: 'plan-meals', label: 'Plan the day’s meals', detail: 'A nudge when nothing’s planned yet.', icon: 'fa-regular fa-calendar-plus' },
        ],
    },
    {
        title: 'Targets',
        rows: [
            { key: 'protein', label: 'Protein target', detail: 'Hit from 95% of the goal.', icon: 'fa-solid fa-drumstick-bite' },
            { key: 'calories', label: 'Calorie target', detail: 'On target within 5% either side.', icon: 'fa-solid fa-fire' },
        ],
    },
    {
        title: 'Calendar',
        rows: [{ key: 'events', label: 'Events', detail: 'The day’s events, for context. Never a task.', icon: 'fa-regular fa-calendar' }],
    },
]

interface Food {
    name: string
    kind: 'Meal' | 'Box' | 'Food'
}

function errorMessage(err: unknown, fallback: string): string {
    return (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
}

export default function PerfectDay() {
    const { user, updateUser } = useAuth()
    const saved = user?.settings?.perfectDay

    const [habits, setHabits] = useState<HabitDef[] | null>(null)
    const [foods, setFoods] = useState<Food[] | null>(null)
    const [days, setDays] = useState<Record<string, number[]>>({})
    const [skip, setSkip] = useState<Set<string>>(() => new Set(saved?.skipFoods ?? []))
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)
    const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)

    useEffect(() => {
        let active = true
        Promise.all([
            listHabits().catch(() => [] as HabitDef[]),
            listMeals().catch(() => []),
            listPlateFoods().catch(() => []),
        ]).then(([h, meals, plateFoods]) => {
            if (!active) return
            setHabits(h.filter((x) => x.active).sort((a, b) => a.order - b.order))
            const seen = new Set<string>()
            const list: Food[] = []
            const add = (name: string, kind: Food['kind']) => {
                const n = normFood(name)
                if (!n || seen.has(n)) return
                seen.add(n)
                list.push({ name, kind })
            }
            for (const m of meals) add(m.name, 'Meal')
            for (const f of plateFoods) add(f.name, f.kind === 'box' ? 'Box' : 'Food')
            // A skipped food no longer in a library still shows, so it can be counted again.
            for (const n of saved?.skipFoods ?? []) add(n, 'Food')
            setFoods(list.sort((a, b) => a.name.localeCompare(b.name)))
        })
        return () => {
            active = false
        }
    }, [saved?.skipFoods])

    const groups = useMemo(() => {
        if (!habits) return null
        const habitRows: Row[] = habits.map((h) => ({
            key: habitKey(h._id),
            label: h.name,
            detail: h.part ? `Habit · ${h.part}` : 'Habit · any time',
            icon: iconForHabit(h.name, h.icon),
        }))
        return [...FIXED_GROUPS, ...(habitRows.length ? [{ title: 'Habits', rows: habitRows }] : [])]
    }, [habits])

    const daysOf = (key: string) => days[key] ?? daysFor(saved, key)
    const setDaysOf = (key: string, next: number[]) => setDays((prev) => ({ ...prev, [key]: [...next].sort() }))

    const shownFoods = useMemo(() => {
        const q = normFood(search)
        return (foods ?? []).filter((f) => !q || normFood(f.name).includes(q))
    }, [foods, search])

    async function save() {
        if (!groups) return
        setMsg(null)
        setSaving(true)
        try {
            // Only what differs from every day is stored, so new things count by default.
            const items = groups
                .flatMap((g) => g.rows)
                .map((r) => ({ key: r.key, days: daysOf(r.key) }))
                .filter((i) => i.days.length !== ALL_DAYS.length)
            const perfectDay: PerfectDaySelection = { items, skipFoods: [...skip] }
            updateUser(await updateSettings({ perfectDay }))
            setDays({})
            setMsg({ type: 'success', text: 'Saved. Your day now counts just these.' })
        } catch (err) {
            setMsg({ type: 'danger', text: errorMessage(err, 'Could not save.') })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Container as="main" className="py-8 sm:py-10">
            <Link to="/profile" className="mb-4 inline-flex items-center gap-2 text-[13px] text-neutral-500 hover:text-neutral-900">
                <i className="fa-solid fa-arrow-left text-[11px]" aria-hidden="true" />
                Profile
            </Link>
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                        Perfect day
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Tick the non-negotiables. Only these count on Your day, on the days you choose.
                    </p>
                </div>
                <Button onClick={save} disabled={saving || !groups}>
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </header>

            {msg && (
                <div className="mb-6">
                    <Alert variant={msg.type}>{msg.text}</Alert>
                </div>
            )}

            {!groups || !foods ? (
                <SectionLoading rows={6} />
            ) : (
                <div className="grid gap-6 lg:grid-cols-12">
                    <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
                        {groups.map((g) => (
                            <section key={g.title} className={`${PANEL} px-5 py-2 sm:px-6`}>
                                <h2 className="pb-1 pt-4 text-[13px] font-medium text-neutral-600">{g.title}</h2>
                                <ul className="divide-y divide-neutral-100">
                                    {g.rows.map((r) => (
                                        <ItemRow key={r.key} row={r} days={daysOf(r.key)} onChange={(d) => setDaysOf(r.key, d)} />
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>

                    <section className={`${PANEL} self-start px-5 py-5 sm:px-6 lg:col-span-5`}>
                        <h2 className="text-[13px] font-medium text-neutral-600">Foods that count</h2>
                        <p className="mt-1 text-[13px] leading-5 text-neutral-500">
                            Untick the extras — a flat white, a protein shake. They’re still logged and still add to your
                            calories, they just aren’t a task on Your day.
                        </p>
                        {foods.length > 8 && (
                            <div className="mt-4">
                                <Input
                                    icon="fa-solid fa-magnifying-glass"
                                    placeholder="Search foods"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        )}
                        {foods.length === 0 ? (
                            <p className="mt-4 text-[14px] text-neutral-400">No meals or foods in your library yet.</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-neutral-100">
                                {shownFoods.map((f) => {
                                    const n = normFood(f.name)
                                    const counts = !skip.has(n)
                                    return (
                                        <li key={n} className="flex items-center gap-3 py-2.5">
                                            <Checkbox
                                                checked={counts}
                                                onChange={(on) =>
                                                    setSkip((prev) => {
                                                        const next = new Set(prev)
                                                        if (on) next.delete(n)
                                                        else next.add(n)
                                                        return next
                                                    })
                                                }
                                            />
                                            <span className={`min-w-0 flex-1 truncate text-[15px] ${counts ? 'text-neutral-900' : 'text-neutral-400 line-through'}`}>
                                                {f.name}
                                            </span>
                                            <span className="shrink-0 text-[12px] text-neutral-400">{f.kind}</span>
                                        </li>
                                    )
                                })}
                                {shownFoods.length === 0 && <li className="py-3 text-[14px] text-neutral-400">No match.</li>}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </Container>
    )
}

/** One thing: ticked if it counts at all, then the weekdays it counts on. */
function ItemRow({ row, days, onChange }: { row: Row; days: number[]; onChange: (days: number[]) => void }) {
    const on = days.length > 0
    return (
        <li className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5">
            <div className="flex min-w-0 flex-1 basis-56 items-start gap-3">
                <Checkbox checked={on} onChange={(v) => onChange(v ? ALL_DAYS : [])} className="mt-0.5" />
                <div className="min-w-0">
                    <p className={`flex items-center gap-2 text-[15px] ${on ? 'text-neutral-900' : 'text-neutral-400'}`}>
                        <i className={`${row.icon} w-4 text-center text-xs text-neutral-300`} aria-hidden="true" />
                        <span className="truncate">{row.label}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-5 text-neutral-500">{row.detail}</p>
                </div>
            </div>
            <div className="flex gap-1 pl-8 sm:pl-0" role="group" aria-label={`Days for ${row.label}`}>
                {WEEK_ORDER.map((d) => {
                    const active = days.includes(d)
                    return (
                        <button
                            key={d}
                            type="button"
                            aria-pressed={active}
                            aria-label={DAY_NAME[d]}
                            title={DAY_NAME[d]}
                            onClick={() => onChange(active ? days.filter((x) => x !== d) : [...days, d])}
                            className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold transition-colors ${
                                active
                                    ? 'bg-neutral-900 text-white'
                                    : 'bg-white text-neutral-500 ring-1 ring-neutral-200 hover:ring-neutral-300'
                            }`}
                        >
                            {DAY_LETTER[d]}
                        </button>
                    )
                })}
            </div>
        </li>
    )
}
