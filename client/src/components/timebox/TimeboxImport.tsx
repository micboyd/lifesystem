import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import { TIMEBOX_CATEGORIES, type TimeboxCategory } from '../../types'
import type { TimeboxInput } from '../../services/timeboxes'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const SAMPLE = `[
  { "title": "Morning routine", "startTime": "07:00", "endTime": "07:45", "category": "personal" },
  { "title": "Deep work", "startTime": "09:00", "endTime": "11:00", "category": "work" },
  { "title": "Lunch", "startTime": "12:30", "endTime": "13:00" },
  { "title": "Gym", "startTime": "18:00", "endTime": "19:00", "category": "health" }
]`

interface Props {
    open: boolean
    /** The day being imported into, for the header. */
    dateLabel: string
    importing: boolean
    onClose: () => void
    /** Called with the parsed, validated blocks to create. */
    onImport: (blocks: TimeboxInput[]) => void
}

/** Parse the pasted text into timebox inputs, or return an error message. */
function parseBlocks(text: string): { blocks: TimeboxInput[] } | { error: string } {
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch {
        return { error: "That's not valid JSON — check for a stray comma or quote." }
    }
    // Accept a bare array or an object with a `blocks` array.
    const arr = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { blocks?: unknown })?.blocks)
          ? (raw as { blocks: unknown[] }).blocks
          : null
    if (!arr) return { error: 'Expected a JSON array of blocks.' }
    if (arr.length === 0) return { error: 'No blocks to import.' }

    const blocks: TimeboxInput[] = []
    for (let i = 0; i < arr.length; i++) {
        const b = arr[i] as Record<string, unknown>
        const where = `Block ${i + 1}`
        if (typeof b !== 'object' || b === null) return { error: `${where}: not an object.` }
        const title = typeof b.title === 'string' ? b.title.trim() : ''
        if (!title) return { error: `${where}: "title" is required.` }
        if (!TIME_RE.test(b.startTime as string) || !TIME_RE.test(b.endTime as string))
            return { error: `${where}: "startTime"/"endTime" must be HH:MM (24-hour).` }
        if ((b.endTime as string) <= (b.startTime as string))
            return { error: `${where}: "endTime" must be after "startTime".` }
        const category =
            typeof b.category === 'string' &&
            (TIMEBOX_CATEGORIES as readonly string[]).includes(b.category)
                ? (b.category as TimeboxCategory)
                : undefined
        blocks.push({
            title,
            category,
            startTime: b.startTime as string,
            endTime: b.endTime as string,
        })
    }
    return { blocks }
}

export default function TimeboxImport({ open, dateLabel, importing, onClose, onImport }: Props) {
    const [text, setText] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        if (open) {
            setText('')
            setError('')
        }
    }, [open])

    function handleImport() {
        const result = parseBlocks(text)
        if ('error' in result) {
            setError(result.error)
            return
        }
        onImport(result.blocks)
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Import day plan"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={importing}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        icon="fa-solid fa-file-import"
                        onClick={handleImport}
                        disabled={importing || !text.trim()}
                    >
                        {importing ? 'Importing…' : 'Import'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">
                    Paste a JSON array of blocks to add to{' '}
                    <span className="font-semibold text-neutral-700">{dateLabel}</span>. Each block
                    needs a <code className="text-neutral-700">title</code>,{' '}
                    <code className="text-neutral-700">startTime</code> and{' '}
                    <code className="text-neutral-700">endTime</code> (HH:MM). An optional{' '}
                    <code className="text-neutral-700">category</code> can be one of:{' '}
                    {TIMEBOX_CATEGORIES.join(', ')}.
                </p>

                <textarea
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value)
                        setError('')
                    }}
                    spellCheck={false}
                    rows={12}
                    placeholder={SAMPLE}
                    className="w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-400 focus:bg-white focus:outline-none"
                    autoFocus
                />

                <button
                    type="button"
                    onClick={() => {
                        setText(SAMPLE)
                        setError('')
                    }}
                    className="self-start text-xs font-semibold text-neutral-400 hover:text-neutral-600"
                >
                    <i className="fa-solid fa-wand-magic-sparkles mr-1" aria-hidden="true" />
                    Insert sample
                </button>

                {error && (
                    <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        {error}
                    </p>
                )}

                <p className="text-xs text-neutral-400">
                    <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
                    Blocks that overlap an existing block are skipped.
                </p>
            </div>
        </Modal>
    )
}
