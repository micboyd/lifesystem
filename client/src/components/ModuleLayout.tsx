import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from './planner/WeekPlannerUI'
import { SectionRail, SectionTabs, type Section } from './SectionNav'

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

/** From here up the sections sit down the left; below, they're a row of tabs. */
const RAIL = '(min-width: 1100px)'

export default function ModuleLayout({
    aside,
    asideLabel = 'Details',
    sections,
    sectionsLabel = 'Sections',
    foldSections = false,
    children,
}: {
    /** The column's own content, when the page has it to hand (Today's context). */
    aside?: ReactNode
    asideLabel?: string
    /** The module's sections, shown down the left (or as tabs on narrow screens). */
    sections?: Section[]
    sectionsLabel?: string
    /** Fold the side menu to its icon strip, for wide pages like the planners. */
    foldSections?: boolean
    children: ReactNode
}) {
    const wide = useMediaQuery(WIDE)
    const rail = useMediaQuery(RAIL)
    const hasSections = !!sections && sections.length > 1
    const [slot, setSlot] = useState<HTMLElement | null>(null)

    return (
        <SlotContext.Provider value={wide ? slot : null}>
            {hasSections && !rail && <SectionTabs label={sectionsLabel} sections={sections} />}
            <div className="flex min-h-[calc(100vh-72px)]">
                {hasSections && rail && <SectionRail label={sectionsLabel} sections={sections} folded={foldSections} />}
                <div className="min-w-0 flex-1">
                    {children}
                    {!wide && aside && (
                        <aside aria-label={asideLabel} className="bg-surface-muted px-5 py-10 sm:px-8">
                            {aside}
                        </aside>
                    )}
                </div>
                {wide && (
                    <aside
                        aria-label={asideLabel}
                        className="w-[400px] shrink-0 bg-surface-muted has-[>div:empty]:hidden 2xl:w-[440px]"
                    >
                        <div
                            ref={setSlot}
                            className="sticky top-18 flex max-h-[calc(100vh-72px)] flex-col gap-10 overflow-y-auto px-8 pb-16 pt-10 empty:hidden"
                        >
                            {aside}
                        </div>
                    </aside>
                )}
            </div>
        </SlotContext.Provider>
    )
}
