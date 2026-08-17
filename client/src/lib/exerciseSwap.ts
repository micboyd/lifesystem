import type { Exercise } from '../types'

/**
 * Picking a stand-in when the machine you wanted is occupied.
 *
 * A swap is only useful if it trains the same thing — so candidates must share
 * the target's muscle group — and only *practical* if it doesn't need the kit
 * you're already queuing for, so a different piece of equipment scores better
 * than the same one. An exercise can carry both tags explicitly; when it
 * doesn't, they're inferred from its name and description, which means an
 * untagged library still gives sensible answers on day one.
 */

export const MUSCLE_GROUPS = [
    'Chest',
    'Back',
    'Shoulders',
    'Biceps',
    'Triceps',
    'Quads',
    'Hamstrings',
    'Glutes',
    'Calves',
    'Core',
    'Full body',
] as const

export const EQUIPMENT = [
    'Machine',
    'Smith machine',
    'Cable',
    'Barbell',
    'Dumbbell',
    'Kettlebell',
    'Band',
    'Bodyweight',
] as const

/** Kit that is a fixed station — the stuff you end up waiting for. */
const STATIONS = new Set<string>(['Machine', 'Smith machine', 'Cable'])

/**
 * Keyword rules, checked in order so the specific beats the general — "romanian
 * deadlift" must be read as hamstrings before plain "deadlift" claims it for
 * back, and "leg curl" as hamstrings before "curl" claims it for biceps.
 */
const MUSCLE_RULES: [string, string[]][] = [
    ['Calves', ['calf', 'calve', 'soleus', 'tibialis']],
    ['Hamstrings', ['leg curl', 'hamstring', 'romanian deadlift', 'rdl', 'stiff leg', 'good morning', 'nordic', 'ham curl']],
    ['Quads', ['leg extension', 'leg press', 'hack squat', 'front squat', 'split squat', 'bulgarian', 'lunge', 'step up', 'quad', 'squat']],
    ['Glutes', ['hip thrust', 'glute', 'hip bridge', 'abduction', 'kickback']],
    ['Triceps', ['tricep', 'skull crusher', 'pushdown', 'push down', 'close grip', 'overhead extension']],
    ['Biceps', ['bicep', 'preacher', 'hammer curl', 'curl']],
    ['Shoulders', ['lateral raise', 'front raise', 'rear delt', 'face pull', 'upright row', 'overhead press', 'shoulder press', 'military press', 'arnold', 'delt', 'shoulder']],
    ['Chest', ['bench press', 'chest', 'pec', 'push up', 'press up', 'fly', 'flye', 'dip']],
    ['Back', ['pulldown', 'pull down', 'pull up', 'chin up', 'lat', 'row', 'shrug', 'back extension', 'deadlift', 'pullover']],
    ['Core', ['plank', 'crunch', 'sit up', 'russian twist', 'leg raise', 'oblique', 'hollow', 'dead bug', 'pallof', 'ab wheel', 'ab', 'core']],
    ['Full body', ['burpee', 'thruster', 'clean', 'snatch', 'turkish get up', 'farmer', 'sled']],
]

const EQUIPMENT_RULES: [string, string[]][] = [
    ['Smith machine', ['smith']],
    ['Cable', ['cable', 'pulldown', 'pull down', 'pushdown', 'push down', 'crossover', 'rope', 'pulley']],
    ['Machine', ['machine', 'leg press', 'leg extension', 'leg curl', 'pec deck', 'hack squat', 'selectorised', 'selectorized', 'hammer strength', 'pendulum', 'seated row']],
    ['Barbell', ['barbell', 'bench press', 'deadlift', 'back squat', 'front squat', 'overhead press', 'military press', 'landmine', 'ez bar']],
    ['Dumbbell', ['dumbbell', 'db', 'goblet']],
    ['Kettlebell', ['kettlebell', 'kb']],
    ['Band', ['band', 'resistance band']],
    ['Bodyweight', ['bodyweight', 'push up', 'press up', 'pull up', 'chin up', 'dip', 'plank', 'crunch', 'sit up', 'burpee', 'nordic']],
]

/** Words too common across the library to say anything about relatedness. */
const STOPWORDS = new Set([
    'the', 'a', 'and', 'or', 'to', 'of', 'for', 'with', 'on', 'in', 'up', 'down',
    'exercise', 'movement', 'seated', 'standing', 'single', 'double', 'alternating',
    'left', 'right', 'one', 'two', 'arm', 'leg', 'wide', 'close', 'grip', 'incline',
    'decline', 'flat', 'heavy', 'light',
])

/**
 * Strip a trailing plural 's' so "pull-ups" and "pull up" compare equal. The
 * threshold has to reach three-letter words — "ups", "abs", "dips" all carry
 * meaning — while "press" and other "ss" endings must survive intact or no
 * equipment keyword would ever match.
 */
function singular(word: string): string {
    if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
        return word.slice(0, -1)
    }
    return word
}

/** Split text into lowercase singular words. */
export function tokenise(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean)
        .map(singular)
}

/** Tokenised text padded with spaces, so keywords match on word boundaries. */
function haystack(text: string): string {
    return ` ${tokenise(text).join(' ')} `
}

/** The first rule whose keywords appear in the text, or undefined. */
function firstMatch(rules: [string, string[]][], text: string): string | undefined {
    const hay = haystack(text)
    for (const [label, keywords] of rules) {
        for (const keyword of keywords) {
            if (hay.includes(` ${tokenise(keyword).join(' ')} `)) return label
        }
    }
    return undefined
}

/** Guess the muscle group from an exercise's name, falling back to its description. */
export function inferMuscleGroup(exercise: Pick<Exercise, 'name' | 'description'>): string | undefined {
    return (
        firstMatch(MUSCLE_RULES, exercise.name) ??
        firstMatch(MUSCLE_RULES, exercise.description ?? '')
    )
}

/** Guess the equipment from an exercise's name, falling back to its description. */
export function inferEquipment(exercise: Pick<Exercise, 'name' | 'description'>): string | undefined {
    return (
        firstMatch(EQUIPMENT_RULES, exercise.name) ??
        firstMatch(EQUIPMENT_RULES, exercise.description ?? '')
    )
}

/** An exercise's tags: whatever was set explicitly, otherwise what we can infer. */
export interface ExerciseTags {
    muscleGroup?: string
    equipment?: string
    /** True when the value came from the record rather than from a guess. */
    taggedGroup: boolean
    taggedEquipment: boolean
}

/** The shape resolveTags needs — a whole Exercise, or an in-progress form draft. */
type Taggable = Pick<Exercise, 'name' | 'description'> &
    Partial<Pick<Exercise, 'muscleGroup' | 'equipment'>>

export function resolveTags(exercise: Taggable): ExerciseTags {
    const group = exercise.muscleGroup?.trim() || ''
    const equip = exercise.equipment?.trim() || ''
    return {
        muscleGroup: group || inferMuscleGroup(exercise),
        equipment: equip || inferEquipment(exercise),
        taggedGroup: !!group,
        taggedEquipment: !!equip,
    }
}

/** Meaningful name words, used as a weak tie-break between same-group options. */
function contentWords(exercise: Exercise): Set<string> {
    return new Set(tokenise(exercise.name).filter((w) => !STOPWORDS.has(w)))
}

const SAME_GROUP = 100
const DIFFERENT_KIT = 30
const SAME_KIT = -15
/** A free weight beats another fixed station — nothing to queue for. */
const OFF_THE_STATION = 12
const PER_SHARED_WORD = 6
const MAX_SHARED_WORDS = 3

/** One ranked alternative for a busy exercise. */
export interface SwapOption {
    exercise: Exercise
    muscleGroup?: string
    equipment?: string
    score: number
    /** Short rationale to show under the name, e.g. "Same chest work · Dumbbell". */
    reason: string
    /** The target needs a fixed station and this doesn't — likely to be free. */
    avoidsStation: boolean
}

/**
 * Rank library alternatives to `target`, best first.
 *
 * Candidates that train a different muscle group are dropped outright — a swap
 * that changes what the session trains isn't a swap. When a group can't be
 * determined for either side we fall back to name overlap, which still surfaces
 * the obvious pairs ("incline dumbbell press" for "incline bench press") without
 * inventing a relationship that isn't there.
 */
export function rankSwaps(
    target: Exercise,
    library: Exercise[],
    options: {
        /** Exercises already in this session — swapping into one is no help. */
        excludeIds?: Iterable<string>
        limit?: number
    } = {}
): SwapOption[] {
    const excluded = new Set(options.excludeIds ?? [])
    const targetTags = resolveTags(target)
    const targetWords = contentWords(target)
    const targetOnStation = !!targetTags.equipment && STATIONS.has(targetTags.equipment)

    const ranked: SwapOption[] = []

    for (const candidate of library) {
        if (candidate._id === target._id || excluded.has(candidate._id)) continue

        const tags = resolveTags(candidate)
        const shared = [...contentWords(candidate)].filter((w) => targetWords.has(w)).length

        let score: number
        if (targetTags.muscleGroup && tags.muscleGroup) {
            if (targetTags.muscleGroup !== tags.muscleGroup) continue
            score = SAME_GROUP
        } else {
            // Nothing to match on but the name — only offer a genuine echo of it.
            if (shared === 0) continue
            score = 0
        }

        const avoidsStation = targetOnStation && !!tags.equipment && !STATIONS.has(tags.equipment)

        if (targetTags.equipment && tags.equipment) {
            score += targetTags.equipment === tags.equipment ? SAME_KIT : DIFFERENT_KIT
        }
        if (avoidsStation) score += OFF_THE_STATION
        score += Math.min(shared, MAX_SHARED_WORDS) * PER_SHARED_WORD

        if (score <= 0) continue

        ranked.push({
            exercise: candidate,
            muscleGroup: tags.muscleGroup,
            equipment: tags.equipment,
            score,
            reason: describe(targetTags, tags, avoidsStation),
            avoidsStation,
        })
    }

    // Highest score first; ties fall back to library order so the list is stable.
    ranked.sort((a, b) => b.score - a.score || a.exercise.order - b.exercise.order)
    return options.limit ? ranked.slice(0, options.limit) : ranked
}

/** The one-line "why this" shown beneath a candidate's name. */
function describe(target: ExerciseTags, candidate: ExerciseTags, avoidsStation: boolean): string {
    const parts: string[] = []
    if (target.muscleGroup && candidate.muscleGroup === target.muscleGroup) {
        parts.push(`Same ${candidate.muscleGroup.toLowerCase()} work`)
    } else {
        parts.push('Similar movement')
    }
    if (candidate.equipment) parts.push(candidate.equipment)
    if (avoidsStation) parts.push('nothing to queue for')
    return parts.join(' · ')
}
