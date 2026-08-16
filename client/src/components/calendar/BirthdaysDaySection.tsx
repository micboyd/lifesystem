import { Link } from 'react-router-dom'
import type { Birthday } from '../../types'

/**
 * The birthdays falling on a single calendar day, listed for the calendar's
 * birthdays drawer. Read-only — adding and editing lives on the Birthdays page.
 */
export default function BirthdaysDaySection({ birthdays }: { birthdays: Birthday[] }) {
    return (
        <div className="flex flex-col gap-4">
            {birthdays.length === 0 ? (
                <p className="text-sm text-neutral-500">No birthdays on this day.</p>
            ) : (
                <ul className="divide-y divide-neutral-100">
                    {birthdays.map((b) => (
                        <li key={b._id} className="flex items-center gap-3 py-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-pink-100 text-sm text-pink-600">
                                <i className="fa-solid fa-cake-candles" aria-hidden="true" />
                            </span>
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
                                {b.name}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            <Link
                to="/birthdays"
                className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
            >
                <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                Manage birthdays
            </Link>
        </div>
    )
}
