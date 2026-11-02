import { useCallback, useEffect, useState } from 'react'
import Button from '../Button'
import RouteDrawer from './RouteDrawer'
import type { FitnessPlanEntry } from '../../types'
import { listRoutes, type RunRoute } from '../../services/routes'
import { formatKm } from '../../lib/routeTrack'

/**
 * The route row on a planned conditioning item: its chosen route at a glance,
 * or the button to generate one. Opens the route drawer either way.
 */
export default function RouteCard({ entry }: { entry: FitnessPlanEntry }) {
    const [open, setOpen] = useState(false)
    const [chosen, setChosen] = useState<RunRoute | null>(null)
    const sessionId = entry.session?._id

    const load = useCallback(() => {
        if (!sessionId) return
        listRoutes(sessionId)
            .then((rs) => setChosen(rs.find((r) => r.chosenFor.includes(entry._id)) ?? null))
            .catch(() => setChosen(null))
    }, [sessionId, entry._id])

    useEffect(load, [load])

    if (!sessionId) return null

    return (
        <>
            <section className="flex items-center gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-neutral-700 ring-1 ring-inset ring-neutral-900/[0.06]">
                    <i className="fa-solid fa-route text-sm" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">Outdoor route</p>
                    <p className="truncate text-sm tabular-nums text-neutral-500">
                        {chosen
                            ? `${formatKm(chosen.distanceM)} ${chosen.kind === 'loop' ? 'loop' : 'out and back'} · ↑${chosen.ascentM} m`
                            : 'No route chosen yet'}
                    </p>
                </div>
                <Button variant="secondary" icon={chosen ? 'fa-solid fa-map' : 'fa-solid fa-route'} onClick={() => setOpen(true)}>
                    {chosen ? 'View route' : 'Generate route'}
                </Button>
            </section>
            <RouteDrawer entry={open ? entry : null} onClose={() => setOpen(false)} onChanged={load} />
        </>
    )
}
