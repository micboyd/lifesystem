/**
 * The three phases every conditioning session and strength workout is built
 * from: a warm-up, the main session, and a cool-down. Each is its own ordered
 * list on the document, so a session always reads in that order and nothing can
 * sit between phases.
 */

export const SESSION_PHASES = ['warmUp', 'main', 'coolDown'] as const
export type SessionPhase = (typeof SESSION_PHASES)[number]

export type Phased<T> = Record<SessionPhase, T[]>

/**
 * Read a phase name as a person or an LLM might write it — "warmUp",
 * "Warm-up", "warm up", "Main session", "cooldown" — or undefined.
 */
export function toPhase(raw: unknown): SessionPhase | undefined {
    if (typeof raw !== 'string') return undefined
    const k = raw.toLowerCase().replace(/[^a-z]/g, '')
    if (k === 'warmup') return 'warmUp'
    if (k === 'cooldown') return 'coolDown'
    if (k === 'main' || k === 'mainsession' || k === 'mainset') return 'main'
    return undefined
}

/**
 * Split an imported document's items into phases. The phased form —
 * `{ warmUp: [...], main: [...], coolDown: [...] }` — is read as written. A flat
 * `legacyKey` list (the old `parts` / `exercises`) is still accepted: each item
 * lands in the phase its own `phase` field names, or its name when that is a
 * phase (the old "Warm-up" / "Cool-down" parts), else in the main session.
 */
export function readPhased(doc: Record<string, unknown>, legacyKey: string): Phased<unknown> {
    const out: Phased<unknown> = { warmUp: [], main: [], coolDown: [] }
    const phased = SESSION_PHASES.some((p) => Array.isArray(doc[p]))
    if (phased) {
        for (const p of SESSION_PHASES) if (Array.isArray(doc[p])) out[p] = doc[p] as unknown[]
        return out
    }
    const flat = doc[legacyKey]
    if (!Array.isArray(flat)) return out
    for (const item of flat) {
        const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : null
        const tagged = o ? (toPhase(o.phase) ?? toPhase(o.name)) : undefined
        out[tagged ?? 'main'].push(item)
    }
    return out
}

/**
 * The phases a partial update actually sent, so saving just the warm-up leaves
 * the main session alone. A flat legacy list replaces all three.
 */
export function sentPhases(doc: Record<string, unknown>, legacyKey: string): SessionPhase[] {
    if (SESSION_PHASES.some((p) => Array.isArray(doc[p])))
        return SESSION_PHASES.filter((p) => Array.isArray(doc[p]))
    return Array.isArray(doc[legacyKey]) ? [...SESSION_PHASES] : []
}

/** Normalise each phase's raw list with `fn`. */
export function mapPhases<S, T>(raw: Phased<S>, fn: (list: S[]) => T[]): Phased<T> {
    return { warmUp: fn(raw.warmUp), main: fn(raw.main), coolDown: fn(raw.coolDown) }
}

/** Same, for async normalisers (resolving exercise ids). */
export async function mapPhasesAsync<S, T>(
    raw: Phased<S>,
    fn: (list: S[]) => Promise<T[]>
): Promise<Phased<T>> {
    const [warmUp, main, coolDown] = await Promise.all([
        fn(raw.warmUp),
        fn(raw.main),
        fn(raw.coolDown),
    ])
    return { warmUp, main, coolDown }
}

/** Every item in session order, each tagged with its phase. */
export function flattenPhases<T>(doc: Partial<Phased<T>>): { phase: SessionPhase; item: T }[] {
    return SESSION_PHASES.flatMap((phase) => (doc[phase] ?? []).map((item) => ({ phase, item })))
}
