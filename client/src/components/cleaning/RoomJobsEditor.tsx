import { useState } from 'react'
import Input from '../Input'
import type { CleaningFreq, CleaningRoom, CleaningTask } from '../../types'
import { FIELD_LABEL } from '../fieldStyles'
import Select from '../Select'
import { FREQS, FREQ_LABELS, ROOM_PRESETS, newKey } from '../../lib/cleaning'
import { formatDuration } from '../../lib/time'

const FREQ_OPTIONS = FREQS.map((f) => ({ value: f, label: FREQ_LABELS[f] }))

const OVERLINE ='text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'

/**
 * Everything to clean in one room: its name, its jobs (how long, how often),
 * suggestions from its preset not yet added, and a box for jobs of your own.
 * Used by the wizard and the room drawer alike.
 */
export default function RoomJobsEditor({
    room,
    onChange,
    showName = true,
}: {
    room: CleaningRoom
    onChange: (room: CleaningRoom) => void
    showName?: boolean
}) {
    const [custom, setCustom] = useState('')
    const [allSuggestions, setAllSuggestions] = useState(false)
    const preset = ROOM_PRESETS.find((p) => p.kind === room.kind)
    const have = new Set(room.tasks.map((t) => t.name.toLowerCase()))
    const suggestions = (preset?.tasks ?? []).filter((p) => !have.has(p.name.toLowerCase()))
    const shownSuggestions = allSuggestions ? suggestions : suggestions.slice(0, 8)
    // Jobs read by how often they come round: daily first, yearly last.
    const groups = FREQS.map((freq) => ({ freq, tasks: room.tasks.filter((t) => t.freq === freq) })).filter((g) => g.tasks.length)

    const setTasks = (tasks: CleaningTask[]) => onChange({ ...room, tasks })
    const patch = (key: string, next: Partial<CleaningTask>) =>
        setTasks(room.tasks.map((t) => (t.key === key ? { ...t, ...next } : t)))

    function addCustom() {
        const name = custom.trim()
        if (!name) return
        setTasks([...room.tasks, { key: newKey('t'), name, minutes: 10, freq: 'weekly' }])
        setCustom('')
    }

    return (
        <div className="flex flex-col gap-6">
            {showName && (
                <label className="flex flex-col gap-1.5">
                    <span className={FIELD_LABEL}>Room name</span>
                    <Input
                        value={room.name}
                        onChange={(e) => onChange({ ...room, name: e.target.value })}
                        maxLength={80}
                       
                    />
                </label>
            )}

            <section className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                    <h3 className={OVERLINE}>Jobs in this room</h3>
                    {room.tasks.length > 0 && (
                        <span className="text-[12px] nums text-neutral-500">
                            {room.tasks.length} {room.tasks.length === 1 ? 'job' : 'jobs'}
                        </span>
                    )}
                </div>
                {room.tasks.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-hairline px-4 py-5 text-center text-[13px] text-neutral-500">
                        Nothing to clean here yet — pick from the suggestions or add your own.
                    </p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {groups.map((g) => (
                            <div key={g.freq} className="flex flex-col gap-1.5">
                                <div className="flex items-baseline justify-between gap-3 px-1">
                                    <span className="text-[13px] font-medium text-neutral-800">{FREQ_LABELS[g.freq]}</span>
                                    <span className="text-[12px] nums text-neutral-500">
                                        {g.tasks.length} · {formatDuration(g.tasks.reduce((sum, t) => sum + t.minutes, 0))}
                                    </span>
                                </div>
                                <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-hairline bg-white">
                                    {g.tasks.map((task) => (
                                    <li key={task.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap">
                                        <input
                                            aria-label="Job"
                                            value={task.name}
                                            onChange={(e) => patch(task.key, { name: e.target.value })}
                                            maxLength={120}
                                            className="h-11 min-w-0 basis-full rounded-lg border border-transparent bg-transparent px-2 text-[15px] text-neutral-900 outline-none hover:border-neutral-200 focus:border-neutral-900 sm:flex-1 sm:basis-auto"
                                        />
                                        <MinutesField value={task.minutes} onChange={(minutes) => patch(task.key, { minutes })} />
                                        <Select
                                            options={FREQ_OPTIONS}
                                            value={task.freq}
                                            onChange={(v) => patch(task.key, { freq: v as CleaningFreq })}
                                            className="min-w-0 flex-1 sm:w-48 sm:flex-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setTasks(room.tasks.filter((t) => t.key !== task.key))}
                                            aria-label={`Remove ${task.name}`}
                                            className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                        >
                                            <i className="fa-solid fa-trash-can text-[13px]" aria-hidden="true" />
                                        </button>
                                    </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {suggestions.length > 0 && (
                <section className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                        <h3 className={OVERLINE}>Suggestions</h3>
                        <button
                            type="button"
                            onClick={() =>
                                setTasks([
                                    ...room.tasks,
                                    ...suggestions.map((x) => ({ key: newKey('t'), name: x.name, minutes: x.minutes, freq: x.freq })),
                                ])
                            }
                            className="text-[13px] font-medium text-area-cleaning hover:underline"
                        >
                            Add all {suggestions.length}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {shownSuggestions.map((s) => (
                            <button
                                key={s.name}
                                type="button"
                                onClick={() =>
                                    setTasks([...room.tasks, { key: newKey('t'), name: s.name, minutes: s.minutes, freq: s.freq }])
                                }
                                className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-2xl border border-hairline bg-white px-3 py-1.5 text-left text-[13px] leading-snug text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                            >
                                <i className="fa-solid fa-plus shrink-0 text-[10px] text-neutral-500" aria-hidden="true" />
                                <span className="min-w-0">
                                    {s.name}
                                    <span className="text-neutral-400">
                                        {' '}
                                        · {formatDuration(s.minutes)} · {FREQ_LABELS[s.freq].toLowerCase()}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    {suggestions.length > 8 && (
                        <button
                            type="button"
                            onClick={() => setAllSuggestions((v) => !v)}
                            className="self-start text-[13px] text-neutral-600 hover:text-neutral-900"
                        >
                            {allSuggestions ? 'Show fewer' : `Show all ${suggestions.length}`}
                        </button>
                    )}
                </section>
            )}

            <form
                className="flex gap-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    addCustom()
                }}
            >
                <Input
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Add your own job, e.g. Descale the kettle"
                    maxLength={120}
                    wrapperClassName="min-w-0 flex-1"
                />
                <button
                    type="submit"
                    disabled={!custom.trim()}
                    className="h-11 shrink-0 rounded-lg border border-hairline px-4 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-300 hover:bg-white disabled:cursor-not-allowed disabled:text-neutral-400 lg:h-11"
                >
                    Add
                </button>
            </form>
        </div>
    )
}

/** Minutes as a small number box with an "m" after it; empty or nonsense snaps back on blur. */
function MinutesField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [text, setText] = useState(String(value))
    const [focused, setFocused] = useState(false)
    const shown = focused ? text : String(value)
    return (
        <label className="relative w-[88px] shrink-0">
            <span className="sr-only">Minutes</span>
            <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                value={shown}
                onFocus={() => {
                    setText(String(value))
                    setFocused(true)
                }}
                onChange={(e) => {
                    setText(e.target.value)
                    const n = Math.round(Number(e.target.value))
                    if (n >= 1 && n <= 600) onChange(n)
                }}
                onBlur={() => setFocused(false)}
                className="nums"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[13px] text-neutral-500">
                min
            </span>
        </label>
    )
}
