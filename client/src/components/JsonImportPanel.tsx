import { useState, type ReactNode } from 'react'
import { Card } from './Card'
import Button from './Button'
import Alert from './Alert'
import ImportUndoBanner from './ImportUndoBanner'
import ImportConflictList, {
    conflictKey,
    toOverwriteMap,
    type NameConflict,
    type ConflictChoice,
} from './ImportConflictList'
import { useToast } from '../context/ToastContext'
import type { ImportResource, OverwriteMap, ImportResult } from '../services/imports'

/** Pull a human-readable message out of an unknown thrown error. */
function errorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
        const resp = (err as { response?: { data?: { message?: unknown } } }).response
        if (typeof resp?.data?.message === 'string') return resp.data.message
        const msg = (err as { message?: unknown }).message
        if (typeof msg === 'string') return msg
    }
    return 'Something went wrong during import.'
}

/** Which top-level array keys hold this resource's items (besides a bare array). */
const RESOURCE_KEYS: Record<ImportResource, string[]> = {
    conditioning: ['conditioning', 'sessions'],
    exercises: ['exercises'],
    workouts: ['workouts'],
    mobility: ['mobility'],
    recovery: ['recovery'],
}

/** Find the array of items in the parsed JSON — a bare array or a known key. */
function extractItems(parsed: unknown, resource?: ImportResource): unknown[] | null {
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && resource) {
        const obj = parsed as Record<string, unknown>
        for (const key of RESOURCE_KEYS[resource]) {
            if (Array.isArray(obj[key])) return obj[key] as unknown[]
        }
    }
    return null
}

/** Build the incoming-name → existing-id conflict list. */
function findConflicts(items: unknown[], existing: { _id: string; name: string }[]): NameConflict[] {
    const byKey = new Map(existing.map((e) => [conflictKey(e.name), e._id]))
    const out: NameConflict[] = []
    const seen = new Set<string>()
    for (const it of items) {
        const name = it && typeof it === 'object' ? (it as { name?: unknown }).name : undefined
        if (typeof name !== 'string' || !name.trim()) continue
        const key = conflictKey(name)
        const existingId = byKey.get(key)
        if (existingId && !seen.has(key)) {
            seen.add(key)
            out.push({ name: name.trim(), existingId })
        }
    }
    return out
}

type Result = { variant: 'success' | 'danger'; message: string } | null

interface JsonImportPanelProps {
    /** Page-style heading, e.g. "Import workouts". */
    heading: string
    description: string
    /** Pretty-printed JSON example the user can copy. */
    template: string
    /** Field-by-field explanation shown under the template. */
    notes: ReactNode
    /** Singular noun for messages, e.g. "workout". */
    itemNoun: string
    /** Return to the library grid. */
    onBack: () => void
    /** Sends the parsed JSON to the server, resolving to the created/updated counts. */
    doImport: (parsed: unknown, overwrite?: OverwriteMap) => Promise<ImportResult>
    /** Called after a successful import, with the created count. */
    onImported: (count: number) => void
    /** Library key — enables the "undo last import" banner when provided. */
    resource?: ImportResource
    /** Existing library items — enables name-clash overwrite/keep-both prompts. */
    existingItems?: { _id: string; name: string }[]
    /** Reload the library grid after an import is reverted. */
    onLibraryChanged?: () => void
}

/**
 * The shared "paste JSON to bulk-import" view: a copyable template plus a
 * paste-and-validate box. When the pasted items clash by name with existing
 * library entries, it drops into a reconcile step where the user chooses, per
 * clash, to overwrite in place or keep both.
 */
export default function JsonImportPanel({
    heading,
    description,
    template,
    notes,
    itemNoun,
    onBack,
    doImport,
    onImported,
    resource,
    existingItems,
    onLibraryChanged,
}: JsonImportPanelProps) {
    const toast = useToast()
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<Result>(null)
    const [copied, setCopied] = useState(false)

    // Reconcile stage: set once a paste is found to clash with existing names.
    const [pending, setPending] = useState<unknown>(null)
    const [conflicts, setConflicts] = useState<NameConflict[]>([])
    const [choices, setChoices] = useState<Record<string, ConflictChoice>>({})

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(template)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    /** Send to the server, then report how many were added vs updated. */
    async function commit(data: unknown, overwrite?: OverwriteMap) {
        setImporting(true)
        setResult(null)
        try {
            const { created, updated } = await doImport(data, overwrite)
            const parts: string[] = []
            if (created) parts.push(`${created} added`)
            if (updated) parts.push(`${updated} updated`)
            const summary = parts.length ? parts.join(', ') : 'nothing changed'
            toast.show(`Import complete — ${summary}.`, 'success')
            setText('')
            setConflicts([])
            setPending(null)
            setResult({ variant: 'success', message: `Import complete — ${summary}. Returning…` })
            setTimeout(() => onImported(created), 1200)
        } catch (err) {
            setResult({ variant: 'danger', message: errorMessage(err) })
        } finally {
            setImporting(false)
        }
    }

    function handleImport() {
        setResult(null)
        const trimmed = text.trim()
        if (!trimmed) {
            setResult({ variant: 'danger', message: 'Paste some JSON to import first.' })
            return
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(trimmed)
        } catch {
            setResult({
                variant: 'danger',
                message: "That isn't valid JSON. Check for missing commas, quotes or brackets.",
            })
            return
        }

        // If we can read the items and know the library, check for name clashes.
        const items = extractItems(parsed, resource)
        const data = items ?? parsed
        if (items && existingItems && existingItems.length) {
            const found = findConflicts(items, existingItems)
            if (found.length) {
                setPending(data)
                setConflicts(found)
                setChoices(Object.fromEntries(found.map((c) => [conflictKey(c.name), 'overwrite'])))
                return
            }
        }
        commit(data)
    }

    const reconciling = conflicts.length > 0

    return (
        <div className="flex flex-col gap-6">
            <div>
                <button
                    type="button"
                    onClick={reconciling ? () => setConflicts([]) : onBack}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    {reconciling ? 'Back to paste' : 'Back to library'}
                </button>
                <h2 className="text-xl font-bold tracking-tight text-neutral-950">{heading}</h2>
                <p className="mt-1 text-sm text-neutral-500">{description}</p>
            </div>

            {result && (
                <Alert variant={result.variant} onClose={() => setResult(null)}>
                    {result.message}
                </Alert>
            )}

            {reconciling ? (
                <>
                    <ImportConflictList
                        conflicts={conflicts}
                        noun={itemNoun}
                        choices={choices}
                        onChange={setChoices}
                    />
                    <div className="flex items-center justify-end gap-3">
                        <Button variant="ghost" onClick={() => setConflicts([])} disabled={importing}>
                            Back
                        </Button>
                        <Button
                            icon="fa-solid fa-file-import"
                            onClick={() => commit(pending, toOverwriteMap(conflicts, choices))}
                            disabled={importing}
                        >
                            {importing ? 'Importing…' : 'Confirm import'}
                        </Button>
                    </div>
                </>
            ) : (
                <>
                    {resource && (
                        <ImportUndoBanner
                            resource={resource}
                            noun={itemNoun}
                            onReverted={() => onLibraryChanged?.()}
                        />
                    )}

                    {/* Template */}
                    <Card as="section" hover={false}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
                                Template
                            </h3>
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'}
                                onClick={copyTemplate}
                            >
                                {copied ? 'Copied' : 'Copy template'}
                            </Button>
                        </div>
                        <pre className="max-h-96 overflow-auto rounded-xl bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
                            <code>{template}</code>
                        </pre>
                        <div className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-500">{notes}</div>
                    </Card>

                    {/* Paste + import */}
                    <Card as="section" hover={false}>
                        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                            Paste JSON
                        </h3>

                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            spellCheck={false}
                            rows={12}
                            placeholder="Paste your JSON here…"
                            className="w-full resize-y rounded-xl border border-neutral-200 bg-white p-4 font-mono text-xs leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                        />

                        <div className="mt-4 flex items-center justify-end gap-3">
                            <Button
                                variant="ghost"
                                onClick={() => setText('')}
                                disabled={!text || importing}
                            >
                                Clear
                            </Button>
                            <Button
                                icon="fa-solid fa-file-import"
                                onClick={handleImport}
                                disabled={importing}
                            >
                                {importing ? 'Importing…' : `Import ${itemNoun}s`}
                            </Button>
                        </div>
                    </Card>
                </>
            )}
        </div>
    )
}
