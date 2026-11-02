/**
 * The one safety line a route shows. Routing data can't say whether a path is
 * lit, safe or quiet, so the app never claims it — it only asks you to check
 * when the session is likely to be run in the dark.
 */

export const LIT_WARNING = 'Check this route is lit before you go.'

/** Evening slot any time of year; Morning slot from November to February. */
export function needsLitCheck(part: 'morning' | 'afternoon' | 'evening', date: string): boolean {
    if (part === 'evening') return true
    const month = Number(date.slice(5, 7))
    return part === 'morning' && (month >= 11 || month <= 2)
}
