import { useEffect, useState } from 'react'
import Spinner from './Spinner'
import SimpleActivityLog, { type ActivityLogConfig } from './SimpleActivityLog'
import { listMobility } from '../services/mobility'
import { listLogs, createLog, updateLog, deleteLog } from '../services/mobilityLogs'
import type { Mobility } from '../types'

/** The Records view for Mobility: a log of completed routines. */
export default function MobilityRecordsLog() {
    const [library, setLibrary] = useState<Mobility[] | null>(null)

    useEffect(() => {
        listMobility().then(setLibrary)
    }, [])

    if (!library) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const config: ActivityLogConfig = {
        library: library.map((m) => ({ _id: m._id, name: m.name, duration: m.duration })),
        listLogs,
        createLog: (mobility, fields) => createLog({ mobility, ...fields }),
        updateLog,
        deleteLog,
        noun: 'routine',
        pickerLabel: 'Routine *',
        icon: 'fa-solid fa-person-walking',
        emptyLibraryTitle: 'No routines to log',
        emptyLibraryDescription:
            'Add a routine to your Mobility library first, then record it here once completed.',
        emptyLogsTitle: 'No routines logged yet',
        emptyLogsDescription: 'Completed a mobility routine? Record it to build your history.',
    }

    return <SimpleActivityLog config={config} />
}
