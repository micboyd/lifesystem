import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Button from '../components/Button'
import Alert from '../components/Alert'
import Modal from '../components/Modal'
import Checkbox from '../components/Checkbox'
import { importMeals, listMeals } from '../services/meals'
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
            prepTime: 25,
            prepOverhead: 0.4,
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
            prepTime: 5,
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

/** Pull the meal array out of a parsed payload (a bare array or a `{ meals }` object). */
function toMealArray(parsed: unknown): unknown[] | null {
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).meals)) {
        return (parsed as Record<string, unknown>).meals as unknown[]
    }
    return null
}

/** The trimmed `name` of a payload item, or '' if it hasn't got one. */
function itemName(item: unknown): string {
    if (item && typeof item === 'object') {
        const name = (item as Record<string, unknown>).name
        if (typeof name === 'string') return name.trim()
    }
    return ''
}

/** A duplicate the user must decide about: its display name and lowercased key. */
type Duplicate = { name: string; key: string }

/** State for the overwrite prompt: the payload to import plus the clashing names. */
type DupPrompt = { meals: unknown[]; duplicates: Duplicate[] } | null

export default function NutritionImport() {
    const navigate = useNavigate()
    const toast = useToast()
    const [text, setText] = useState('')
    const [importing, setImporting] = useState(false)
    const [result, setResult] = useState<Result>(null)
    const [copied, setCopied] = useState(false)

    // When an import contains meals whose names already exist, we pause and ask
    // which to overwrite. `selected` holds the lowercased names ticked to overwrite.
    const [dupPrompt, setDupPrompt] = useState<DupPrompt>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(TEMPLATE)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    /** Run the import and report the outcome. `overwrite` names replace duplicates. */
    async function runImport(meals: unknown[], overwrite: string[]) {
        setImporting(true)
        try {
            const { created, updated, skipped } = await importMeals(meals, overwrite)
            const parts: string[] = []
            if (created) parts.push(`imported ${created}`)
            if (updated) parts.push(`overwrote ${updated}`)
            if (skipped) parts.push(`skipped ${skipped}`)
            const summary = parts.length ? parts.join(', ') : 'nothing changed'

            if (created + updated === 0) {
                // Everything was a skipped duplicate — stay put so nothing feels lost.
                setResult({ variant: 'danger', message: `Import complete — ${summary}.` })
                return
            }
            toast.show(`Import complete — ${summary}.`, 'success')
            setText('')
            setResult({ variant: 'success', message: `Import complete — ${summary}. Redirecting…` })
            setTimeout(() => navigate('/nutrition'), 1200)
        } catch (err) {
            setResult({ variant: 'danger', message: errorMessage(err) })
        } finally {
            setImporting(false)
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

        const meals = toMealArray(parsed)
        if (!meals) {
            setResult({
                variant: 'danger',
                message: 'Expected a JSON array of meals, or an object with a "meals" array.',
            })
            return
        }

        // Compare against the existing library to spot name clashes before importing.
        setImporting(true)
        let existing: Awaited<ReturnType<typeof listMeals>>
        try {
            existing = await listMeals()
        } catch (err) {
            setImporting(false)
            setResult({ variant: 'danger', message: errorMessage(err) })
            return
        }
        setImporting(false)

        const existingKeys = new Set(existing.map((m) => m.name.toLowerCase()))
        const seen = new Set<string>()
        const duplicates: Duplicate[] = []
        for (const item of meals) {
            const name = itemName(item)
            const key = name.toLowerCase()
            if (!key || seen.has(key)) continue
            seen.add(key)
            if (existingKeys.has(key)) duplicates.push({ name, key })
        }

        if (duplicates.length === 0) {
            await runImport(meals, [])
            return
        }

        // Default to overwriting all — the common intent when re-importing an export.
        setSelected(new Set(duplicates.map((d) => d.key)))
        setDupPrompt({ meals, duplicates })
    }

    async function confirmDuplicates() {
        if (!dupPrompt) return
        const overwrite = dupPrompt.duplicates.filter((d) => selected.has(d.key)).map((d) => d.name)
        setDupPrompt(null)
        await runImport(dupPrompt.meals, overwrite)
    }

    const allSelected = useMemo(
        () => !!dupPrompt && dupPrompt.duplicates.every((d) => selected.has(d.key)),
        [dupPrompt, selected]
    )

    function toggleAll(on: boolean) {
        setSelected(on && dupPrompt ? new Set(dupPrompt.duplicates.map((d) => d.key)) : new Set())
    }

    function toggleOne(key: string, on: boolean) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (on) next.add(key)
            else next.delete(key)
            return next
        })
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
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">Import meals</h1>
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
                        <p>
                            <span className="font-semibold text-neutral-700">prepTime</span> is minutes
                            to prep <em>one</em> serving; larger batches are estimated from it.{' '}
                            <span className="font-semibold text-neutral-700">prepOverhead</span> (0–1,
                            optional) is the share that&rsquo;s one-time setup — leave it out to use the
                            default.
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

            <Modal
                open={!!dupPrompt}
                onClose={() => setDupPrompt(null)}
                title="Some meals already exist"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setDupPrompt(null)} disabled={importing}>
                            Cancel
                        </Button>
                        <Button icon="fa-solid fa-file-import" onClick={confirmDuplicates} disabled={importing}>
                            {importing ? 'Importing…' : 'Import'}
                        </Button>
                    </>
                }
            >
                {dupPrompt && (
                    <div className="flex flex-col gap-4">
                        <p className="text-sm text-neutral-500">
                            {dupPrompt.duplicates.length}{' '}
                            {dupPrompt.duplicates.length === 1 ? 'meal has' : 'meals have'} a name
                            that&rsquo;s already in your library. Tick the ones you want to overwrite —
                            anything left
                            unticked is skipped. New meals import either way.
                        </p>

                        <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                            <Checkbox
                                checked={allSelected}
                                onChange={toggleAll}
                                label={allSelected ? 'Overwrite all' : 'Overwrite none'}
                            />
                            <span className="text-xs font-medium text-neutral-400">
                                {selected.size} of {dupPrompt.duplicates.length} selected
                            </span>
                        </div>

                        <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
                            {dupPrompt.duplicates.map((d) => (
                                <li key={d.key}>
                                    <Checkbox
                                        checked={selected.has(d.key)}
                                        onChange={(on) => toggleOne(d.key, on)}
                                        label={d.name}
                                        className="w-full rounded-lg px-2 py-1.5 hover:bg-neutral-50"
                                    />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </Modal>
        </Container>
    )
}
