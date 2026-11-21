import { useEffect, useState } from 'react'

/**
 * An element's current width, kept up to date as it resizes (0 until measured).
 * Charts draw at this width so a phone gets a full-height chart with legible
 * labels, rather than a 720-wide drawing shrunk to fit.
 */
export function useBoxWidth(el: HTMLElement | null): number {
    const [width, setWidth] = useState(0)
    useEffect(() => {
        if (!el) return
        setWidth(el.clientWidth)
        const ro = new ResizeObserver(() => setWidth(el.clientWidth))
        ro.observe(el)
        return () => ro.disconnect()
    }, [el])
    return width
}
