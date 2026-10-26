const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A filter on a `date` field from optional `from` / `to` query params
 * (YYYY-MM-DD, both inclusive). Anything missing or malformed is ignored, so a
 * plain list request still gets everything.
 */
export function dateRangeFilter(query: { from?: unknown; to?: unknown }): {
    date?: { $gte?: string; $lte?: string }
} {
    const from = typeof query.from === 'string' && DATE_KEY.test(query.from) ? query.from : null
    const to = typeof query.to === 'string' && DATE_KEY.test(query.to) ? query.to : null
    if (!from && !to) return {}
    return { date: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } }
}
