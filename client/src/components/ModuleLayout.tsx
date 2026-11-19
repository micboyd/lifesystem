import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from './planner/WeekPlannerUI'

/**
 * A module's page: the content across the full width, and a right-hand column
 * that runs the full height of the screen beside it (sticky, scrolling on its
 * own). The column holds either `aside`, given here, or whatever a component
 * deeper in the page sends into it with `ModuleAside` — the planners send their
 * libraries. With nothing in it, the column isn't drawn.
 *
 * Below 1280px there's no room beside the content: `aside` moves underneath,
 * and anything sent with `ModuleAside` isn't shown (its page has another way in).
 */

const WIDE = '(min-width: 1280px)'

const SlotContext = createContext<HTMLElement | null>(null)

/** Sends its children into the module's right-hand column, when there is one. */
export function ModuleAside({ children }: { children: ReactNode }) {
    const slot = useContext(SlotContext)
    return slot ? createPortal(children, slot) : null
}

/** Whether the module's right-hand column is on screen, for components that only make sense in it. */
export function useModuleAside(): boolean {
    return useContext(SlotContext) !== null
}

export default function ModuleLayout({
    aside,
    asideLabel = 'Details',
    children,
}: {
    /** The column's own content, when the page has it to hand (Today's context). */
    aside?: ReactNode
    asideLabel?: string
    children: ReactNode
}) {
    const wide = useMediaQuery(WIDE)
    const [slot, setSlot] = useState<HTMLElement | null>(null)

    return (
        <SlotContext.Provider value={wide ? slot : null}>
            <div className="flex min-h-screen">
                <div className="min-w-0 flex-1">
                    {children}
                    {!wide && aside && (
                        <aside aria-label={asideLabel} className="border-t border-hairline px-5 py-8 sm:px-8">
                            {aside}
                        </aside>
                    )}
                </div>
                {wide && (
                    <aside
                        ref={setSlot}
                        aria-label={asideLabel}
                        className="sticky top-0 flex h-screen w-[460px] shrink-0 flex-col gap-8 overflow-y-auto border-l border-hairline px-7 py-8 empty:hidden 2xl:w-[520px]"
                    >
                        {aside}
                    </aside>
                )}
            </div>
        </SlotContext.Provider>
    )
}
