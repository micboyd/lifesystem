import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Textarea from '../Textarea'
import { Card } from '../Card'
import Button from '../Button'
import Alert from '../Alert'
import { useToast } from '../../context/ToastContext'
import { importFinancePlan, type FinanceImportSummary, type FinanceImportAction } from '../../services/finances'
import { parseJsonc } from '../../lib/jsonc'
import { formatMoney } from '../../lib/money'

function errorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
        const resp = (err as { response?: { data?: { message?: unknown } } }).response
        if (typeof resp?.data?.message === 'string') return resp.data.message
        const msg = (err as { message?: unknown }).message
        if (typeof msg === 'string') return msg
    }
    return 'Something went wrong during import.'
}

/**
 * The plan format, annotated. Written as JSON with comments — the importer
 * strips them, so the template pastes straight back in as it is.
 */
const TEMPLATE = `{
  // Required. The first month the plan applies to, "YYYY-MM". Every change is
  // "from this month onwards" — earlier months keep what they showed.
  "month": "2026-12",

  // Groups and rows are matched to the sheet by name (case doesn't matter), so
  // re-importing a revised plan updates in place. Rows the plan doesn't mention
  // are left exactly as they are.
  "groups": [
    {
      "name": "Income",
      // Only needed for a new group: income | expense | savings.
      "type": "income",
      "rows": [
        // "amount" is £ per month.
        { "name": "Salary", "amount": 3879.90 },
        { "name": "Katy", "amount": 644.00 }
      ]
    },
    {
      "name": "Bills",
      "type": "expense",
      "rows": [
        { "name": "Rent", "amount": 650.00 },
        // "pot": an optional sub-group inside the group, made if new.
        { "name": "Spotify", "amount": 12.99, "pot": "Subscriptions" },
        // "end": true stops a row from this month on (earlier months keep it).
        { "name": "ChatGPT", "end": true }
      ]
    },
    {
      "name": "Spending",
      "type": "expense",
      "rows": [
        // "weekly": a weekly budget, £ per Mon–Sun week.
        { "name": "Groceries", "weekly": 80.00 },
        // Or a monthly "amount" with "budget": "weekly" — the month stays exact.
        { "name": "Food shop", "amount": 400.00, "budget": "weekly" },
        // "budget": "daily" makes a monthly amount a daily budget.
        { "name": "Nights out", "amount": 200.00, "budget": "daily" },
        // "oneOff": true — this month only.
        { "name": "Christmas presents", "amount": 200.00, "oneOff": true }
      ]
    },
    {
      // A savings group is a single amount, not rows.
      "name": "Savings",
      "type": "savings",
      "amount": 1163.04
    }
  ]
}
`

const ACTION_LABEL: Record<FinanceImportAction, string> = {
    add: 'New',
    change: 'Changed',
    same: 'No change',
    end: 'Stopped',
    'one-off': 'One-off',
    reopen: 'Restarted',
    missing: 'Not found',
}

function Money({ n }: { n?: number }) {
    return <span className="font-mono tabular-nums">{n === undefined ? '—' : formatMoney(n)}</span>
}

/** Paste a finance plan, preview exactly what it changes, then apply it. */
export default function FinanceImportPanel() {
    const navigate = useNavigate()
    const toast = useToast()
    const [text, setText] = useState('')
    const [preview, setPreview] = useState<FinanceImportSummary | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    function parse(): unknown | null {
        const trimmed = text.trim()
        if (!trimmed) {
            setError('Paste a plan first.')
            return null
        }
        try {
            return parseJsonc(trimmed)
        } catch {
            setError("That isn't valid JSON. Check for missing commas, quotes or brackets.")
            return null
        }
    }

    async function run(dryRun: boolean) {
        setError(null)
        const doc = parse()
        if (doc === null) return
        setBusy(true)
        try {
            const summary = await importFinancePlan(doc, dryRun)
            if (dryRun) {
                setPreview(summary)
            } else {
                toast.show(`Plan applied from ${summary.month}.`, 'success')
                navigate(`/finances?month=${summary.month}`)
            }
        } catch (err) {
            setPreview(null)
            setError(errorMessage(err))
        } finally {
            setBusy(false)
        }
    }

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(TEMPLATE)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    const changed = preview?.changes.filter((c) => c.action !== 'same') ?? []
    const same = preview?.changes.filter((c) => c.action === 'same') ?? []

    return (
        <div className="flex flex-col gap-6">
            <div>
                <button
                    type="button"
                    onClick={() => navigate('/finances')}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    Back to monthly
                </button>
                <h2 className="text-xl font-bold tracking-tight text-neutral-950">Import a finance plan</h2>
                <p className="mt-1 text-sm text-neutral-500">
                    Paste a plan, preview what it changes, then apply it. Changes take effect from the plan&apos;s
                    month onwards; earlier months are left as they were.
                </p>
            </div>

            {error && (
                <Alert variant="danger" onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            <Card as="section" hover={false}>
                <Textarea
                    label="Plan"
                    rows={14}
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value)
                        setPreview(null)
                    }}
                    placeholder='{ "month": "2026-12", "groups": [ … ] }'
                    className="font-mono text-xs"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" icon="fa-solid fa-eye" onClick={() => run(true)} disabled={busy}>
                        Preview
                    </Button>
                    <Button icon="fa-solid fa-check" onClick={() => run(false)} disabled={busy || !preview}>
                        Apply plan
                    </Button>
                </div>
            </Card>

            {preview && (
                <Card as="section" hover={false}>
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                        {preview.month} after import
                    </h3>
                    <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {(
                            [
                                ['In', preview.totals.income],
                                ['Out', preview.totals.expense],
                                ['Saved', preview.totals.savings],
                                ['Left over', preview.totals.leftOver],
                            ] as const
                        ).map(([label, n]) => (
                            <div key={label}>
                                <dt className="text-xs text-neutral-500">{label}</dt>
                                <dd className="mt-1 text-lg font-medium text-neutral-950">
                                    <Money n={n} />
                                </dd>
                            </div>
                        ))}
                    </dl>

                    {preview.warnings.length > 0 && (
                        <Alert variant="warning" className="mt-4">
                            <ul className="flex list-disc flex-col gap-0.5 pl-4">
                                {preview.warnings.map((w) => (
                                    <li key={w}>{w}</li>
                                ))}
                            </ul>
                        </Alert>
                    )}

                    {preview.groupsCreated.length > 0 && (
                        <p className="mt-4 text-sm text-neutral-600">
                            New groups: {preview.groupsCreated.join(', ')}
                        </p>
                    )}

                    <h4 className="mt-6 text-sm font-semibold text-neutral-900">
                        Changes ({changed.length})
                    </h4>
                    <table className="mt-2 w-full text-sm">
                        <tbody>
                            {changed.map((c) => (
                                <tr key={`${c.group}/${c.row}/${c.action}`} className="border-t border-hairline">
                                    <td className="py-2 pr-3 text-neutral-500">{c.group}</td>
                                    <td className="py-2 pr-3 text-neutral-950">{c.row}</td>
                                    <td className="py-2 pr-3 text-neutral-600">{ACTION_LABEL[c.action]}</td>
                                    <td className="py-2 text-right">
                                        {c.from !== undefined && (
                                            <>
                                                <Money n={c.from} /> →{' '}
                                            </>
                                        )}
                                        <Money n={c.to} />
                                        {c.weekly !== undefined && (
                                            <span className="text-neutral-500">
                                                {' '}
                                                (<Money n={c.weekly} />
                                                /wk)
                                            </span>
                                        )}
                                        {c.note && <span className="block text-xs text-neutral-500">{c.note}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {same.length > 0 && (
                        <p className="mt-4 text-xs text-neutral-500">
                            Already matching: {same.map((c) => c.row).join(', ')}
                        </p>
                    )}
                    {preview.untouched.length > 0 && (
                        <p className="mt-2 text-xs text-neutral-500">
                            Not in the plan, left as they are:{' '}
                            {preview.untouched.map((u) => `${u.row} (${formatMoney(u.amount)})`).join(', ')}
                        </p>
                    )}
                </Card>
            )}

            <Card as="section" hover={false}>
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Template</h3>
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
            </Card>
        </div>
    )
}
