import { LOAD_LEVEL_LABELS, type LoadLevel } from '../../lib/lifeLoad'
import { LEVEL_PILL, UNKNOWN_PILL } from './loadStyles'

/**
 * A month's level, as a pill.
 *
 * `level` is null when nothing in the month could be priced — which is a
 * different statement from "quiet", and reads as one.
 */
export default function LoadPill({
    level,
    label,
    detail,
}: {
    level: LoadLevel | null
    label?: string
    /** What tipped it, e.g. "Body". Shown after the level. */
    detail?: string
}) {
    const text = label ?? (level ? LOAD_LEVEL_LABELS[level] : 'Unscored')

    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                level ? LEVEL_PILL[level] : UNKNOWN_PILL
            }`}
        >
            {level === 'overloaded' && (
                <i className="fa-solid fa-triangle-exclamation text-[9px]" aria-hidden="true" />
            )}
            {text}
            {detail && <span className="opacity-70">{detail}</span>}
        </span>
    )
}
