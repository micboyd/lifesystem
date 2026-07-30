import { HABIT_ICONS, iconForHabit } from '../../lib/habitIcons'

interface Props {
    value?: string
    onChange: (icon: string | undefined) => void
    /** Habit name, so the "auto" preview shows what the fallback would pick. */
    name?: string
}

/**
 * Grid of habit icons. Selecting the current one clears it (back to the
 * name-based automatic icon). The first cell is the "Auto" option, which
 * previews the keyword-matched fallback.
 */
export default function HabitIconPicker({ value, onChange, name = '' }: Props) {
    const autoIcon = iconForHabit(name)
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Icon</label>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
                {/* Auto (name-based) */}
                <button
                    type="button"
                    onClick={() => onChange(undefined)}
                    title="Automatic (from name)"
                    aria-pressed={!value}
                    className={[
                        'relative grid aspect-square place-items-center rounded-xl text-sm transition-colors',
                        !value
                            ? 'bg-emerald-500 text-white'
                            : 'bg-neutral-50 text-neutral-400 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-100',
                    ].join(' ')}
                >
                    <i className={autoIcon} aria-hidden="true" />
                    <span className="absolute -bottom-0.5 right-0.5 text-[7px] font-bold uppercase opacity-70">
                        A
                    </span>
                </button>

                {HABIT_ICONS.map((icon) => {
                    const selected = value === icon
                    return (
                        <button
                            key={icon}
                            type="button"
                            onClick={() => onChange(selected ? undefined : icon)}
                            aria-pressed={selected}
                            className={[
                                'grid aspect-square place-items-center rounded-xl text-sm transition-colors',
                                selected
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-neutral-50 text-neutral-500 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-100 hover:text-neutral-700',
                            ].join(' ')}
                        >
                            <i className={icon} aria-hidden="true" />
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
