import { useEffect, useState } from 'react'
import Spinner from '../Spinner'
import Alert from '../Alert'
import ConfirmModal from '../ConfirmModal'
import PhaseLibrary from './PhaseLibrary'
import JsonImportPanel from '../JsonImportPanel'
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
    const [importing, setImporting] = useState(false)

    function reload() {
        return phaseService
            .listNutritionPhases()
            .then(setPhases)
            .catch((err) => setLoadError(errorMessage(err, 'Could not load your phases.')))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        void reload()
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

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import phases"
                description="Paste one or many phases — dates, direction and daily targets, plus a goal if you want the adaptive review to steer towards it."
                template={PHASE_TEMPLATE}
                notes={<PhaseImportNotes />}
                itemNoun="phase"
                onBack={() => setImporting(false)}
                doImport={phaseService.importNutritionPhases}
                resource="nutrition-phases"
                existingItems={phases}
                onLibraryChanged={() => void reload()}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
            />
        )
    }

    return (
        <>
            <PhaseLibrary
                phases={phases}
                saving={saving}
                error={error}
                onSave={save}
                onDelete={setDeleting}
                onImport={() => setImporting(true)}
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

// ─── Import ─────────────────────────────────────────────────────────────────────

/** The phase import format, annotated. Comments are ignored on import. */
const PHASE_TEMPLATE = `[
  // One object per phase. "name", "startDate" and "endDate" are required.
  {
    "name": "Winter cut",
    "startDate": "2026-11-02",                      // YYYY-MM-DD, inclusive
    "endDate": "2027-01-31",
    "kind": "cut",                                  // cut | maintain | gain (default maintain)
    "targets": { "calories": 2100, "protein": 180, "carbs": 200, "fat": 65 },
    "weeklyRate": -0.5,                             // kg/week, negative for a cut
    "goalMode": "weight-loss",                      // weight-loss | recomposition | maintenance | weight-gain
    "notes": "Diet break over Christmas week",     // optional

    // Optional: what the phase is aiming at. Turns on progress + the adaptive review.
    "goal": {
      "startWeightKg": 86,
      "startBodyFatPct": 20,
      "targetDate": "2027-01-31",
      "targetWeightKg": 80,
      "targetBodyFatPct": 15,
      "targetWeeklyRateKg": -0.5,
      "acceptableWeeklyRateKg": { "min": -0.7, "max": -0.3 },
      "proteinFloorG": 170,
      "adaptive": true
    },

    // Optional: which macros may move when calories change.
    // fixed | minimum | remainder | adjustable
    "macroPolicy": { "protein": "minimum", "fat": "fixed", "carbs": "remainder" },

    // Optional: calorie cycling by training load. Leave out for a flat target.
    "strategy": { "type": "activity", "hardKcal": 200, "restKcal": 150 }
  },
  {
    "name": "Spring maintenance",
    "startDate": "2027-02-01",
    "endDate": "2027-03-14",
    "kind": "maintain",
    "targets": { "calories": 2600, "protein": 170 }
  }
]
`

function PhaseImportNotes() {
    const f = (s: string) => <span className="font-semibold text-neutral-700">{s}</span>
    return (
        <>
            <p>
                {f('name')}, {f('startDate')} and {f('endDate')} are required; dates are YYYY-MM-DD and
                inclusive. {f('kind')} is {f('cut')}, {f('maintain')} or {f('gain')} — maintain if left out.
            </p>
            <p>
                {f('targets')} are the daily {f('calories')}, {f('protein')}, {f('carbs')} and {f('fat')}. Leave
                any out for no target on that one.
            </p>
            <p>
                {f('weeklyRate')} and the rates inside {f('goal')} are kg per week, signed: negative for a cut,
                positive for a gain. In {f('acceptableWeeklyRateKg')}, min is the smaller number.
            </p>
            <p>
                {f('goal')}, {f('macroPolicy')}, {f('strategy')} and {f('notes')} are all optional — a phase
                without them works exactly like one made by hand with the extras left blank.
            </p>
            <p>
                Every phase is checked before any are saved, so one mistake won&apos;t leave a half import. A
                phase with the same name as one you have lets you choose to update it or keep both.
            </p>
        </>
    )
}
