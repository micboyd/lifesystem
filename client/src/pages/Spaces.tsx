import { useEffect, useState } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { Card } from '../components/Card'
import { listStarlingSpaces } from '../services/finances'
import { formatAmount } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import type { StarlingSpace } from '../types'

const fmt = formatAmount

function SpaceCard({ space }: { space: StarlingSpace }) {
    const isSpending = space.type === 'spending'
    return (
        <Card hover={false} className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
                <span
                    className={[
                        'grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm',
                        isSpending ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600',
                    ].join(' ')}
                >
                    <i className={`fa-solid ${isSpending ? 'fa-credit-card' : 'fa-piggy-bank'}`} aria-hidden="true" />
                </span>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                    {isSpending ? 'Spending' : 'Savings'}
                </span>
            </div>
            <div className="min-w-0">
                <p className="truncate text-base font-bold tracking-tight text-neutral-900">{space.name}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-neutral-900">
                    £{fmt(space.balance)}
                </p>
            </div>
        </Card>
    )
}

/** Read-only visual overview of every Starling Space and its current balance. */
export default function Spaces() {
    useMoneyHidden() // re-render this subtree when money is hidden/shown
    const [loading, setLoading] = useState(true)
    const [spaces, setSpaces] = useState<StarlingSpace[]>([])
    const [configured, setConfigured] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        let active = true
        listStarlingSpaces()
            .then((s) => {
                if (!active) return
                setSpaces(s)
                setConfigured(true)
                setError(false)
            })
            .catch((err) => {
                if (!active) return
                if (err?.response?.status === 501) {
                    setConfigured(false)
                } else {
                    setError(true)
                }
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [])

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    if (!configured) {
        return (
            <EmptyState
                icon="fa-solid fa-building-columns"
                title="Starling isn't connected"
                description="Add a Starling access token on the server to see your spaces here."
            />
        )
    }

    if (error) {
        return (
            <EmptyState
                icon="fa-solid fa-triangle-exclamation"
                title="Couldn't reach Starling"
                description="Check the access token is still valid, then reload this page."
            />
        )
    }

    if (spaces.length === 0) {
        return (
            <EmptyState
                icon="fa-solid fa-building-columns"
                title="No spaces found"
                description="Nothing showed up on your Starling account."
            />
        )
    }

    const spending = spaces.filter((s) => s.type === 'spending')
    const savings = spaces.filter((s) => s.type === 'savings')
    const total = spaces.reduce((sum, s) => sum + s.balance, 0)

    return (
        <>
            <header className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">Spaces</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    A live snapshot of every Starling space and its balance.
                </p>
            </header>

            <div className="mb-8 rounded-3xl bg-neutral-950 p-6 text-white sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Total across all spaces
                </p>
                <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">£{fmt(total)}</p>
                <p className="mt-2 text-xs text-neutral-500">
                    {spaces.length} space{spaces.length === 1 ? '' : 's'}
                </p>
            </div>

            {spending.length > 0 && (
                <section className="mb-8">
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Spending spaces
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {spending.map((s) => (
                            <SpaceCard key={s.id} space={s} />
                        ))}
                    </div>
                </section>
            )}

            {savings.length > 0 && (
                <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Savings goals
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {savings.map((s) => (
                            <SpaceCard key={s.id} space={s} />
                        ))}
                    </div>
                </section>
            )}
        </>
    )
}
