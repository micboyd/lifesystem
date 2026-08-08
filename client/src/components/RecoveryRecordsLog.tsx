import { useEffect, useState } from 'react'
import Spinner from './Spinner'
import SimpleActivityLog, { type ActivityLogConfig } from './SimpleActivityLog'
import { listRecovery } from '../services/recovery'
import { listLogs, createLog, updateLog, deleteLog } from '../services/recoveryLogs'
import type { Recovery } from '../types'

/** The Records view for Recovery: a log of completed recovery items. */
export default function RecoveryRecordsLog() {
    const [library, setLibrary] = useState<Recovery[] | null>(null)

    useEffect(() => {
        listRecovery().then(setLibrary)
    }, [])

    if (!library) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const config: ActivityLogConfig = {
        library: library.map((r) => ({ _id: r._id, name: r.name, duration: r.duration })),
        listLogs,
        createLog: (recovery, fields) => createLog({ recovery, ...fields }),
        updateLog,
        deleteLog,
        noun: 'recovery item',
        pickerLabel: 'Recovery item *',
        icon: 'fa-solid fa-spa',
        emptyLibraryTitle: 'No recovery to log',
        emptyLibraryDescription:
            'Add an item to your Recovery library first, then record it here once completed.',
        emptyLogsTitle: 'No recovery logged yet',
        emptyLogsDescription: 'Done some recovery? Record it to build your history.',
    }

    return <SimpleActivityLog config={config} />
}
