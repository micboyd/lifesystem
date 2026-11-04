import { useCallback, useEffect, useState } from 'react'
import Button from '../Button'
import RouteDrawer from './RouteDrawer'
import type { FitnessPlanEntry } from '../../types'
import { listRoutes, type RunRoute } from '../../services/routes'
import { formatKm } from '../../lib/routeTrack'

/**
 * The route row on a planned conditioning item: its chosen route at a glance,
 * or the button to generate one. Opens the route drawer either way. The parent
 * draws the frame (a divided list), so it sits with the Garmin row.
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
            <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-neutral-900">Outdoor route</p>
                    <p className="mt-0.5 truncate text-[13px] tabular-nums text-neutral-500">
                        {chosen
                            ? `${formatKm(chosen.distanceM)} ${chosen.kind === 'loop' ? 'loop' : 'out and back'} · ↑${chosen.ascentM} m`
                            : 'None chosen yet'}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    icon={chosen ? 'fa-solid fa-map' : 'fa-solid fa-route'}
                    onClick={() => setOpen(true)}
                    className="shrink-0"
                >
                    {chosen ? 'View' : 'Generate'}
                </Button>
            </div>
            <RouteDrawer entry={open ? entry : null} onClose={() => setOpen(false)} onChanged={load} />
        </>
    )
}
