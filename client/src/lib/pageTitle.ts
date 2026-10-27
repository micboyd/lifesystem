import { BRAND } from './workspace'

/**
 * Map a router pathname to its human page name. Order matters: more specific
 * prefixes are checked before their parents (e.g. /finances/budgets before
 * /finances). Unknown paths fall back to the brand alone.
 */
export function pageNameForPath(pathname: string): string | null {
    if (pathname === '/') return 'Dashboard'
    if (pathname === '/login') return 'Sign in'
    if (pathname === '/calendar') return 'Calendar'
    if (pathname === '/life-plan') return 'Life Plan'
    if (pathname === '/timebox') return 'Timebox'
    if (pathname === '/goals') return 'Habits & goals'
    if (pathname === '/fitness') return 'Fitness'
    if (pathname === '/nutrition') return 'Nutrition'
    if (pathname === '/timeline') return 'Timeline'
    if (pathname === '/consistency') return 'Consistency'
    if (pathname.startsWith('/finances/breakdown')) return 'Breakdown'
    if (pathname.startsWith('/finances/budgets')) return 'Budgets'
    if (pathname.startsWith('/finances/daily-log')) return 'Daily Log'
    if (pathname.startsWith('/finances/forecast')) return 'Savings Forecast'
    if (pathname.startsWith('/finances/spaces')) return 'Spaces'
    if (pathname.startsWith('/finances/statement')) return 'Statement'
    if (pathname.startsWith('/finances')) return 'Finances'
    if (pathname === '/days-since') return 'Days Since'
    if (pathname === '/notes') return 'Notes'
    if (pathname.startsWith('/lists')) return 'Lists'
    if (pathname === '/weather') return 'Weather'
    if (pathname === '/profile') return 'Profile'
    if (pathname === '/perfect-day') return 'Perfect day'
    if (pathname === '/styleguide') return 'Style Guide'
    return null
}

/** "AdminLife - Calendar". Unknown paths fall back to the brand alone. */
export function documentTitleForPath(pathname: string): string {
    const brand = BRAND.name
    const name = pageNameForPath(pathname)
    return name ? `${brand} - ${name}` : brand
}
