/**
 * Navigation config: the destinations in the sidebar rail and drawer, and the
 * brand shown above them.
 */

export interface NavItem {
    label: string
    to: string
    /** Font Awesome class suffix, e.g. "fa-house". */
    icon: string
}

export const BRAND = {
    name: 'AdminLife',
    icon: 'fa-layer-group',
    markClass: 'bg-coral-500 text-white',
    navActiveClass: 'bg-coral-50 text-coral-700',
    navActiveIconClass: 'text-coral-500',
    profileActiveClass: 'bg-coral-50',
}

export const NAV_ITEMS: NavItem[] = [
    { label: 'Home', to: '/', icon: 'fa-house' },
    { label: 'Calendar', to: '/calendar', icon: 'fa-calendar-days' },
    { label: 'Finances', to: '/finances', icon: 'fa-wallet' },
    { label: 'Habits & goals', to: '/goals', icon: 'fa-bullseye' },
    { label: 'Fitness', to: '/fitness', icon: 'fa-dumbbell' },
    { label: 'Nutrition', to: '/nutrition', icon: 'fa-bowl-food' },
    { label: 'Timeline', to: '/timeline', icon: 'fa-route' },
    { label: 'Consistency', to: '/consistency', icon: 'fa-gauge-high' },
    { label: 'Notes', to: '/notes', icon: 'fa-note-sticky' },
    { label: 'Weather', to: '/weather', icon: 'fa-cloud-sun' },
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
    { label: 'Plan', paths: ['/goals'] },
    { label: 'Health', paths: ['/fitness', '/nutrition', '/timeline', '/consistency'] },
    { label: 'Money', paths: ['/finances'] },
]
