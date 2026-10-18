import { Card } from './Card'

/** How a figure should read: plain, good news, worth watching, or bad news. */
export type StatTone = 'neutral' | 'good' | 'warn' | 'bad'

// The figure stays ink; the tone colours the sub-line's pill, which carries the
// change, so a red or green number never has to be read on colour alone.
const TONE_PILL: Record<StatTone, string> = {
    neutral: 'bg-neutral-100 text-neutral-700',
    good: 'bg-success-bg text-success',
    warn: 'bg-warning-bg text-warning',
    bad: 'bg-danger-bg text-danger',
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
        <Card hover={false} className="flex flex-col gap-1.5">
            <p className="text-[13px] text-neutral-600">{label}</p>
            <p className="text-[28px] font-medium leading-[34px] tracking-[-0.03em] tabular-nums text-neutral-900">
                {value}
            </p>
            {sub && (
                <p className="text-xs text-neutral-500">
                    {tone === 'neutral' ? (
                        sub
                    ) : (
                        <span className={`rounded-full px-2 py-0.5 font-medium ${TONE_PILL[tone]}`}>
                            {sub}
                        </span>
                    )}
                </p>
            )}
        </Card>
    )
}
