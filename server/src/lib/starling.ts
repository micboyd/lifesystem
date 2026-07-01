// Thin client for the Starling Bank public API.
//
// A Starling "Space" (spending space or savings goal) is internally a category,
// and every card transaction made from a spending space is booked against that
// space's categoryUid. We read those transactions and mirror the money-out ones
// into budget rows — no money ever moves, this is read-only.
//
// Auth is a single Personal Access Token in the server env (single-user app).

// `|| ` (not `??`) so an empty STARLING_API_BASE= in .env falls back to prod.
const REQUEST_TIMEOUT_MS = 15_000

// Read env lazily, not at module load: this file is imported (via the route
// chain) before index.ts calls dotenv.config(), so capturing these in top-level
// consts would freeze them to `undefined`. Functions read the current value.
function token(): string | undefined {
    return process.env.STARLING_ACCESS_TOKEN
}

// `|| ` (not `??`) so an empty STARLING_API_BASE= in .env falls back to prod.
function apiBase(): string {
    return process.env.STARLING_API_BASE || 'https://api.starlingbank.com'
}

export function starlingConfigured(): boolean {
    const t = token()
    return typeof t === 'string' && t.trim().length > 0
}

/** A normalised Space the client can pick from when linking a budget. */
export interface StarlingSpace {
    /** The categoryUid the transaction feed is filtered by. */
    id: string
    name: string
    type: 'spending' | 'savings'
    /** Balance in major units (£), for display only. */
    balance: number
    currency: string
}

/** A single money-out (or money-in) item on a Space's feed. */
export interface StarlingFeedItem {
    feedItemUid: string
    categoryUid: string
    direction: 'IN' | 'OUT'
    amount: { currency: string; minorUnits: number }
    transactionTime: string
    counterPartyName?: string
    reference?: string
    status: string
    spendingCategory?: string
    /** How the money moved, e.g. MASTER_CARD, FASTER_PAYMENT_OUT, INTERNAL_TRANSFER. */
    source?: string
    /** Who was on the other side, e.g. MERCHANT, PAYEE, CATEGORY (a space top-up/withdrawal). */
    counterPartyType?: string
}

class StarlingError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message)
        this.name = 'StarlingError'
    }
}

async function request<T>(path: string): Promise<T> {
    if (!starlingConfigured()) {
        throw new StarlingError('Starling access token is not configured', 501)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        const res = await fetch(`${apiBase()}${path}`, {
            headers: {
                Authorization: `Bearer ${token()}`,
                Accept: 'application/json',
                // Starling requires a User-Agent on public API calls.
                'User-Agent': 'lifesystem',
            },
            signal: controller.signal,
        })
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            throw new StarlingError(
                `Starling API ${res.status} on ${path}${body ? `: ${body.slice(0, 200)}` : ''}`,
                res.status === 401 || res.status === 403 ? 502 : 502
            )
        }
        return (await res.json()) as T
    } catch (err) {
        if (err instanceof StarlingError) throw err
        if (err instanceof Error && err.name === 'AbortError') {
            throw new StarlingError('Starling API request timed out', 504)
        }
        throw new StarlingError('Could not reach the Starling API', 502)
    } finally {
        clearTimeout(timer)
    }
}

// The account rarely changes within a process, so remember it after the first look-up.
let cachedAccountUid: string | null = null

/** The account whose spaces/feed we read — env override, else the first account. */
export async function getPrimaryAccountUid(): Promise<string> {
    if (process.env.STARLING_ACCOUNT_UID) return process.env.STARLING_ACCOUNT_UID
    if (cachedAccountUid) return cachedAccountUid

    const data = await request<{ accounts: { accountUid: string }[] }>('/api/v2/accounts')
    const accountUid = data.accounts?.[0]?.accountUid
    if (!accountUid) throw new StarlingError('No Starling accounts found for this token', 502)
    cachedAccountUid = accountUid
    return accountUid
}

function minorToMajor(minorUnits: number): number {
    return Math.round(minorUnits) / 100
}

/** List all spaces (spending + savings) so a budget can be linked to one. */
export async function listSpaces(): Promise<StarlingSpace[]> {
    const accountUid = await getPrimaryAccountUid()
    const data = await request<{
        savingsGoals?: {
            savingsGoalUid: string
            name: string
            totalSaved?: { currency: string; minorUnits: number }
        }[]
        spendingSpaces?: {
            spaceUid: string
            name: string
            balance?: { currency: string; minorUnits: number }
        }[]
    }>(`/api/v2/account/${accountUid}/spaces`)

    const spending: StarlingSpace[] = (data.spendingSpaces ?? []).map((s) => ({
        id: s.spaceUid,
        name: s.name,
        type: 'spending',
        balance: minorToMajor(s.balance?.minorUnits ?? 0),
        currency: s.balance?.currency ?? 'GBP',
    }))
    const savings: StarlingSpace[] = (data.savingsGoals ?? []).map((s) => ({
        id: s.savingsGoalUid,
        name: s.name,
        type: 'savings',
        balance: minorToMajor(s.totalSaved?.minorUnits ?? 0),
        currency: s.totalSaved?.currency ?? 'GBP',
    }))

    // Spending spaces first — they're the ones with cards, the common case here.
    return [...spending, ...savings]
}

/** Current balance of a single Space, for the reconciliation check. */
export async function getSpaceBalance(categoryUid: string): Promise<number | null> {
    const spaces = await listSpaces()
    return spaces.find((s) => s.id === categoryUid)?.balance ?? null
}

/**
 * Feed items for a Space between two instants (inclusive of min, exclusive of max).
 * `minTransactionTimestamp`/`maxTransactionTimestamp` are ISO-8601 strings.
 */
export async function getFeedBetween(
    categoryUid: string,
    minTransactionTimestamp: string,
    maxTransactionTimestamp: string
): Promise<StarlingFeedItem[]> {
    const accountUid = await getPrimaryAccountUid()
    const params = new URLSearchParams({ minTransactionTimestamp, maxTransactionTimestamp })
    const data = await request<{ feedItems: StarlingFeedItem[] }>(
        `/api/v2/feed/account/${accountUid}/category/${categoryUid}/transactions-between?${params}`
    )
    return data.feedItems ?? []
}

export { StarlingError, minorToMajor }
