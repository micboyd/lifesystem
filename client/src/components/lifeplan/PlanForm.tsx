import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import Checkbox from '../Checkbox'
import Alert from '../Alert'
import DatePicker, { type DatePickerValue } from '../DatePicker'
import {
    LIFE_PILLARS,
    LIFE_PILLAR_LABELS,
    type LifePillar,
    type LifePlan,
    type LifePlanInput,
} from '../../types'
import { monthKey } from '../../lib/calendar'

/**
 * Creating or editing a plan horizon.
 *
 * Pillars are chosen here rather than fixed, because an empty lane is worse than
 * no lane — a plan that isn't tracking study shouldn't carry a study row all year.
 */
function currentYearBounds(): { start: string; end: string } {
    const year = new Date().getFullYear()
    return { start: monthKey(year, 0), end: monthKey(year, 11) }
}

export default function PlanForm({
    open,
    plan,
    saving,
    error,
    onSave,
    onClose,
}: {
    open: boolean
    /** The plan being edited, or null to create one. */
    plan: LifePlan | null
    saving: boolean
    error: string | null
    onSave: (input: LifePlanInput) => void
    onClose: () => void
}) {
    const [name, setName] = useState('')
    const [start, setStart] = useState('')
    const [end, setEnd] = useState('')
    const [vision, setVision] = useState('')
    const [pillars, setPillars] = useState<LifePillar[]>([...LIFE_PILLARS])

    useEffect(() => {
        if (!open) return
        if (plan) {
            setName(plan.name)
            setStart(plan.start)
            setEnd(plan.end)
            setVision(plan.vision ?? '')
            setPillars(plan.pillars.length > 0 ? plan.pillars : [...LIFE_PILLARS])
        } else {
            const bounds = currentYearBounds()
            setName(String(new Date().getFullYear()))
            setStart(bounds.start)
            setEnd(bounds.end)
            setVision('')
            setPillars([...LIFE_PILLARS])
        }
    }, [open, plan])

    function togglePillar(pillar: LifePillar) {
        setPillars((current) =>
            current.includes(pillar)
                ? current.filter((p) => p !== pillar)
                : // Keep the canonical order rather than the click order, so lanes
                  // don't reshuffle depending on how the boxes were ticked.
                  LIFE_PILLARS.filter((p) => p === pillar || current.includes(p))
        )
    }

    const rangeInvalid = !!start && !!end && start > end

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={plan ? 'Edit plan' : 'New life plan'}
            footer={
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onClose} fullWidth>
                        Cancel
                    </Button>
                    <Button
                        onClick={() =>
                            onSave({
                                name: name.trim(),
                                start,
                                end,
                                vision: vision.trim() ? vision.trim() : undefined,
                                pillars,
                            })
                        }
                        disabled={saving || !name.trim() || !start || !end || rangeInvalid || pillars.length === 0}
                        fullWidth
                    >
                        {saving ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-5">
                {error && <Alert variant="danger">{error}</Alert>}

                <Input
                    label="Name"
                    placeholder="2027"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            From
                        </p>
                        <DatePicker
                            precision="month"
                            value={start}
                            onChange={(v: DatePickerValue) =>
                                typeof v === 'string' ? setStart(v) : undefined
                            }
                        />
                    </div>
                    <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            To
                        </p>
                        <DatePicker
                            precision="month"
                            value={end}
                            onChange={(v: DatePickerValue) =>
                                typeof v === 'string' ? setEnd(v) : undefined
                            }
                        />
                    </div>
                </div>
                {rangeInvalid && (
                    <p className="text-xs font-semibold text-red-500">
                        The end month must be on or after the start.
                    </p>
                )}

                <Textarea
                    label="Vision"
                    rows={3}
                    placeholder="The multi-year theme this plan serves."
                    value={vision}
                    onChange={(e) => setVision(e.target.value)}
                />

                <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Lanes
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                        {LIFE_PILLARS.map((pillar) => (
                            <Checkbox
                                key={pillar}
                                checked={pillars.includes(pillar)}
                                onChange={() => togglePillar(pillar)}
                                label={LIFE_PILLAR_LABELS[pillar]}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    )
}
