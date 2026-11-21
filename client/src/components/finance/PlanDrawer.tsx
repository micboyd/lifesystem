import { useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Modal from '../Modal'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import Switch from '../Switch'
import PillToggle from '../PillToggle'
import { FIELD_HINT, FIELD_LABEL } from '../fieldStyles'
import { addMonths } from '../../lib/finance'
import { formatAmount } from '../../lib/money'
import { computePlan, isIncluded, type PlanInputs, type PlanMode } from '../../lib/savingsPlans'
import type { SavingsTargetInput } from '../../services/savingsTargets'
import { Money, MonthField, OVERLINE, monthLabelLong } from './savingsFigures'
import type { SavingsTarget } from '../../types'

/** A savings account offered as an "already saved" shortcut. */
export interface PlanAccount {
    name: string
    balance: number
    rate: number
}

/** `plan: null` creates a new plan; a plan edits that one. */
export interface PlanDrawerState {
    plan: SavingsTarget | null
}

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function parse(s: string): number {
    const n = parseFloat(s.replace(/,/g, '').trim())
    return Number.isNaN(n) ? 0 : n
}

function round2(n: number) {
    return String(Math.round(n * 100) / 100)
}

/** Keeps the last state while the drawer slides shut. */
function useLast<T>(value: T | null): T | null {
    const [last, setLast] = useState(value)
    if (value !== null && value !== last) setLast(value)
    return value ?? last
}

export default function PlanDrawer({
    state,
    accounts,
    defaultRate,
    onClose,
    onSave,
    onDelete,
}: {
    state: PlanDrawerState | null
    accounts: PlanAccount[]
    defaultRate: number
    onClose: () => void
    onSave: (id: string | null, fields: SavingsTargetInput | Partial<SavingsTargetInput>) => Promise<void>
    onDelete: (id: string) => Promise<void>
}) {
    const shown = useLast(state)
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)
    const plan = shown?.plan ?? null

    return (
        <>
            <Drawer
                open={!!state}
                onClose={onClose}
                size="lg"
                title={plan ? plan.name : 'New plan'}
                badge={plan?.priority ? 'Priority' : undefined}
                footer={
                    <div className="flex w-full items-center gap-3">
                        {plan && (
                            <Button variant="ghost" icon="fa-solid fa-trash-can" onClick={() => setConfirming(true)}>
                                Delete
                            </Button>
                        )}
                        <span className="flex-1" />
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" form="savings-plan-form" disabled={busy}>
                            {busy ? 'Saving…' : plan ? 'Save' : 'Save plan'}
                        </Button>
                    </div>
                }
            >
                {shown && (
                    <PlanForm
                        key={(plan?._id ?? 'new') + String(!!state)}
                        plan={plan}
                        accounts={accounts}
                        defaultRate={defaultRate}
                        onSubmit={async (fields) => {
                            setBusy(true)
                            try {
                                await onSave(plan?._id ?? null, fields)
                            } finally {
                                setBusy(false)
                            }
                        }}
                    />
                )}
            </Drawer>

            <Modal
                open={confirming}
                onClose={() => setConfirming(false)}
                size="sm"
                title="Delete plan?"
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setConfirming(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            disabled={busy}
                            onClick={async () => {
                                if (!plan) return
                                setBusy(true)
                                try {
                                    await onDelete(plan._id)
                                } finally {
                                    setBusy(false)
                                    setConfirming(false)
                                }
                            }}
                        >
                            Delete
                        </Button>
                    </>
                }
            >
                <p>
                    {plan?.name} will be gone for good. Your savings and the Monthly sheet aren&apos;t touched.
                </p>
            </Modal>
        </>
    )
}

function PlanForm({
    plan,
    accounts,
    defaultRate,
    onSubmit,
}: {
    plan: SavingsTarget | null
    accounts: PlanAccount[]
    defaultRate: number
    onSubmit: (fields: SavingsTargetInput | Partial<SavingsTargetInput>) => void
}) {
    const now = currentMonth()
    const fixed = plan?.mode === 'contribution'

    // The numbers a plan was worked out from, as form strings.
    const initial = {
        mode: (plan?.mode ?? 'target') as PlanMode,
        target: plan && !fixed ? round2(plan.targetAmount) : '',
        monthly: plan && fixed ? round2(plan.requiredMonthly) : '',
        balance: plan ? round2(plan.startingBalance) : '0',
        rate: plan ? round2(plan.annualInterestRate) : round2(defaultRate),
        start: `${plan?.startMonth ?? now}-01`,
        end: `${plan?.targetMonth ?? addMonths(now, 12)}-01`,
    }

    const [name, setName] = useState(plan?.name ?? '')
    const [notes, setNotes] = useState(plan?.notes ?? '')
    const [mode, setMode] = useState<PlanMode>(initial.mode)
    const [target, setTarget] = useState(initial.target)
    const [monthly, setMonthly] = useState(initial.monthly)
    const [balance, setBalance] = useState(initial.balance)
    const [rate, setRate] = useState(initial.rate)
    const [start, setStart] = useState(initial.start)
    const [end, setEnd] = useState(initial.end)
    const [priority, setPriority] = useState(!!plan?.priority)
    const [included, setIncluded] = useState(plan ? isIncluded(plan) : true)
    const [rework, setRework] = useState(false)

    const numbersChanged =
        mode !== initial.mode ||
        target !== initial.target ||
        monthly !== initial.monthly ||
        balance !== initial.balance ||
        rate !== initial.rate ||
        start !== initial.start ||
        end !== initial.end
    // A new plan, changed numbers, or an explicit re-work all mean "work it out again now".
    const recompute = !plan || numbersChanged || rework
    const stale = !!plan && plan.savedMonth < now

    const inputs: PlanInputs = {
        mode,
        targetAmount: parse(target),
        monthlyAmount: parse(monthly),
        startingBalance: parse(balance),
        annualInterestRate: parse(rate),
        startMonth: start.slice(0, 7),
        endMonth: end.slice(0, 7),
    }
    const live = computePlan(inputs, now)

    // What the result panel shows: the stored plan until something changes.
    const result = recompute
        ? live
        : {
              error: undefined,
              onTrack: plan!.onTrack,
              monthly: plan!.requiredMonthly,
              finalBalance: plan!.targetAmount,
              contributionMonths: plan!.contributionMonths,
              firstContribMonth: plan!.startMonth,
              growthOnly: plan!.growthOnly,
              totalContributions: plan!.totalContributions,
              interestEarned: plan!.interestEarned,
          }
    const isEmpty = mode === 'target' ? !target.trim() : !monthly.trim()

    function submit(e: FormEvent) {
        e.preventDefault()
        if (recompute && live.error) return
        const endLabel = monthLabelLong(inputs.endMonth)
        const fallbackName =
            mode === 'target'
                ? `£${formatAmount(inputs.targetAmount, 0)} by ${endLabel}`
                : `£${formatAmount(inputs.monthlyAmount, 0)} a month until ${endLabel}`
        const meta = {
            name: name.trim() || plan?.name || fallbackName,
            notes: notes.trim() || (plan ? null : undefined),
            priority,
            included,
        }
        if (!recompute) {
            onSubmit(meta as Partial<SavingsTargetInput>)
            return
        }
        onSubmit({
            ...meta,
            notes: meta.notes ?? undefined,
            mode,
            // A fixed-amount plan stores its projected pot as the target.
            targetAmount: mode === 'target' ? inputs.targetAmount : live.finalBalance,
            startingBalance: inputs.startingBalance,
            annualInterestRate: inputs.annualInterestRate,
            startMonth: live.firstContribMonth,
            targetMonth: inputs.endMonth,
            savedMonth: now,
            onTrack: live.onTrack,
            requiredMonthly: live.monthly,
            contributionMonths: live.contributionMonths,
            totalContributions: live.totalContributions,
            interestEarned: live.interestEarned,
            growthOnly: live.growthOnly,
        } as SavingsTargetInput)
    }

    const total = accounts.reduce((s, a) => s + a.balance, 0)
    const shortcuts = [
        { label: 'Nothing yet', balance: 0, rate: undefined as number | undefined },
        ...accounts.filter((a) => a.balance > 0).map((a) => ({ label: a.name, balance: a.balance, rate: a.rate })),
        ...(accounts.length > 1 && total > 0 ? [{ label: 'All savings', balance: total, rate: undefined }] : []),
    ]

    return (
        <form id="savings-plan-form" onSubmit={submit} className="flex flex-col gap-6">
            <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. House deposit"
                autoFocus={!plan}
            />

            <div className="flex flex-col gap-2">
                <span className={FIELD_LABEL}>Start from</span>
                <PillToggle
                    label="Start from"
                    options={[
                        { value: 'target' as PlanMode, label: 'A target to reach' },
                        { value: 'contribution' as PlanMode, label: 'What I can save' },
                    ]}
                    value={mode}
                    onChange={setMode}
                />
            </div>

            {mode === 'target' ? (
                <Input
                    label="Target"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    prefix="£"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="10000"
                />
            ) : (
                <Input
                    label="Each month"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    prefix="£"
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                    placeholder="250"
                />
            )}

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <MonthField
                    label="Start saving"
                    value={start}
                    minDate={plan ? undefined : `${now}-01`}
                    maxDate={end}
                    onChange={setStart}
                />
                <MonthField
                    label={mode === 'target' ? 'Reach it by' : 'Save until'}
                    value={end}
                    minDate={start}
                    onChange={setEnd}
                />
            </div>

            <div className="flex flex-col gap-2">
                <Input
                    label="Already saved towards it"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    prefix="£"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                />
                {shortcuts.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                        {shortcuts.map((s) => {
                            const on = parse(balance) === Math.round(s.balance * 100) / 100
                            return (
                                <button
                                    key={s.label}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => {
                                        setBalance(round2(s.balance))
                                        if (s.rate !== undefined && s.rate > 0) setRate(round2(s.rate))
                                    }}
                                    className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                        on
                                            ? 'bg-neutral-900 text-neutral-50'
                                            : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                                    }`}
                                >
                                    {s.label}
                                    {s.balance > 0 && <span className="ml-1.5 tabular-nums opacity-70">£{formatAmount(s.balance, 0)}</span>}
                                </button>
                            )
                        })}
                    </div>
                )}
                <p className={FIELD_HINT}>
                    Only money set aside for this. If two plans count the same pot, it&apos;s counted twice.
                </p>
            </div>

            <Input
                label="Interest a year (%)"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                hint={defaultRate > 0 ? `Your savings accounts average ${formatAmount(defaultRate, 2)}%.` : undefined}
            />

            {/* Result — live while you type */}
            <div className="border-y border-neutral-100 py-5">
                {isEmpty ? (
                    <p className="text-[13px] text-neutral-500">
                        {mode === 'target'
                            ? 'Enter a target to see what to put away each month.'
                            : 'Enter a monthly amount to see where it lands.'}
                    </p>
                ) : result.error ? (
                    <p className="flex items-center gap-2 text-[13px] text-red-600">
                        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                        {result.error}
                    </p>
                ) : (
                    <PlanResultView mode={mode} result={result} endMonth={inputs.endMonth} balance={inputs.startingBalance} />
                )}

                {plan && !numbersChanged && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                        <span>
                            {rework ? 'Re-worked from today — save to keep it.' : `Worked out in ${monthLabelLong(plan.savedMonth)}.`}
                        </span>
                        {stale && !rework && (
                            <button
                                type="button"
                                onClick={() => setRework(true)}
                                className="font-medium text-neutral-900 underline underline-offset-2 hover:no-underline"
                            >
                                Re-work from today
                            </button>
                        )}
                    </div>
                )}
            </div>

            {plan && (
                <div className="flex flex-col divide-y divide-neutral-100 rounded-xl bg-neutral-50 px-4">
                    <SwitchRow
                        title="Count in totals"
                        sub="Adds to what your plans need each month."
                        checked={included}
                        onChange={setIncluded}
                    />
                    <SwitchRow title="Priority" sub="Pinned to the top of the list." checked={priority} onChange={setPriority} />
                </div>
            )}

            <Textarea
                label="Notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What it's for, why this date…"
                className="resize-none"
            />
        </form>
    )
}

function SwitchRow({
    title,
    sub,
    checked,
    onChange,
}: {
    title: string
    sub: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <div>
                <p className="text-[15px] text-neutral-900">{title}</p>
                <p className="text-[13px] text-neutral-500">{sub}</p>
            </div>
            <Switch checked={checked} onChange={onChange} />
        </div>
    )
}

function PlanResultView({
    mode,
    result,
    endMonth,
    balance,
}: {
    mode: PlanMode
    result: ReturnType<typeof computePlan>
    endMonth: string
    balance: number
}) {
    const n = result.contributionMonths
    const span = `${n} ${n === 1 ? 'month' : 'months'} · ${monthLabelLong(result.firstContribMonth)} to ${monthLabelLong(endMonth)}`

    if (mode === 'target' && result.onTrack) {
        return (
            <div>
                <p className={OVERLINE}>Already on track</p>
                <p className="mt-1.5 text-[32px] font-medium leading-none tracking-[-0.03em] text-emerald-600">Nothing to add</p>
                <p className="mt-2 text-[13px] text-neutral-500">
                    Interest alone takes <Money v={balance} /> to <Money v={result.growthOnly} /> by {monthLabelLong(endMonth)}.
                </p>
            </div>
        )
    }

    return (
        <div>
            <p className={OVERLINE}>{mode === 'target' ? 'Put away' : "You'll have"}</p>
            <p className="mt-1.5 text-[32px] font-medium leading-none tracking-[-0.03em] text-neutral-950">
                {mode === 'target' ? (
                    <>
                        <Money v={result.monthly} d={2} />
                        <span className="ml-1.5 text-base font-medium tracking-normal text-neutral-500">a month</span>
                    </>
                ) : (
                    <Money v={result.finalBalance} />
                )}
            </p>
            <p className="mt-2 text-[13px] text-neutral-500">
                {mode === 'target' ? (
                    <>
                        {span} · about <Money v={(result.monthly * 12) / 52} d={2} /> a week
                    </>
                ) : (
                    <>by {monthLabelLong(endMonth)} · {span}</>
                )}
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-3">
                {[
                    { label: 'Already', value: balance, color: 'bg-neutral-300' },
                    { label: 'You add', value: result.totalContributions, color: 'bg-neutral-900' },
                    { label: 'Interest', value: result.interestEarned, color: 'bg-emerald-500' },
                ].map((x) => (
                    <div key={x.label} className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.color}`} aria-hidden="true" />
                            {x.label}
                        </dt>
                        <dd className="mt-0.5 truncate text-[15px] font-medium text-neutral-900">
                            <Money v={Math.max(0, x.value)} />
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    )
}
