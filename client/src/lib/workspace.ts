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
    { label: 'Life Plan', to: '/life-plan', icon: 'fa-compass' },
    { label: 'Finances', to: '/finances', icon: 'fa-wallet' },
    { label: 'Timebox', to: '/timebox', icon: 'fa-table-cells-large' },
    { label: 'Habits & goals', to: '/goals', icon: 'fa-bullseye' },
    { label: 'Fitness', to: '/fitness', icon: 'fa-dumbbell' },
    { label: 'Nutrition', to: '/nutrition', icon: 'fa-bowl-food' },
    { label: 'Timeline', to: '/timeline', icon: 'fa-route' },
    { label: 'Consistency', to: '/consistency', icon: 'fa-gauge-high' },
    { label: 'Notes', to: '/notes', icon: 'fa-note-sticky' },
    { label: 'Lists', to: '/lists', icon: 'fa-list-check' },
    { label: 'Weather', to: '/weather', icon: 'fa-cloud-sun' },
]
