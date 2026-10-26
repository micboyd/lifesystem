import { useMemo, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Checkbox from '../Checkbox'
import Badge from '../Badge'
import { useToast } from '../../context/ToastContext'
import { formatDateShort, todayKey } from '../../lib/calendar'
import { byClosest } from '../../lib/phaseOrder'
import { phaseExportDocument, phaseExportFileName } from '../../lib/phaseExport'
import { NUTRITION_PHASE_LABELS, type NutritionPhase } from '../../types'

/**
 * Tick the phases wanted and get them back as one JSON array, in the shape the
 * importer takes. Everything is built from the phases already loaded, so there
 * is nothing to wait for.
 */
export default function PhaseExportDrawer({
    open,
    phases,
    onClose,
}: {
    open: boolean
    phases: NutritionPhase[]
    onClose: () => void
}) {
    const toast = useToast()
    // The phases ticked *off*. Every phase starts ticked — exporting the lot is the
    // usual ask — and closing clears this, so each opening starts from all again.
    const [unticked, setUnticked] = useState<Set<string>>(new Set())
    const [copied, setCopied] = useState(false)

    function close() {
        setUnticked(new Set())
        onClose()
    }

    const sorted = useMemo(() => byClosest(phases, todayKey()), [phases])
    const selected = useMemo(() => phases.filter((p) => !unticked.has(p._id)), [phases, unticked])
    const json = useMemo(
        () => (selected.length ? JSON.stringify(phaseExportDocument(selected), null, 2) : null),
        [selected]
    )
    const allChosen = selected.length === phases.length

    function toggle(id: string, on: boolean) {
        setUnticked((prev) => {
            const next = new Set(prev)
            if (on) next.delete(id)
            else next.add(id)
            return next
        })
    }

    async function copy() {
        if (!json) return
        try {
            await navigator.clipboard.writeText(json)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    function download() {
        if (!json) return
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url
        link.download = phaseExportFileName(selected, todayKey())
        link.click()
        URL.revokeObjectURL(url)
    }

    return (
        <Drawer
            size="xl"
            open={open}
            onClose={close}
            title="Export phases"
            footer={
                <>
                    <Button variant="ghost" onClick={close}>
                        Close
                    </Button>
                    <Button
                        variant="secondary"
                        icon={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'}
                        onClick={copy}
                        disabled={!json}
                    >
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button icon="fa-solid fa-download" onClick={download} disabled={!json}>
                        Download
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    The ticked phases as one data set, in the same shape the importer takes. Each
                    phase&apos;s target changes come along under <code>adjustments</code> for the
                    record; the importer ignores them, so pasting this back starts each phase from
                    its opening targets.
                </p>

                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-neutral-900">
                            {selected.length} of {phases.length} chosen
                        </p>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                setUnticked(allChosen ? new Set(phases.map((p) => p._id)) : new Set())
                            }
                        >
                            {allChosen ? 'Clear all' : 'Select all'}
                        </Button>
                    </div>
                    <ul className="flex flex-col divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                        {sorted.map((phase) => (
                            <li key={phase._id} className="flex items-center gap-3 px-4 py-3">
                                <Checkbox
                                    checked={!unticked.has(phase._id)}
                                    onChange={(on) => toggle(phase._id, on)}
                                />
                                <button
                                    type="button"
                                    onClick={() => toggle(phase._id, !!unticked.has(phase._id))}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <p className="truncate text-sm font-medium text-neutral-900">
                                        {phase.name}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        {formatDateShort(phase.startDate)} →{' '}
                                        {formatDateShort(phase.endDate)}
                                    </p>
                                </button>
                                <Badge>{NUTRITION_PHASE_LABELS[phase.kind]}</Badge>
                            </li>
                        ))}
                    </ul>
                </div>

                {json ? (
                    <pre className="max-h-[45vh] overflow-auto rounded-xl bg-neutral-900 p-4 text-[11px] leading-relaxed text-neutral-100">
                        <code>{json}</code>
                    </pre>
                ) : (
                    <p className="rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-500">
                        Tick at least one phase to export.
                    </p>
                )}
            </div>
        </Drawer>
    )
}
