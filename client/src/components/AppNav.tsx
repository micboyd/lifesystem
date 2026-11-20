import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { BRAND, NAV_GROUPS, NAV_ITEMS, type NavItem } from '../lib/workspace'

/**
 * The app's navigation, AdminLife 3. One top bar everywhere: the wordmark, the
 * main modules as plain links (wide screens) and the menu button. The menu opens as a full page of big ruled rows, grouped by area.
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

/** The top bar's links on wide screens. Everything else lives in the menu. */
const TOP_LINKS: { to: string; label: string }[] = [
    { to: '/', label: 'Today' },
    { to: '/calendar', label: 'Calendar' },
    { to: '/fitness', label: 'Fitness' },
    { to: '/nutrition', label: 'Nutrition' },
    { to: '/walking', label: 'Walking' },
    { to: '/finances', label: 'Money' },
]

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
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-neutral-900/20 px-4 pt-[12vh]" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Go to"
                onMouseDown={(e) => e.stopPropagation()}
                className="w-full max-w-md overflow-hidden border border-neutral-900 bg-white"
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
                    <kbd className="border border-hairline px-1.5 text-[11px] text-neutral-500">Esc</kbd>
                </label>
                <ul role="listbox" className="max-h-80 overflow-y-auto">
                    {results.length === 0 && <li className="px-3 py-3 text-sm text-neutral-500">Nothing matches.</li>}
                    {results.map((item, i) => (
                        <li key={item.to} role="option" aria-selected={i === index}>
                            <button
                                type="button"
                                onMouseEnter={() => setIndex(i)}
                                onClick={() => go(item.to)}
                                className={`flex h-11 w-full items-center gap-3 border-t border-hairline px-4 text-left text-[15px] ${
                                    i === index ? 'bg-surface-muted text-neutral-900' : 'text-neutral-700'
                                }`}
                            >
                                <span className={`h-2.5 w-2.5 ${item.dot}`} aria-hidden="true" />
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

// ─── The top bar ─────────────────────────────────────────────────────────────

const ICON_BTN = 'grid h-11 w-11 place-items-center text-neutral-900'

function TopBar({ wide, onMenu }: { wide: boolean; onMenu: () => void }) {
    const { pathname } = useLocation()
    return (
        <header className="sticky top-0 z-40 border-b border-hairline bg-white pt-[env(safe-area-inset-top)]">
            <div className={`flex items-center ${wide ? 'h-18 gap-10 px-10' : 'h-14 gap-1 pl-5 pr-2'}`}>
                <Link
                    to="/"
                    className={`font-medium tracking-[-0.03em] text-neutral-900 ${wide ? 'text-[22px]' : 'text-[19px]'}`}
                >
                    {BRAND.name}
                </Link>
                {wide && (
                    <nav aria-label="Main" className="ml-auto flex items-center gap-7 text-[15px]">
                        {TOP_LINKS.map((l) => {
                            const active = isActive(pathname, l.to)
                            return (
                                <Link
                                    key={l.to}
                                    to={l.to}
                                    aria-current={active ? 'page' : undefined}
                                    className={
                                        active
                                            ? 'text-neutral-900 underline decoration-1 underline-offset-8'
                                            : 'text-neutral-600 hover:text-neutral-900'
                                    }
                                >
                                    {l.label}
                                </Link>
                            )
                        })}
                    </nav>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={onMenu} aria-label="Open menu" className={ICON_BTN}>
                        <i className="fa-solid fa-bars text-[19px]" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </header>
    )
}

// ─── The menu: a full page of ruled rows ─────────────────────────────────────

function Menu({ wide, onClose, onSearch }: { wide: boolean; onClose: () => void; onSearch: () => void }) {
    const { pathname } = useLocation()
    const { user } = useAuth()

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            window.removeEventListener('keydown', onKey)
            document.body.style.overflow = prev
        }
    }, [onClose])

    return (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white">
            <div className={`flex shrink-0 items-center border-b border-hairline pt-[env(safe-area-inset-top)] ${wide ? 'h-18 gap-6 px-10' : 'h-14 gap-1 pl-5 pr-2'}`}>
                <Link to="/" onClick={onClose} className={`font-medium tracking-[-0.03em] text-neutral-900 ${wide ? 'text-[22px]' : 'text-[19px]'}`}>
                    {BRAND.name}
                </Link>
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={onClose} aria-label="Close menu" className={ICON_BTN}>
                        <i className="fa-solid fa-xmark text-[20px]" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div className={`flex flex-1 flex-col ${wide ? 'gap-12 px-10 pb-10 pt-12' : 'px-5'}`}>
                {wide && (
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                        <span className="label-caps text-neutral-600">Go to or log</span>
                        <button
                            type="button"
                            onClick={() => {
                                onClose()
                                onSearch()
                            }}
                            className="flex h-14 min-w-0 flex-[1_1_420px] items-center border border-neutral-400 px-[18px] text-left text-[18px] text-neutral-500 hover:border-neutral-900"
                        >
                            Type a module, a meal, a workout or a spend
                        </button>
                        <span className="text-[13px] text-neutral-600">⌘K from anywhere</span>
                    </div>
                )}

                <nav aria-label="All modules" className={wide ? 'grid grid-cols-4 gap-10' : 'flex flex-col'}>
                    {GROUPS.map((group) => (
                        <section key={group.label}>
                            <h2 className={`label-caps text-neutral-600 ${wide ? 'mb-2.5' : 'mb-1.5 mt-5 text-[10px]'}`}>{group.label}</h2>
                            <ul className="border-t border-neutral-900">
                                {group.items.map((item) => {
                                    const active = isActive(pathname, item.to)
                                    return (
                                        <li key={item.to} className="border-b border-hairline">
                                            <Link
                                                to={item.to}
                                                onClick={onClose}
                                                aria-current={active ? 'page' : undefined}
                                                className={`grid items-center ${wide ? 'min-h-16 grid-cols-[12px_minmax(0,1fr)_16px] gap-3.5' : 'h-[46px] grid-cols-[10px_minmax(0,1fr)_14px] gap-3'}`}
                                            >
                                                <span className={`${wide ? 'h-3 w-3' : 'h-2.5 w-2.5'} ${item.dot}`} aria-hidden="true" />
                                                <span className={`${wide ? 'text-[26px] leading-[1.1] tracking-[-0.025em]' : 'text-[18px] tracking-[-0.015em]'} ${active ? 'underline decoration-1 underline-offset-4' : ''}`}>
                                                    {item.label}
                                                </span>
                                                <i className={`fa-solid fa-arrow-right ${wide ? 'text-[13px]' : 'text-[11px]'}`} aria-hidden="true" />
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    ))}
                </nav>

                {wide ? (
                    <div className="mt-auto flex items-center justify-end gap-3 border-t border-hairline pt-6">
                        <span className="grid h-10 w-10 place-items-center bg-neutral-900 font-medium text-white">
                            {(user?.name ?? 'You').slice(0, 1).toUpperCase()}
                        </span>
                        <span>
                            <span className="block font-medium">{user?.name ?? 'You'}</span>
                            <Link to="/profile" onClick={onClose} className="text-[13px] text-neutral-600 underline underline-offset-4">
                                Profile and settings
                            </Link>
                        </span>
                    </div>
                ) : (
                    <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-hairline bg-white pb-[max(env(safe-area-inset-bottom),28px)] pt-3">
                        <Link to="/profile" onClick={onClose} className="flex h-11 items-center justify-between text-[15px]">
                            {user?.name ?? 'Profile'}
                            <span className="text-[13px] text-neutral-600">Profile and settings</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => {
                                onClose()
                                onSearch()
                            }}
                            className="label-caps h-12 bg-neutral-900 text-white"
                        >
                            Search or log
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default function AppNav({ wide }: { wide: boolean }) {
    const { pathname } = useLocation()
    const [paletteOpen, setPaletteOpen] = useState(false)
    const [menuOn, setMenuOn] = useState<string | null>(null)
    const menuOpen = menuOn === pathname
    useCommandKey(() => setPaletteOpen(true))
    return (
        <>
            <TopBar wide={wide} onMenu={() => setMenuOn(pathname)} />
            {menuOpen && <Menu wide={wide} onClose={() => setMenuOn(null)} onSearch={() => setPaletteOpen(true)} />}
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        </>
    )
}
