import { useEffect, useState } from 'react'
import Button from '../Button'
import Select from '../Select'
import Textarea from '../Textarea'
import Rating from '../Rating'
import Alert from '../Alert'
import Progress from '../Progress'
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

/** A scored row, or a plain statement when there was nothing to measure. */
function ScoreRow({ score }: { score: PillarScore }) {
    return (
        <div className="flex items-center gap-3 border-t border-neutral-100 py-3 first:border-t-0">
            <i
                className={`fa-solid ${SCORE_ICONS[score.key]} w-4 shrink-0 text-center text-xs text-neutral-300`}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-sm font-bold text-neutral-900">{SCORE_LABELS[score.key]}</p>
                    {score.score === null ? (
                        <span className="shrink-0 text-xs text-neutral-300">Not scored</span>
                    ) : (
                        <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">
                            {score.score}%
                        </span>
                    )}
                </div>
                <p className="text-xs text-neutral-500">{score.headline}</p>
                {score.detail && (
                    <p className="text-xs font-semibold text-neutral-400">{score.detail}</p>
                )}
                {score.score !== null && (
                    <Progress
                        value={score.score}
                        variant={score.score >= 80 ? 'success' : 'default'}
                        className="mt-2"
                    />
                )}
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

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold tracking-tight text-neutral-950">Review</h2>
                    <p className="text-sm text-neutral-500">
                        Scored from what you already logged — no new data entry.
                    </p>
                </div>
                <Select
                    label="Season"
                    className="min-w-[14rem]"
                    options={plan.seasons.map((s) => ({
                        value: s._id,
                        label: `${s.name} · ${formatMonthRange(s.startMonth, s.endMonth)}`,
                    }))}
                    value={seasonId ?? undefined}
                    onChange={onSelectSeason}
                />
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                season &&
                scorecard && (
                    <>
                        <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="truncate text-base font-bold text-neutral-950">
                                        {season.name}
                                    </h3>
                                    <p className="text-xs font-semibold text-neutral-400">
                                        {formatMonthRange(season.startMonth, season.endMonth)} ·{' '}
                                        {scorecard.complete
                                            ? `${scorecard.totalDays} days, finished`
                                            : `day ${scorecard.elapsedDays} of ${scorecard.totalDays}`}
                                    </p>
                                </div>
                                {overall !== null && (
                                    <div className="text-right">
                                        <p className="text-3xl font-bold tabular-nums tracking-tight text-neutral-950">
                                            {overall}%
                                        </p>
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                            Overall
                                        </p>
                                    </div>
                                )}
                            </div>

                            {!scorecard.complete && scorecard.elapsedDays > 0 && (
                                <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                                    This season is still running, so it&apos;s scored on the days that
                                    have elapsed rather than the whole window.
                                </p>
                            )}
                            {scorecard.elapsedDays === 0 && (
                                <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                                    This season hasn&apos;t started yet — there&apos;s nothing to score.
                                </p>
                            )}

                            {season.intent.length > 0 && (
                                <div className="mt-4 space-y-1.5 border-t border-neutral-100 pt-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                        What it was for
                                    </p>
                                    {season.intent.map((intent) => (
                                        <p key={intent.pillar} className="text-sm text-neutral-600">
                                            <span className="font-semibold text-neutral-500">
                                                {LIFE_PILLAR_LABELS[intent.pillar]}
                                            </span>{' '}
                                            — {intent.text}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 border-t border-neutral-100 pt-2">
                                {scorecard.scores.map((score) => (
                                    <ScoreRow key={score.key} score={score} />
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
                            <h3 className="text-base font-bold text-neutral-950">Retro</h3>
                            <p className="mt-1 text-sm text-neutral-500">
                                The part the numbers can&apos;t tell you.
                            </p>
                            <div className="mt-4 space-y-4">
                                <div>
                                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        How did it go?
                                    </p>
                                    <Rating value={rating} onChange={setRating} />
                                </div>
                                <Textarea
                                    label="Notes"
                                    rows={5}
                                    placeholder="What worked, what didn't, what the next season should do differently."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button
                                        onClick={() =>
                                            onSave({
                                                notes: notes.trim() ? notes.trim() : undefined,
                                                rating: rating > 0 ? rating : undefined,
                                            })
                                        }
                                        disabled={saving}
                                    >
                                        {saving ? 'Saving…' : 'Save retro'}
                                    </Button>
                                    {season.review?.reviewedAt && (
                                        <p className="text-xs text-neutral-400">
                                            Last saved {season.review.reviewedAt}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )
            )}
        </div>
    )
}
