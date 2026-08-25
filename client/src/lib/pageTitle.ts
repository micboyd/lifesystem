import { WORKSPACES, navItemForPath, workspaceForPath } from './workspace'

/**
 * Map a router pathname to its human page name. Order matters: more specific
 * prefixes are checked before their parents (e.g. /finances/budgets before
 * /finances). Unknown paths fall back to the brand alone.
 */
export function pageNameForPath(pathname: string): string | null {
    // Work pages take their name straight from the nav config, so a module
    // renamed there is renamed in the tab title too.
    if (workspaceForPath(pathname) === 'work') {
        return navItemForPath(pathname)?.label ?? null
    }

    if (pathname === '/') return 'Dashboard'
    if (pathname === '/login') return 'Sign in'
    if (pathname === '/calendar') return 'Calendar'
    if (pathname.startsWith('/day/')) return 'Day'
    if (pathname === '/life-plan') return 'Life Plan'
    if (pathname === '/timebox') return 'Timebox'
    if (pathname === '/habits') return 'Habits'
    if (pathname === '/study') return 'Studying'
    if (pathname === '/fitness') return 'Fitness'
    if (pathname === '/nutrition/import') return 'Import Meals'
    if (pathname === '/nutrition') return 'Nutrition'
    if (pathname.startsWith('/finances/breakdown')) return 'Breakdown'
    if (pathname.startsWith('/finances/budgets')) return 'Budgets'
    if (pathname.startsWith('/finances/daily-log')) return 'Daily Log'
    if (pathname.startsWith('/finances/forecast')) return 'Savings Forecast'
    if (pathname.startsWith('/finances/spaces')) return 'Spaces'
    if (pathname.startsWith('/finances')) return 'Finances'
    if (pathname === '/days-since') return 'Days Since'
    if (pathname === '/notes') return 'Notes'
    if (pathname === '/checklists') return 'Checklists'
    if (pathname === '/weather') return 'Weather'
    if (pathname === '/profile') return 'Profile'
    if (pathname === '/styleguide') return 'Style Guide'
    return null
}

/**
 * "AdminLife - Calendar", or "AdminWork - Tasks" — the brand follows the
 * workspace so a background tab says which mode it was left in. Unknown paths
 * fall back to the brand alone.
 */
export function documentTitleForPath(pathname: string): string {
    const brand = WORKSPACES[workspaceForPath(pathname)].name
    const name = pageNameForPath(pathname)
    return name ? `${brand} - ${name}` : brand
}
