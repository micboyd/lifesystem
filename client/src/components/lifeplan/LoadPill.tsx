import type { LoadLevel } from '../../lib/lifeLoad'

/**
 * A month's load, as a pill. Quiet reads as unremarkable and overloaded reads as
 * a warning, because the whole point of the score is that one of those is worth
 * stopping on and the others aren't.
 */
const LEVEL_CLASSES: Record<LoadLevel, string> = {
    quiet: 'bg-neutral-100 text-neutral-500',
    steady: 'bg-herb/15 text-herb',
    busy: 'bg-marigold/20 text-amber-700',
    overloaded: 'bg-red-50 text-red-600',
}

export default function LoadPill({
    level,
    label,
    score,
}: {
    level: LoadLevel
    label: string
    score?: number
}) {
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${LEVEL_CLASSES[level]}`}
        >
            {level === 'overloaded' && (
                <i className="fa-solid fa-triangle-exclamation text-[9px]" aria-hidden="true" />
            )}
            {label}
            {score !== undefined && <span className="tabular-nums opacity-70">{score}</span>}
        </span>
    )
}
