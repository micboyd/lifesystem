import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Textarea from '../Textarea'
import Alert from '../Alert'
import { OVERLINE } from '../surfaceStyles'
import { formatDateLong } from '../../lib/calendar'
import { parseTimeboxImport } from '../../lib/timebox'
import { importTimeboxes, type TimeboxImportResult } from '../../services/timeboxes'

const SAMPLE = `{
  "blocks": [
    { "title": "Deep work", "start": "09:00", "end": "11:00", "category": "work" },
    { "title": "Gym", "start": "12:00", "end": "13:00", "category": "health" },
    { "title": "Read", "start": "21:00", "end": "21:30", "notes": "Chapter 4" }
  ]
}`

interface Props {
    open: boolean
    date: string
    onClose: () => void
    onImported: () => void
}

/** Paste a day of blocks as JSON. */
export default function TimeboxImportDrawer({ open, date, onClose, onImported }: Props) {
    const [text, setText] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState<TimeboxImportResult | null>(null)

    // Clear the last run each time the drawer opens.
    const [shownOpen, setShownOpen] = useState(false)
    if (open !== shownOpen) {
        setShownOpen(open)
        if (open) {
            setError(null)
            setResult(null)
        }
    }

    const parsed = text.trim() ? parseTimeboxImport(text) : null
    const count = parsed && 'items' in parsed ? parsed.items.length : 0

    async function run() {
        if (!parsed) return
        if ('error' in parsed) return setError(parsed.error)
        setBusy(true)
        setError(null)
        try {
            const r = await importTimeboxes(date, parsed.items)
            setResult(r)
            if (r.added) {
                setText('')
                onImported()
            }
        } catch {
            setError('Couldn’t import those blocks. Please try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="Import blocks"
            size="xl"
            footer={
                <div className="ml-auto flex gap-2">
                    <Button variant="ghost" onClick={onClose}>
                        {result?.added ? 'Done' : 'Cancel'}
                    </Button>
                    <Button onClick={run} disabled={busy || count === 0}>
                        {busy ? 'Importing…' : count ? `Import ${count} block${count === 1 ? '' : 's'}` : 'Import'}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-4">
                <p className="text-sm text-neutral-600">
                    Blocks land on <span className="font-medium text-neutral-900">{formatDateLong(date)}</span> unless one
                    gives its own date. Each needs a title, start and end.
                </p>
                <Textarea
                    label="JSON"
                    rows={12}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={SAMPLE}
                    className="font-mono text-[13px]"
                    error={error ?? (parsed && 'error' in parsed ? parsed.error : undefined)}
                />
                {result && (
                    <Alert variant={result.skipped ? 'warning' : 'success'}>
                        Added {result.added} block{result.added === 1 ? '' : 's'}
                        {result.skipped ? `, skipped ${result.skipped}: ${result.errors.join('; ')}` : '.'}
                    </Alert>
                )}
                <div>
                    <p className={`${OVERLINE} mb-2`}>Example</p>
                    <pre className="overflow-x-auto rounded-xl bg-neutral-50 p-3 font-mono text-xs text-neutral-700 ring-1 ring-neutral-900/[0.06]">
                        {SAMPLE}
                    </pre>
                    <p className="mt-2 text-xs text-neutral-500">
                        Categories: work, personal, health, learning, social. Comments are fine.
                    </p>
                </div>
            </div>
        </Drawer>
    )
}
