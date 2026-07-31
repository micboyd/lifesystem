import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Button from '../components/Button'
import Alert from '../components/Alert'
import { importMeals } from '../services/meals'
import { useToast } from '../context/ToastContext'
import { MEAL_TYPES } from '../types'

/** A worked example the user can copy, tweak, and paste back in. */
const TEMPLATE = JSON.stringify(
    [
        {
            name: 'Chicken & rice bowl',
            types: ['lunch', 'dinner'],
            servings: 2,
            servingLabel: '1 bowl',
            macros: { calories: 550, protein: 45, carbs: 60, fat: 12 },
            ingredients: [
                { name: 'Chicken breast', quantity: '300', unit: 'g' },
                { name: 'Basmati rice', quantity: '150', unit: 'g' },
                { name: 'Broccoli', quantity: '1', unit: 'head' },
                { name: 'Olive oil', quantity: '1', unit: 'tbsp' },
            ],
            method: [
                'Cook the rice according to the packet.',
                'Season and grill the chicken until cooked through.',
                'Steam the broccoli, then combine everything and drizzle with oil.',
            ],
            notes: 'Great for meal prep — keeps for 3 days in the fridge.',
            link: 'https://example.com/recipe',
        },
        {
            name: 'Overnight oats',
            types: ['breakfast', 'snack'],
            servings: 1,
            macros: { calories: 380, protein: 20, carbs: 48, fat: 10 },
            ingredients: [
                { name: 'Rolled oats', quantity: '60', unit: 'g' },
                { name: 'Greek yoghurt', quantity: '100', unit: 'g' },
                { name: 'Milk', quantity: '150', unit: 'ml' },
                { name: 'Honey', quantity: '1', unit: 'tsp' },
            ],
            method: ['Mix everything in a jar.', 'Refrigerate overnight and eat cold.'],
        },
    ],
    null,
    2
)

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

export default function NutritionImport() {
    const navigate = useNavigate()
    const toast = useToast()
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<Result>(null)
    const [copied, setCopied] = useState(false)

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(TEMPLATE)
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
            const created = await importMeals(parsed)
            const n = created.length
            const msg = `Imported ${n} ${n === 1 ? 'meal' : 'meals'}.`
            toast.show(msg, 'success')
            setText('')
            setResult({ variant: 'success', message: `${msg} Redirecting to your library…` })
            setTimeout(() => navigate('/nutrition'), 1200)
        } catch (err) {
            setResult({ variant: 'danger', message: errorMessage(err) })
        } finally {
            setImporting(false)
        }
    }

    return (
        <Container as="main" className="py-10">
            <header className="mb-8">
                <Link
                    to="/nutrition"
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    Back to Nutrition
                </Link>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Import meals</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Copy the template, fill it in with your own recipes, then paste the JSON below to
                    add them all to your library at once.
                </p>
            </header>

            <div className="flex flex-col gap-6">
                {/* Template */}
                <Card as="section" hover={false}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
                            Template
                        </h2>
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
                        <code>{TEMPLATE}</code>
                    </pre>
                    <div className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-500">
                        <p>
                            <span className="font-semibold text-neutral-700">name</span> is the only
                            required field. Everything else is optional and defaults sensibly.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">types</span> may be any
                            of: {MEAL_TYPES.join(', ')}. A meal can have several.
                        </p>
                        <p>
                            <span className="font-semibold text-neutral-700">macros</span> are per
                            serving. <span className="font-semibold text-neutral-700">quantity</span>{' '}
                            and <span className="font-semibold text-neutral-700">unit</span> are free
                            text — e.g. 1 and tbsp.
                        </p>
                    </div>
                </Card>

                {/* Paste + import */}
                <Card as="section" hover={false}>
                    <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                        Paste JSON
                    </h2>

                    {result && (
                        <Alert
                            variant={result.variant}
                            className="mb-4"
                            onClose={() => setResult(null)}
                        >
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
                        <Button
                            icon="fa-solid fa-file-import"
                            onClick={handleImport}
                            disabled={importing}
                        >
                            {importing ? 'Importing…' : 'Import meals'}
                        </Button>
                    </div>
                </Card>
            </div>
        </Container>
    )
}
