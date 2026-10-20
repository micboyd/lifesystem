import { useEffect, useState } from 'react'
import Button from '../Button'
import PillToggle from '../PillToggle'
import Textarea from '../Textarea'
import Rating from '../Rating'
import Alert from '../Alert'
import EmptyState from '../EmptyState'
import Spinner from '../Spinner'
import { LIFE_PILLAR_ICONS, LIFE_PILLAR_LABELS } from '../../types'
import type { LifePlan, Season, SeasonReview } from '../../types'
import { formatMonthRange } from '../../lib/calendar'
import {
    overallScore,
    type PillarScore,
    type ScoreKey,
    type SeasonScorecard,
} from '../../lib/seasonReview'
import { AREA_TONES, type AreaTone } from '../dashboard/DashSection'
import { OVERLINE, PANEL, PILLAR_TONES, PillarTile, TabHeading, ToneTile, colorClasses } from './ui'

/**
 * The season retro: what the plan asked for against what the records show.
 *
 * Nothing here is typed in twice — the numbers come from logs already kept, and
 * the only thing the user writes is the part no data can supply. That's what
 * makes the loop cheap enough to actually close.
 */

const SCORE_ICONS: Record<ScoreKey, string> = {
    ...LIFE_PILLAR_ICONS,
    habits: 'fa-repeat',
}

const SCORE_LABELS: Record<ScoreKey, string> = {
    ...LIFE_PILLAR_LABELS,
    habits: 'Habits',
}

const SCORE_TONES: Record<ScoreKey, AreaTone> = {
    ...PILLAR_TONES,
    habits: 'sky',
}

/** A scored row, or a plain statement when there was nothing to measure. */
function ScoreRow({ score }: { score: PillarScore }) {
    return (
        <li className="flex items-start gap-3 py-4">
            <ToneTile icon={SCORE_ICONS[score.key]} tone={SCORE_TONES[score.key] ?? 'navy'} size="md" />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[15px] font-medium text-neutral-900">{SCORE_LABELS[score.key]}</p>
                    {score.score === null ? (
                        <span className="shrink-0 text-[13px] text-neutral-400">Not scored</span>
                    ) : (
                        <span className="shrink-0 text-[15px] font-medium tabular-nums text-neutral-900">
                            {score.score}%
                        </span>
                    )}
                </div>
                <p className="mt-0.5 text-[13px] text-neutral-500">{score.headline}</p>
                {score.detail && <p className="text-[13px] text-neutral-500">{score.detail}</p>}
                {score.score !== null && (
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                        <span
                            className={`block h-full rounded-full ${
                                score.score >= 80 ? 'bg-success' : (AREA_TONES[SCORE_TONES[score.key]] ?? AREA_TONES.navy).bar
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, score.score))}%` }}
                        />
                    </div>
                )}
            </div>
        </li>
    )
}

/** The overall score as a ring — the one number a retro opens on. */
function ScoreRing({ value }: { value: number }) {
    const r = 34
    const c = 2 * Math.PI * r
    const clamped = Math.max(0, Math.min(100, value))
    return (
        <div className="relative h-24 w-24 shrink-0">
            <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-neutral-200" />
                <circle
                    cx="40"
                    cy="40"
                    r={r}
                    fill="none"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - clamped / 100)}
                    className={clamped >= 80 ? 'stroke-success' : 'stroke-neutral-900'}
                />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                    <p className="text-2xl font-medium leading-none tracking-[-0.03em] tabular-nums text-neutral-950">
                        {value}%
                    </p>
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                        Overall
                    </p>
                </div>
            </div>
        </div>
    )
}

export default function SeasonReviewTab({
    plan,
    seasonId,
    onSelectSeason,
    scorecard,
    loading,
    saving,
    error,
    onSave,
}: {
    plan: LifePlan
    /** The season being reviewed, or null when the plan has none. */
    seasonId: string | null
    onSelectSeason: (id: string) => void
    scorecard: SeasonScorecard | null
    loading: boolean
    saving: boolean
    error: string | null
    onSave: (review: SeasonReview) => void
}) {
    const season: Season | undefined = plan.seasons.find((s) => s._id === seasonId)
    const [notes, setNotes] = useState('')
    const [rating, setRating] = useState(0)

    // Load the stored retro whenever a different season is selected.
    useEffect(() => {
        setNotes(season?.review?.notes ?? '')
        setRating(season?.review?.rating ?? 0)
    }, [season])

    if (plan.seasons.length === 0) {
        return (
            <EmptyState
                icon="fa-clipboard-check"
                title="Nothing to review yet"
                description="Reviews score a season against what actually happened, so there needs to be a season first."
            />
        )
    }

    const overall = scorecard ? overallScore(scorecard) : null
    const dirty =
        notes.trim() !== (season?.review?.notes ?? '').trim() || rating !== (season?.review?.rating ?? 0)

    return (
        <div className="space-y-6">
            <TabHeading title="Review" meta="Scored from what you already logged — no new data entry." />

            <PillToggle
                label="Season"
                options={plan.seasons.map((s) => ({ value: s._id, label: s.name }))}
                value={seasonId ?? ''}
                onChange={onSelectSeason}
            />

            {error && <Alert variant="danger">{error}</Alert>}

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                season &&
                scorecard && (
                    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                        <section className={`${PANEL} p-5 sm:p-6`}>
                            <div className="flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClasses(season.color).dot}`}
                                            aria-hidden="true"
                                        />
                                        <h3 className="truncate text-xl font-semibold tracking-[-0.015em] text-neutral-950">
                                            {season.name}
                                        </h3>
                                    </div>
                                    <p className="mt-0.5 text-[13px] text-neutral-500">
                                        {formatMonthRange(season.startMonth, season.endMonth)} ·{' '}
                                        {scorecard.complete
                                            ? `${scorecard.totalDays} days, finished`
                                            : `day ${scorecard.elapsedDays} of ${scorecard.totalDays}`}
                                    </p>
                                    {!scorecard.complete && scorecard.totalDays > 0 && (
                                        <div className="mt-3 h-1 w-40 max-w-full overflow-hidden rounded-full bg-neutral-200">
                                            <span
                                                className={`block h-full rounded-full ${colorClasses(season.color).dot}`}
                                                style={{ width: `${(scorecard.elapsedDays / scorecard.totalDays) * 100}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                                {overall !== null && <ScoreRing value={overall} />}
                            </div>

                            {!scorecard.complete && scorecard.elapsedDays > 0 && (
                                <p className="mt-4 rounded-xl bg-neutral-50 px-3.5 py-2.5 text-[13px] text-neutral-500">
                                    Still running, so it&apos;s scored on the days that have elapsed rather
                                    than the whole window.
                                </p>
                            )}
                            {scorecard.elapsedDays === 0 && (
                                <p className="mt-4 rounded-xl bg-neutral-50 px-3.5 py-2.5 text-[13px] text-neutral-500">
                                    This season hasn&apos;t started yet — there&apos;s nothing to score.
                                </p>
                            )}

                            <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
                                {scorecard.scores.map((score) => (
                                    <ScoreRow key={score.key} score={score} />
                                ))}
                            </ul>
                        </section>

                        <div className="space-y-4 lg:sticky lg:top-6">
                            {season.intent.length > 0 && (
                                <section className={`${PANEL} p-5`}>
                                    <p className={OVERLINE}>What it was for</p>
                                    <ul className="mt-3 space-y-3">
                                        {season.intent.map((intent) => (
                                            <li key={intent.pillar} className="flex items-start gap-3">
                                                <PillarTile pillar={intent.pillar} size="sm" />
                                                <div className="min-w-0">
                                                    <p className="text-[13px] text-neutral-500">
                                                        {LIFE_PILLAR_LABELS[intent.pillar]}
                                                    </p>
                                                    <p className="text-[15px] text-neutral-900">{intent.text}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            <section className={`${PANEL} p-5`}>
                                <h3 className="text-base font-semibold tracking-[-0.01em] text-neutral-900">Retro</h3>
                                <p className="mt-0.5 text-[13px] text-neutral-500">
                                    The part the numbers can&apos;t tell you.
                                </p>
                                <div className="mt-4 space-y-4">
                                    <div>
                                        <p className="mb-1.5 text-[13px] font-medium text-neutral-700">How did it go?</p>
                                        <Rating value={rating} onChange={setRating} />
                                    </div>
                                    <Textarea
                                        label="Notes"
                                        rows={6}
                                        placeholder="What worked, what didn't, what the next season should do differently."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-xs text-neutral-500">
                                            {season.review?.reviewedAt
                                                ? `Last saved ${season.review.reviewedAt}`
                                                : 'Not saved yet'}
                                        </p>
                                        <Button
                                            onClick={() =>
                                                onSave({
                                                    notes: notes.trim() ? notes.trim() : undefined,
                                                    rating: rating > 0 ? rating : undefined,
                                                })
                                            }
                                            disabled={saving || (!!season.review && !dirty)}
                                        >
                                            {saving ? 'Saving…' : 'Save retro'}
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    </div>
                )
            )}
        </div>
    )
}
