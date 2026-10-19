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
        <div className="flex min-w-0 flex-col gap-1 rounded-[20px] bg-white p-4 ring-1 ring-neutral-900/[0.06]">
            <p className="truncate text-[13px] text-neutral-500">{label}</p>
            <p className="nums truncate text-2xl font-semibold tracking-tight text-neutral-900">
                {value}
            </p>
            {sub && (
                <p className="text-[13px] leading-snug text-neutral-500">
                    {tone === 'neutral' ? (
                        sub
                    ) : (
                        <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_PILL[tone]}`}
                        >
                            {sub}
                        </span>
                    )}
                </p>
            )}
        </div>
    )
}
