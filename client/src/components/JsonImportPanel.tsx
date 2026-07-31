import { useState, type ReactNode } from 'react'
import { Card } from './Card'
import Button from './Button'
import Alert from './Alert'
import { useToast } from '../context/ToastContext'

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
    /** Sends the parsed JSON to the server, resolving to the created items. */
    doImport: (parsed: unknown) => Promise<{ length: number }>
    /** Called after a successful import, with the created count. */
    onImported: (count: number) => void
}

/**
 * The shared "paste JSON to bulk-import" view, matching the meal-import layout:
 * a copyable template plus a paste-and-validate box. Rendered inline inside a
 * library tab rather than on its own route.
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
}: JsonImportPanelProps) {
    const toast = useToast()
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<Result>(null)
    const [copied, setCopied] = useState(false)

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(template)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    async function handleImport() {
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

        setImporting(true)
        try {
            const created = await doImport(parsed)
            const n = created.length
            const msg = `Imported ${n} ${n === 1 ? itemNoun : `${itemNoun}s`}.`
            toast.show(msg, 'success')
            setText('')
            setResult({ variant: 'success', message: `${msg} Returning to your library…` })
            setTimeout(() => onImported(n), 1200)
        } catch (err) {
            setResult({ variant: 'danger', message: errorMessage(err) })
        } finally {
            setImporting(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div>
                <button
                    type="button"
                    onClick={onBack}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    Back to library
                </button>
                <h2 className="text-xl font-bold tracking-tight text-neutral-950">{heading}</h2>
                <p className="mt-1 text-sm text-neutral-500">{description}</p>
            </div>

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

                {result && (
                    <Alert variant={result.variant} className="mb-4" onClose={() => setResult(null)}>
                        {result.message}
                    </Alert>
                )}

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    spellCheck={false}
                    rows={12}
                    placeholder="Paste your JSON here…"
                    className="w-full resize-y rounded-xl border border-neutral-200 bg-white p-4 font-mono text-xs leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                />

                <div className="mt-4 flex items-center justify-end gap-3">
                    <Button variant="ghost" onClick={() => setText('')} disabled={!text || importing}>
                        Clear
                    </Button>
                    <Button icon="fa-solid fa-file-import" onClick={handleImport} disabled={importing}>
                        {importing ? 'Importing…' : `Import ${itemNoun}s`}
                    </Button>
                </div>
            </Card>
        </div>
    )
}
