import { Card } from './Card'

/** How a figure should read: plain, good news, worth watching, or bad news. */
export type StatTone = 'neutral' | 'good' | 'warn' | 'bad'

const TONE_TEXT: Record<StatTone, string> = {
    neutral: 'text-neutral-900',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
}

/**
 * One headline number in a card: a quiet label, the figure, and a line of
 * context underneath. Laid out in a grid by whatever is showing them.
 *
 * The sub-line is doing real work and is worth filling in. A number on its own
 * ("42,180 kg") is trivia; the same number against what it was last month is
 * the reason anyone opened the page.
 */
export default function StatTile({
    label,
    value,
    sub,
    tone = 'neutral',
}: {
    label: string
    value: string
    sub?: string
    tone?: StatTone
}) {
    return (
        <Card hover={false} className="flex flex-col gap-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
            {sub && <p className="text-xs text-neutral-400">{sub}</p>}
        </Card>
    )
}
