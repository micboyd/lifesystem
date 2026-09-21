import { useEffect, useState } from 'react'
import Spinner from '../Spinner'
import Alert from '../Alert'
import ConfirmModal from '../ConfirmModal'
import PhaseLibrary from './PhaseLibrary'
import type { NutritionPhase, NutritionPhaseInput } from '../../types'
import * as phaseService from '../../services/nutritionPhases'

/** The message an API error carries, or a fallback. */
function errorMessage(err: unknown, fallback: string): string {
    const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    return message ?? fallback
}

/**
 * Phases tab: the one place nutrition phases are created, edited and deleted.
 *
 * Life Plan draws them on its timeline and links them into seasons, but only
 * reads them — the same arrangement as training plans in Fitness.
 */
export default function PhasesTab({
    openPhaseId,
    onOpened,
}: {
    /** A phase to open for editing on arrival — set when coming from the Life Plan timeline. */
    openPhaseId?: string | null
    onOpened?: () => void
}) {
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<NutritionPhase | null>(null)

    useEffect(() => {
        phaseService
            .listNutritionPhases()
            .then(setPhases)
            .catch((err) => setLoadError(errorMessage(err, 'Could not load your phases.')))
            .finally(() => setLoading(false))
    }, [])

    async function save(input: NutritionPhaseInput, id?: string): Promise<boolean> {
        setSaving(true)
        setError(null)
        try {
            const saved = id
                ? await phaseService.updateNutritionPhase(id, input)
                : await phaseService.createNutritionPhase(input)
            setPhases((prev) =>
                id
                    ? prev.map((p) => (p._id === saved._id ? saved : p))
                    : [...prev, saved].sort((a, b) => a.startDate.localeCompare(b.startDate))
            )
            return true
        } catch (err) {
            setError(errorMessage(err, 'Could not save the phase.'))
            return false
        } finally {
            setSaving(false)
        }
    }

    async function confirmDelete() {
        if (!deleting) return
        try {
            await phaseService.deleteNutritionPhase(deleting._id)
            setPhases((prev) => prev.filter((p) => p._id !== deleting._id))
        } catch (err) {
            setError(errorMessage(err, 'Could not delete the phase.'))
        } finally {
            setDeleting(null)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Spinner size="lg" />
            </div>
        )
    }
    if (loadError) return <Alert variant="danger">{loadError}</Alert>

    return (
        <>
            <PhaseLibrary
                phases={phases}
                saving={saving}
                error={error}
                onSave={save}
                onDelete={setDeleting}
                // Only handed over once phases have loaded, so the request can't be
                // consumed against an empty list and silently dropped.
                openPhaseId={openPhaseId}
                onOpened={onOpened}
            />
            <ConfirmModal
                open={!!deleting}
                title="Delete phase"
                message={
                    <>
                        Delete <strong>{deleting?.name}</strong>? Any Life Plan season linking it
                        will simply stop showing it.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={confirmDelete}
                onClose={() => setDeleting(null)}
            />
        </>
    )
}
