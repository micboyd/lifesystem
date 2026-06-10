/** Brand shown before every page name in the document title. */
export const BRAND = 'AdminLife'

/**
 * Map a router pathname to its human page name. Order matters: more specific
 * prefixes are checked before their parents (e.g. /finances/budgets before
 * /finances). Unknown paths fall back to the brand alone.
 */
export function pageNameForPath(pathname: string): string | null {
    if (pathname === '/') return 'Dashboard'
    if (pathname === '/login') return 'Sign in'
    if (pathname === '/calendar') return 'Calendar'
    if (pathname.startsWith('/day/')) return 'Day'
    if (pathname === '/timebox') return 'Timebox'
    if (pathname === '/habits') return 'Habits'
    if (pathname.startsWith('/finances/breakdown')) return 'Breakdown'
    if (pathname.startsWith('/finances/budgets')) return 'Budgets'
    if (pathname.startsWith('/finances/daily-log')) return 'Daily Log'
    if (pathname.startsWith('/finances/forecast')) return 'Savings Forecast'
    if (pathname.startsWith('/finances')) return 'Finances'
    if (pathname === '/profile') return 'Profile'
    if (pathname === '/styleguide') return 'Style Guide'
    return null
}

/** "AdminLife - Calendar", or just "AdminLife" for unknown/landing paths. */
export function documentTitleForPath(pathname: string): string {
    const name = pageNameForPath(pathname)
    return name ? `${BRAND} - ${name}` : BRAND
}
