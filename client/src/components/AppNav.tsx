import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Avatar from './Avatar'
import BottomSheet from './BottomSheet'
import QuickLog from './QuickLog'
import { useAuth } from '../context/AuthContext'
import { BRAND, NAV_GROUPS, NAV_ITEMS, type NavItem } from '../lib/workspace'

/**
 * The app's navigation, hybrid style. Wide screens get a quiet sidebar: areas
 * grouped, each with its colour, ⌘K to jump anywhere, safe-to-spend and you at
 * the bottom; it folds to an icon rail for dense pages like the planners.
 * Phones get a slim top bar and a bottom tab bar, with everything else under More.
 */

/** A link is active for its exact path and any nested route, except the root. */
export function isActive(pathname: string, to: string): boolean {
    if (to === '/') return pathname === to
    return pathname === to || pathname.startsWith(`${to}/`)
}

/** NAV_ITEMS in NAV_GROUPS; anything ungrouped trails as "More". */
function groupedNav(): { label: string; items: NavItem[] }[] {
    const byPath = new Map(NAV_ITEMS.map((item) => [item.to, item]))
    const groups = NAV_GROUPS.map((g) => ({ label: g.label, items: g.paths.flatMap((p) => byPath.get(p) ?? []) }))
    const grouped = new Set(NAV_GROUPS.flatMap((g) => g.paths))
    const rest = NAV_ITEMS.filter((item) => !grouped.has(item.to))
    if (rest.length) groups.push({ label: 'More', items: rest })
    return groups.filter((g) => g.items.length)
}
const GROUPS = groupedNav()

/** The phone's tab bar: four destinations and More. */
const TABS: { to: string; label: string; icon: string }[] = [
    { to: '/', label: 'Today', icon: 'fa-house' },
    { to: '/calendar', label: 'Calendar', icon: 'fa-calendar-days' },
    { to: '/fitness', label: 'Fitness', icon: 'fa-dumbbell' },
    { to: '/nutrition', label: 'Food', icon: 'fa-bowl-food' },
]

function Mark() {
    return (
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-[7px] ${BRAND.markClass}`} aria-hidden="true">
            <i className={`fa-solid ${BRAND.icon} text-[11px]`} />
        </span>
    )
}

// ─── ⌘K ──────────────────────────────────────────────────────────────────────

/** Jump to any area by typing a few letters. Opens with ⌘K / Ctrl+K anywhere. */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [index, setIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)

    const results = useMemo(() => {
        const q = query.trim().toLowerCase()
        const all = [...NAV_ITEMS, { label: 'Profile and settings', to: '/profile', icon: 'fa-user', tone: '', dot: 'bg-neutral-900' }]
        return q ? all.filter((i) => i.label.toLowerCase().includes(q)) : all
    }, [query])

    useEffect(() => {
        if (open) inputRef.current?.focus()
    }, [open])

    if (!open) return null

    const go = (to: string) => {
        navigate(to)
        setQuery('')
        setIndex(0)
        onClose()
    }
    const onKey = (e: ReactKeyboardEvent) => {
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((i) => Math.min(results.length - 1, i + 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((i) => Math.max(0, i - 1))
        } else if (e.key === 'Enter' && results[index]) go(results[index].to)
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-neutral-900/20 px-4 pt-[12vh]" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Go to"
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-neutral-900/[0.08]"
            >
                <label className="flex items-center gap-2.5 border-b border-hairline px-4">
                    <i className="fa-solid fa-magnifying-glass text-[13px] text-neutral-500" aria-hidden="true" />
                    <span className="sr-only">Go to</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setIndex(0)
                        }}
                        onKeyDown={onKey}
                        placeholder="Go to…"
                        className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-neutral-500"
                    />
                    <kbd className="rounded border border-hairline px-1.5 text-[11px] text-neutral-500">Esc</kbd>
                </label>
                <ul role="listbox" className="max-h-80 overflow-y-auto p-1.5">
                    {results.length === 0 && <li className="px-3 py-3 text-sm text-neutral-500">Nothing matches.</li>}
                    {results.map((item, i) => (
                        <li key={item.to} role="option" aria-selected={i === index}>
                            <button
                                type="button"
                                onMouseEnter={() => setIndex(i)}
                                onClick={() => go(item.to)}
                                className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium ${
                                    i === index ? 'bg-surface-muted text-neutral-900' : 'text-neutral-700'
                                }`}
                            >
                                <span className={`h-2 w-2 rounded-[2px] ${item.dot}`} aria-hidden="true" />
                                {item.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    )
}

function useCommandKey(onOpen: () => void) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault()
                onOpen()
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onOpen])
}

// ─── Wide: the sidebar ───────────────────────────────────────────────────────

function Sidebar({ collapsed, onToggle, onSearch }: { collapsed: boolean; onToggle: () => void; onSearch: () => void }) {
    const { pathname } = useLocation()
    const { user } = useAuth()
    const profileActive = isActive(pathname, '/profile')

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-hairline bg-canvas transition-[width] duration-200 ease-out ${
                collapsed ? 'w-18' : 'w-66'
            }`}
        >
            <div className={`flex h-18 shrink-0 items-center ${collapsed ? 'justify-center' : 'gap-3 px-5.5'}`}>
                <Link to="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name}, today`}>
                    <Mark />
                    {!collapsed && <span className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">{BRAND.name}</span>}
                </Link>
            </div>

            <div className={collapsed ? 'flex justify-center pb-3' : 'px-4 pb-5'}>
                <button
                    type="button"
                    onClick={onSearch}
                    aria-label="Go to (⌘K)"
                    title={collapsed ? 'Go to (⌘K)' : undefined}
                    className={`flex items-center gap-2 rounded-lg border border-hairline text-[14px] text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-900 ${
                        collapsed ? 'h-11 w-11 justify-center' : 'h-10 w-full px-3'
                    }`}
                >
                    <i className="fa-solid fa-magnifying-glass text-[12px]" aria-hidden="true" />
                    {!collapsed && (
                        <>
                            <span className="flex-1 text-left">Go to…</span>
                            <kbd className="text-[11px] font-normal">⌘K</kbd>
                        </>
                    )}
                </button>
            </div>

            <nav aria-label="Main" className={`flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto ${collapsed ? 'items-center px-2' : 'px-4'}`}>
                {GROUPS.map((group) => (
                    <div key={group.label} className="flex flex-col gap-0.5">
                        {!collapsed && <p className="px-2.5 pb-1.5 text-[13px] text-neutral-500">{group.label}</p>}
                        {group.items.map((item) => {
                            const active = isActive(pathname, item.to)
                            return (
                                <Link
                                    key={item.to}
                                    to={item.to}
                                    aria-current={active ? 'page' : undefined}
                                    title={collapsed ? item.label : undefined}
                                    aria-label={collapsed ? item.label : undefined}
                                    className={`flex items-center rounded-lg text-[15px] font-medium transition-colors ${
                                        collapsed ? 'h-11 w-11 justify-center' : 'h-10 gap-3 px-2.5'
                                    } ${active ? 'bg-surface-muted text-neutral-900' : 'text-neutral-700 hover:bg-surface-muted/70 hover:text-neutral-900'}`}
                                >
                                    <span className={`shrink-0 rounded-[2px] ${collapsed ? 'h-3 w-3' : 'h-2.5 w-2.5'} ${item.dot}`} aria-hidden="true" />
                                    {!collapsed && <span className="truncate">{item.label}</span>}
                                </Link>
                            )
                        })}
                    </div>
                ))}
            </nav>

            <div className={`flex shrink-0 flex-col gap-1 border-t border-hairline py-3.5 ${collapsed ? 'items-center px-2' : 'px-4'}`}>
                {!collapsed && (
                    <div className="px-2.5">
                        <QuickLog />
                    </div>
                )}
                <Link
                    to="/profile"
                    aria-current={profileActive ? 'page' : undefined}
                    title={collapsed ? (user?.name ?? 'Your profile') : undefined}
                    className={`flex items-center rounded-lg text-[14px] font-medium text-neutral-800 transition-colors hover:bg-surface-muted ${
                        collapsed ? 'h-11 w-11 justify-center' : 'h-11 gap-3 px-2.5'
                    } ${profileActive ? 'bg-surface-muted' : ''}`}
                >
                    <Avatar name={user?.name} size="sm" className="!h-7 !w-7 bg-neutral-900 !text-[11px] text-white" />
                    {!collapsed && <span className="truncate">{user?.name ?? 'Your profile'}</span>}
                </Link>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={`flex items-center rounded-lg text-[13px] text-neutral-500 transition-colors hover:bg-surface-muted hover:text-neutral-900 ${
                        collapsed ? 'h-10 w-11 justify-center' : 'h-9 gap-3 px-2.5'
                    }`}
                >
                    <i className={`fa-solid fa-angles-left text-[12px] transition-transform ${collapsed ? 'rotate-180' : ''}`} aria-hidden="true" />
                    {!collapsed && 'Collapse'}
                </button>
            </div>
        </aside>
    )
}

// ─── Phones: top bar and tab bar ─────────────────────────────────────────────

function PhoneNav({ onSearch }: { onSearch: () => void }) {
    const { pathname } = useLocation()
    const [sheetOn, setSheetOn] = useState<string | null>(null)
    const sheetOpen = sheetOn === pathname
    const moreActive = !TABS.some((t) => isActive(pathname, t.to))

    return (
        <>
            <header className="sticky top-0 z-40 bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
                <div className="flex h-14 items-center gap-3 px-5">
                    <Link to="/" aria-label={`${BRAND.name}, today`}>
                        <Mark />
                    </Link>
                    <div className="ml-auto flex items-center gap-1">
                        <QuickLog />
                        <button
                            type="button"
                            onClick={onSearch}
                            aria-label="Go to"
                            className="grid h-11 w-11 place-items-center rounded-lg text-neutral-700"
                        >
                            <i className="fa-solid fa-magnifying-glass text-[15px]" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </header>

            <nav
                aria-label="Main"
                className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-hairline bg-canvas/95 px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-1 backdrop-blur-md"
            >
                {TABS.map((t) => {
                    const active = isActive(pathname, t.to)
                    return (
                        <Link
                            key={t.to}
                            to={t.to}
                            aria-current={active ? 'page' : undefined}
                            className={`flex h-12 min-w-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                                active ? 'text-neutral-900' : 'text-neutral-500'
                            }`}
                        >
                            <i className={`fa-solid ${t.icon} text-[17px]`} aria-hidden="true" />
                            {t.label}
                        </Link>
                    )
                })}
                <button
                    type="button"
                    onClick={() => setSheetOn(pathname)}
                    aria-expanded={sheetOpen}
                    className={`flex h-12 min-w-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                        moreActive ? 'text-neutral-900' : 'text-neutral-500'
                    }`}
                >
                    <i className="fa-solid fa-ellipsis text-[17px]" aria-hidden="true" />
                    More
                </button>
            </nav>

            <BottomSheet open={sheetOpen} onClose={() => setSheetOn(null)} title="Everything">
                <div className="flex flex-col gap-5 pb-4">
                    {GROUPS.map((group) => (
                        <section key={group.label}>
                            <h3 className="pb-1 text-[12px] text-neutral-500">{group.label}</h3>
                            <ul>
                                {group.items.map((item) => {
                                    const active = isActive(pathname, item.to)
                                    return (
                                        <li key={item.to} className="border-t border-hairline">
                                            <Link
                                                to={item.to}
                                                aria-current={active ? 'page' : undefined}
                                                className="flex h-12 items-center gap-3 text-base font-medium text-neutral-900"
                                            >
                                                <span className={`h-2.5 w-2.5 rounded-[3px] ${item.dot}`} aria-hidden="true" />
                                                <span className="flex-1">{item.label}</span>
                                                {active && <span className="text-[12px] font-semibold text-coral-600">Here</span>}
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            </BottomSheet>
        </>
    )
}

/** Sidebar width on wide screens, for the page to sit beside it. */
export const SIDEBAR_PAD = { open: 'lg:pl-66', collapsed: 'lg:pl-18' }

export default function AppNav({
    wide,
    collapsed,
    onToggle,
}: {
    wide: boolean
    collapsed: boolean
    onToggle: () => void
}) {
    const [paletteOpen, setPaletteOpen] = useState(false)
    useCommandKey(() => setPaletteOpen(true))
    return (
        <>
            {wide ? (
                <Sidebar collapsed={collapsed} onToggle={onToggle} onSearch={() => setPaletteOpen(true)} />
            ) : (
                <PhoneNav onSearch={() => setPaletteOpen(true)} />
            )}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </>
    )
}
