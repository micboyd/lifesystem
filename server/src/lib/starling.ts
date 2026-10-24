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

// Starling rate-limits per token. A 429 is retried after the wait it asks for
// (Retry-After), capped so a request never hangs for long.
const MAX_RATE_LIMIT_RETRIES = 3
const MAX_RETRY_WAIT_MS = 8_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * @param deadline epoch ms the caller must answer by. Retries never wait past it,
 *   so a slow Starling can't push a request beyond the host's own timeout
 *   (Heroku drops anything over 30s).
 */
async function request<T>(path: string, deadline?: number): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try {
            // Never let one call run past the deadline either (plus a little grace to answer).
            const timeout = deadline !== undefined ? Math.max(2_000, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now() + 5_000)) : REQUEST_TIMEOUT_MS
            return await requestOnce<T>(path, timeout)
        } catch (err) {
            const wait = err instanceof RateLimited ? Math.min(MAX_RETRY_WAIT_MS, err.waitMs * (attempt + 1)) : 0
            const outOfTime = deadline !== undefined && Date.now() + wait > deadline
            if (!(err instanceof RateLimited) || attempt >= MAX_RATE_LIMIT_RETRIES || outOfTime) {
                throw err instanceof RateLimited
                    ? new StarlingError(`Starling is rate-limiting requests right now - try again in a minute (on ${path})`, 429)
                    : err
            }
            await sleep(wait)
        }
    }
}

class RateLimited extends Error {
    constructor(readonly waitMs: number) {
        super('rate limited')
    }
}

async function requestOnce<T>(path: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
    if (!starlingConfigured()) {
        throw new StarlingError('Starling access token is not configured', 501)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
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
        if (res.status === 429) {
            const after = Number(res.headers.get('retry-after'))
            throw new RateLimited(Number.isFinite(after) && after > 0 ? after * 1000 : 1_500)
        }
        if (!res.ok) {
            const body = await res.text().catch(() => '')
            const rejected = res.status === 401 || res.status === 403
            throw new StarlingError(
                `${rejected ? 'Starling rejected the access token (expired, revoked or missing scopes) - ' : ''}Starling API ${res.status} on ${path}${body ? `: ${body.slice(0, 200)}` : ''}`,
                502
            )
        }
        return (await res.json()) as T
    } catch (err) {
        if (err instanceof StarlingError || err instanceof RateLimited) throw err
        if (err instanceof Error && err.name === 'AbortError') {
            throw new StarlingError('Starling API request timed out', 504)
        }
        throw new StarlingError('Could not reach the Starling API', 502)
    } finally {
        clearTimeout(timer)
    }
}

interface StarlingAccount {
    accountUid: string
    /** The category the main balance's own transactions are booked against. */
    defaultCategory: string
}

// The account rarely changes within a process, so remember it after the first look-up.
let cachedAccount: StarlingAccount | null = null

async function getPrimaryAccount(): Promise<StarlingAccount> {
    if (cachedAccount) return cachedAccount

    const data = await request<{ accounts: StarlingAccount[] }>('/api/v2/accounts')
    const wanted = process.env.STARLING_ACCOUNT_UID
    const account = wanted
        ? data.accounts?.find((a) => a.accountUid === wanted)
        : data.accounts?.[0]
    if (!account) throw new StarlingError('No Starling accounts found for this token', 502)
    cachedAccount = account
    return account
}

/** The account whose spaces/feed we read — env override, else the first account. */
export async function getPrimaryAccountUid(): Promise<string> {
    if (process.env.STARLING_ACCOUNT_UID) return process.env.STARLING_ACCOUNT_UID
    return (await getPrimaryAccount()).accountUid
}

/** The main balance as a feed source, so it can be read like any space. */
export async function getMainAccountSource(): Promise<{ id: string; name: string }> {
    return { id: (await getPrimaryAccount()).defaultCategory, name: 'Main account' }
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

const SPACES_CACHE_MS = 5 * 60_000
let spacesCache: { at: number; data: StarlingSpace[] } | null = null

/** listSpaces, remembered for a few minutes. For reads that don't need live balances. */
export async function listSpacesCached(): Promise<StarlingSpace[]> {
    if (spacesCache && Date.now() - spacesCache.at < SPACES_CACHE_MS) return spacesCache.data
    const data = await listSpaces()
    spacesCache = { at: Date.now(), data }
    return data
}

/**
 * The account's balance right now, in £: the main balance on its own, and the
 * total with every space and savings goal included. "Effective" counts pending
 * card payments, which is what's really there to spend.
 */
export async function getAccountBalance(): Promise<{ main: number; total: number }> {
    const accountUid = await getPrimaryAccountUid()
    const data = await request<{
        effectiveBalance?: { minorUnits: number }
        totalEffectiveBalance?: { minorUnits: number }
    }>(`/api/v2/accounts/${accountUid}/balance`)
    const main = minorToMajor(data.effectiveBalance?.minorUnits ?? 0)
    return { main, total: data.totalEffectiveBalance ? minorToMajor(data.totalEffectiveBalance.minorUnits) : main }
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
    maxTransactionTimestamp: string,
    /** Epoch ms to give up retrying by; see `request`. */
    deadline?: number
): Promise<StarlingFeedItem[]> {
    const accountUid = await getPrimaryAccountUid()
    const params = new URLSearchParams({ minTransactionTimestamp, maxTransactionTimestamp })
    const data = await request<{ feedItems: StarlingFeedItem[] }>(
        `/api/v2/feed/account/${accountUid}/category/${categoryUid}/transactions-between?${params}`,
        deadline
    )
    return data.feedItems ?? []
}

export { StarlingError, minorToMajor }
