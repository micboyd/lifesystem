/**
 * Navigation config: the destinations in the sidebar rail and drawer, and the
 * brand shown above them.
 */

export interface NavItem {
    label: string
    to: string
    /** Font Awesome class suffix, e.g. "fa-house". */
    icon: string
    /** The life area's tint and hue for the icon tile, so each destination keeps its colour everywhere. */
    tone: string
}

export const BRAND = {
    name: 'AdminLife',
    icon: 'fa-layer-group',
    markClass: 'bg-coral-500 text-white',
    navActiveClass: 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.06]',
    navActiveIconClass: '',
    profileActiveClass: 'bg-coral-50',
}

export const NAV_ITEMS: NavItem[] = [
    { label: 'Home', to: '/', icon: 'fa-house', tone: 'bg-area-home-bg text-area-home' },
    {
        label: 'Calendar',
        to: '/calendar',
        icon: 'fa-calendar-days',
        tone: 'bg-brand-50 text-brand-500',
    },
    {
        label: 'Timebox',
        to: '/timebox',
        icon: 'fa-table-list',
        tone: 'bg-brand-50 text-brand-500',
    },
    {
        label: 'Finances',
        to: '/finances',
        icon: 'fa-wallet',
        tone: 'bg-area-money-bg text-area-money',
    },
    {
        label: 'Habits & goals',
        to: '/goals',
        icon: 'fa-bullseye',
        tone: 'bg-area-habits-bg text-area-habits',
    },
    {
        label: 'Fitness',
        to: '/fitness',
        icon: 'fa-dumbbell',
        tone: 'bg-area-fitness-bg text-area-fitness',
    },
    {
        label: 'Nutrition',
        to: '/nutrition',
        icon: 'fa-bowl-food',
        tone: 'bg-area-nutrition-bg text-area-nutrition',
    },
    {
        label: 'Walking',
        to: '/walking',
        icon: 'fa-person-walking',
        tone: 'bg-area-walking-bg text-area-walking',
    },
    {
        label: 'Timeline',
        to: '/timeline',
        icon: 'fa-route',
        tone: 'bg-area-home-bg text-area-home',
    },
    {
        label: 'Consistency',
        to: '/consistency',
        icon: 'fa-gauge-high',
        tone: 'bg-area-countdowns-bg text-area-countdowns',
    },
    {
        label: 'Notes',
        to: '/notes',
        icon: 'fa-note-sticky',
        tone: 'bg-neutral-100 text-neutral-700',
    },
    {
        label: 'Weather',
        to: '/weather',
        icon: 'fa-cloud-sun',
        tone: 'bg-area-weather-bg text-area-weather',
    },
]

export interface NavGroup {
    label: string
    /** Paths from NAV_ITEMS, in the order they appear in the group. */
    paths: string[]
}

/**
 * How the mobile menu groups NAV_ITEMS. The desktop rail keeps the flat order
 * above; any item left out of every group lands in a trailing "More" group.
 */
export const NAV_GROUPS: NavGroup[] = [
    { label: 'Day to day', paths: ['/', '/calendar', '/notes', '/weather'] },
    { label: 'Plan', paths: ['/timebox', '/goals'] },
    { label: 'Health', paths: ['/fitness', '/nutrition', '/walking', '/timeline', '/consistency'] },
    { label: 'Money', paths: ['/finances'] },
]
