import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import Avatar from './Avatar'
import { useAuth } from '../context/AuthContext'
import {
    NAV_ITEMS,
    WORKSPACES,
    WORKSPACE_ORDER,
    otherWorkspace,
    workspaceForPath,
    type NavItem,
    type WorkspaceMeta,
} from '../lib/workspace'

/** Shared row shape for nav links. */
const rowBase =
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors'
const rowIdle = 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'

/**
 * A link is active for its exact path and any nested route — except a workspace
 * root ("/" or "/work"), which would otherwise match everything beneath it.
 */
function isActive(pathname: string, to: string, root: string): boolean {
    if (to === root) return pathname === to
    return pathname === to || pathname.startsWith(`${to}/`)
}

function Brand({ meta, collapsed = false }: { meta: WorkspaceMeta; collapsed?: boolean }) {
    return (
        <Link
            to={meta.root}
            className="flex items-center gap-2.5 shrink-0"
            title={collapsed ? meta.name : undefined}
        >
            <span className={`grid h-9 w-9 place-items-center rounded-2xl ${meta.markClass}`}>
                <i className={`fa-solid ${meta.icon} text-sm`} aria-hidden="true" />
            </span>
            {!collapsed && (
                <span className="text-[15px] font-extrabold tracking-tight text-neutral-900">
                    {meta.name}
                </span>
            )}
        </Link>
    )
}

/**
 * Life / Work. Expanded it's a segmented control so both modes are visible at
 * rest; collapsed there's no room for two, so it becomes a single button
 * pointing at wherever you currently aren't.
 */
function WorkspaceSwitcher({
    meta,
    collapsed = false,
}: {
    meta: WorkspaceMeta
    collapsed?: boolean
}) {
    if (collapsed) {
        const target = otherWorkspace(meta.id)
        return (
            <Link
                to={target.root}
                title={`Switch to ${target.label}`}
                aria-label={`Switch to ${target.label}`}
                className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-neutral-500 transition-colors hover:text-neutral-900"
            >
                <i className={`fa-solid ${target.icon} text-xs`} aria-hidden="true" />
            </Link>
        )
    }

    return (
        <div className="flex rounded-full bg-neutral-100 p-1" role="group" aria-label="Workspace">
            {WORKSPACE_ORDER.map((id) => {
                const option = WORKSPACES[id]
                const current = option.id === meta.id
                return (
                    <Link
                        key={id}
                        to={option.root}
                        aria-current={current ? 'true' : undefined}
                        className={[
                            'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors',
                            current
                                ? 'bg-white font-bold text-neutral-900 shadow-sm'
                                : 'font-semibold text-neutral-400 hover:text-neutral-700',
                        ].join(' ')}
                    >
                        <i className={`fa-solid ${option.icon} text-[10px]`} aria-hidden="true" />
                        {option.label}
                    </Link>
                )
            })}
        </div>
    )
}

/** The shared list of destination links, used by both the rail and the drawer. */
function NavLinks({
    pathname,
    meta,
    items,
    collapsed = false,
}: {
    pathname: string
    meta: WorkspaceMeta
    items: NavItem[]
    collapsed?: boolean
}) {
    return (
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
            {items.map(({ label, to, icon }) => {
                const active = isActive(pathname, to, meta.root)
                return (
                    <Link
                        key={to}
                        to={to}
                        title={collapsed ? label : undefined}
                        className={`${rowBase} ${collapsed ? 'justify-center px-0' : ''} ${active ? meta.navActiveClass : rowIdle}`}
                    >
                        <i
                            className={`fa-solid ${icon} w-5 shrink-0 text-center text-[0.95rem] ${active ? meta.navActiveIconClass : ''}`}
                            aria-hidden="true"
                        />
                        {!collapsed && <span>{label}</span>}
                    </Link>
                )
            })}
        </nav>
    )
}

/** Profile chip pinned to the base of the rail. */
function ProfileChip({
    active,
    meta,
    collapsed = false,
}: {
    active: boolean
    meta: WorkspaceMeta
    collapsed?: boolean
}) {
    const { user } = useAuth()
    if (collapsed) {
        return (
            <Link
                to="/profile"
                title={user?.name ?? 'Your profile'}
                className={[
                    'flex justify-center rounded-2xl px-2.5 py-2.5 transition-colors',
                    active ? meta.profileActiveClass : 'hover:bg-neutral-100',
                ].join(' ')}
            >
                <Avatar name={user?.name} size="sm" />
            </Link>
        )
    }
    return (
        <Link
            to="/profile"
            className={[
                'flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors',
                active ? meta.profileActiveClass : 'hover:bg-neutral-100',
            ].join(' ')}
        >
            <Avatar name={user?.name} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-neutral-900">
                    {user?.name ?? 'Your profile'}
                </p>
                <p className="truncate text-xs text-neutral-400">View profile</p>
            </div>
            <i className="fa-solid fa-chevron-right text-[10px] text-neutral-300" aria-hidden="true" />
        </Link>
    )
}

export default function Sidebar({
    collapsed = false,
    onToggle,
}: {
    collapsed?: boolean
    onToggle?: () => void
}) {
    const { pathname } = useLocation()
    const [open, setOpen] = useState(false)
    const profileActive = isActive(pathname, '/profile', '/')

    // The rail reskins itself around whichever workspace the route belongs to.
    const meta = WORKSPACES[workspaceForPath(pathname)]
    const items = NAV_ITEMS[meta.id]

    // Close the mobile drawer on navigation.
    useEffect(() => {
        setOpen(false)
    }, [pathname])

    // Lock body scroll while the drawer is open.
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : ''
        return () => {
            document.body.style.overflow = ''
        }
    }, [open])

    return (
        <>
            {/* Desktop rail */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-black/[0.06] bg-white transition-[width] duration-200 ease-out lg:flex ${collapsed ? 'w-20' : 'w-64'}`}
            >
                <div className={`flex h-16 shrink-0 items-center ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
                    <Brand meta={meta} collapsed={collapsed} />
                </div>
                <div className={`shrink-0 pb-1 ${collapsed ? 'px-2' : 'px-3'}`}>
                    <WorkspaceSwitcher meta={meta} collapsed={collapsed} />
                </div>
                <NavLinks pathname={pathname} meta={meta} items={items} collapsed={collapsed} />
                <div className="shrink-0 border-t border-black/[0.06] p-3">
                    <ProfileChip active={profileActive} meta={meta} collapsed={collapsed} />
                </div>

                {/* Collapse / expand toggle, straddling the rail's right edge. */}
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full border border-black/[0.06] bg-white text-neutral-400 shadow-sm transition-colors hover:text-neutral-700"
                >
                    <i
                        className={`fa-solid fa-chevron-left text-[10px] transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                </button>
            </aside>

            {/* Mobile top bar */}
            <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-black/[0.06] bg-white/90 px-4 backdrop-blur-md lg:hidden">
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label="Open menu"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100"
                >
                    <i className="fa-solid fa-bars text-sm" aria-hidden="true" />
                </button>
                <Brand meta={meta} />
            </div>

            {/* Mobile drawer */}
            {createPortal(
                <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`}>
                    {/* Backdrop */}
                    <div
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                        className={`absolute inset-0 bg-neutral-900/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
                    />

                    {/* Panel */}
                    <div
                        className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white transition-transform duration-300 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
                    >
                        <div className="flex h-16 shrink-0 items-center justify-between px-5">
                            <Brand meta={meta} />
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close menu"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-xmark" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="shrink-0 px-3 pb-1">
                            <WorkspaceSwitcher meta={meta} />
                        </div>
                        <NavLinks pathname={pathname} meta={meta} items={items} />
                        <div className="shrink-0 border-t border-black/[0.06] p-3">
                            <ProfileChip active={profileActive} meta={meta} />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
