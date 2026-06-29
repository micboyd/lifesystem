import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Lightweight in-app pub/sub for keeping independent widgets coherent.
 *
 * A component that mutates data calls `invalidate('budget')`; any component that
 * reads that data calls `useDataVersion('budget')` and puts the result in its
 * fetch effect's dependency array, so it refetches when the data changes
 * elsewhere in the app. This is single-tab reactivity — true cross-device sync
 * would need server push (SSE/WebSockets).
 */
export type SyncTopic =
    | 'tasks'
    | 'habits'
    | 'timeboxes'
    | 'budget'
    | 'events'
    | 'dayStatus'
    | 'reminders'

interface DataSyncValue {
    versions: Record<string, number>
    invalidate: (...topics: SyncTopic[]) => void
}

const DataSyncContext = createContext<DataSyncValue | undefined>(undefined)

export function DataSyncProvider({ children }: { children: ReactNode }) {
    const [versions, setVersions] = useState<Record<string, number>>({})

    const invalidate = useCallback((...topics: SyncTopic[]) => {
        setVersions((prev) => {
            const next = { ...prev }
            for (const topic of topics) next[topic] = (next[topic] ?? 0) + 1
            return next
        })
    }, [])

    const value = useMemo(() => ({ versions, invalidate }), [versions, invalidate])
    return <DataSyncContext.Provider value={value}>{children}</DataSyncContext.Provider>
}

function useDataSync(): DataSyncValue {
    const ctx = useContext(DataSyncContext)
    if (!ctx) throw new Error('useDataSync must be used within a DataSyncProvider')
    return ctx
}

/** Returns a function to broadcast that one or more data topics have changed. */
export function useInvalidate(): (...topics: SyncTopic[]) => void {
    return useDataSync().invalidate
}

/**
 * Returns a number that changes whenever any of the given topics is invalidated.
 * Drop it into a fetch effect's dependency array to refetch on external changes.
 */
export function useDataVersion(...topics: SyncTopic[]): number {
    const { versions } = useDataSync()
    return topics.reduce((sum, topic) => sum + (versions[topic] ?? 0), 0)
}
