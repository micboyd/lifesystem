/**
 * Workspaces — the two modes the app runs in.
 *
 * The app started life-only. Work admin is the same chassis (auth, components,
 * shell) pointed at a different set of concerns, so rather than a second app it
 * lives behind a switcher: everything under `/work` is the work workspace,
 * everything else is life.
 *
 * Deriving the mode from the pathname rather than holding it in state means a
 * deep link, a refresh and the back button all land in the right workspace
 * without anything to keep in sync.
 */

export type Workspace = 'life' | 'work'

export interface NavItem {
    label: string
    to: string
    /** Font Awesome class suffix, e.g. "fa-house". */
    icon: string
    /**
     * One line on what the module is for. Work modules are unbuilt, so this is
     * what the dashboard and the placeholder page show in place of the feature.
     */
    blurb?: string
}

export interface WorkspaceMeta {
    id: Workspace
    /** Wordmark in the rail and the document title. */
    name: string
    /** Short label for the switcher. */
    label: string
    icon: string
    /** Landing route; also where the switcher sends you. */
    root: string
    /**
     * Complete Tailwind class strings, never assembled from fragments —
     * Tailwind v4 scans source text, so `bg-${x}-50` would produce no CSS.
     */
    markClass: string
    navActiveClass: string
    navActiveIconClass: string
    profileActiveClass: string
}

export const WORKSPACES: Record<Workspace, WorkspaceMeta> = {
    life: {
        id: 'life',
        name: 'AdminLife',
        label: 'Life',
        icon: 'fa-layer-group',
        root: '/',
        markClass: 'bg-coral-500 text-white shadow-sm shadow-coral-500/30',
        navActiveClass: 'bg-coral-50 text-coral-700 ring-1 ring-coral-100',
        navActiveIconClass: 'text-coral-500',
        profileActiveClass: 'bg-coral-50 ring-1 ring-coral-100',
    },
    work: {
        id: 'work',
        name: 'AdminWork',
        label: 'Work',
        icon: 'fa-briefcase',
        root: '/work',
        markClass: 'bg-brand-600 text-white shadow-sm shadow-brand-600/30',
        navActiveClass: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100',
        navActiveIconClass: 'text-brand-600',
        profileActiveClass: 'bg-brand-50 ring-1 ring-brand-100',
    },
}

export const WORKSPACE_ORDER: Workspace[] = ['life', 'work']

/** Which workspace a pathname belongs to. Anything outside /work is life. */
export function workspaceForPath(pathname: string): Workspace {
    return pathname === '/work' || pathname.startsWith('/work/') ? 'work' : 'life'
}

export function otherWorkspace(current: Workspace): WorkspaceMeta {
    return WORKSPACES[current === 'life' ? 'work' : 'life']
}

const LIFE_NAV: NavItem[] = [
    { label: 'Home', to: '/', icon: 'fa-house' },
    { label: 'Calendar', to: '/calendar', icon: 'fa-calendar-days' },
    { label: 'Life Plan', to: '/life-plan', icon: 'fa-compass' },
    { label: 'Finances', to: '/finances', icon: 'fa-wallet' },
    { label: 'Timebox', to: '/timebox', icon: 'fa-table-cells-large' },
    { label: 'Habits', to: '/habits', icon: 'fa-repeat' },
    { label: 'Goals', to: '/goals', icon: 'fa-bullseye' },
    { label: 'Studying', to: '/study', icon: 'fa-graduation-cap' },
    { label: 'Fitness', to: '/fitness', icon: 'fa-dumbbell' },
    { label: 'Nutrition', to: '/nutrition', icon: 'fa-bowl-food' },
    { label: 'Notes', to: '/notes', icon: 'fa-note-sticky' },
    { label: 'Checklists', to: '/checklists', icon: 'fa-list-check' },
    { label: 'Weather', to: '/weather', icon: 'fa-cloud-sun' },
]

/**
 * The work modules. None are built yet — this is the intended shape of the
 * workspace, and each entry currently routes to a placeholder. Delete or
 * reorder freely; nothing downstream depends on the list beyond the routes in
 * App.tsx matching the `to` values.
 */
const WORK_NAV: NavItem[] = [
    { label: 'Dashboard', to: '/work', icon: 'fa-gauge-high' },
    {
        label: 'Tasks',
        to: '/work/tasks',
        icon: 'fa-list-check',
        blurb: 'Work to-dos, each carrying where it came from and what it belongs to.',
    },
    {
        label: 'Waiting On',
        to: '/work/waiting',
        icon: 'fa-hourglass-half',
        blurb: "What you're blocked on, who owes it, and how long it's been sitting.",
    },
    {
        label: 'Projects',
        to: '/work/projects',
        icon: 'fa-diagram-project',
        blurb: 'Workstreams between a task and an objective — status and current state.',
    },
    {
        label: 'Meetings',
        to: '/work/meetings',
        icon: 'fa-comments',
        blurb: '1:1s and meeting notes, with agendas that accumulate between sessions.',
    },
    {
        label: 'People',
        to: '/work/people',
        icon: 'fa-user-group',
        blurb: 'Who you work with, what they care about, and the threads still open.',
    },
    {
        label: 'Notes',
        to: '/work/notes',
        icon: 'fa-note-sticky',
        blurb: 'Meeting notes, technical notes and runbooks, linked to each other.',
    },
    {
        label: 'Decisions',
        to: '/work/decisions',
        icon: 'fa-scale-balanced',
        blurb: 'What was decided, when, why, and what else was on the table.',
    },
    {
        label: 'Evidence',
        to: '/work/evidence',
        icon: 'fa-trophy',
        blurb: 'Shipped work, wins and feedback, tagged to competencies for review time.',
    },
    {
        label: 'Objectives',
        to: '/work/objectives',
        icon: 'fa-bullseye',
        blurb: 'Objectives for the current cycle and the evidence backing each one.',
    },
    {
        label: 'Time',
        to: '/work/time',
        icon: 'fa-chart-pie',
        blurb: 'Where the week actually went — meetings against focus against interrupts.',
    },
    {
        label: 'Admin',
        to: '/work/admin',
        icon: 'fa-folder-open',
        blurb: 'Leave, expenses, training and on-call — the bits tracked nowhere else.',
    },
]

export const NAV_ITEMS: Record<Workspace, NavItem[]> = {
    life: LIFE_NAV,
    work: WORK_NAV,
}

/** Work modules shown on the dashboard — everything but the dashboard itself. */
export const WORK_MODULES: NavItem[] = WORK_NAV.filter((item) => item.to !== '/work')

/** The nav entry a pathname sits under, if any. */
export function navItemForPath(pathname: string): NavItem | undefined {
    const items = NAV_ITEMS[workspaceForPath(pathname)]
    return items.find((item) => item.to === pathname)
}
