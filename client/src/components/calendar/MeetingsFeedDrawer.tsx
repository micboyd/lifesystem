import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import { FIELD_ERROR_TEXT, FIELD_HINT, FIELD_LABEL } from '../fieldStyles'
import {
    deleteMeetingsFeed,
    setMeetingsFeed,
    syncMeetingsFeed,
    type MeetingsFeed,
} from '../../services/ical'

interface Props {
    open: boolean
    onClose: () => void
    feed: MeetingsFeed | null
    /** Called with the new feed state after anything that changes the imported meetings. */
    onChanged: (feed: MeetingsFeed) => void
}

function errorMessage(err: unknown, fallback: string): string {
    const msg = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message
    return typeof msg === 'string' && msg ? msg : fallback
}

/** "just now", "12 min ago", "3 h ago", or a date. */
export function syncedAgo(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return 'never'
    const mins = Math.round((now - new Date(iso).getTime()) / 60_000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins} min ago`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours} h ago`
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * Settings for the Google Calendar import: paste the calendar's secret iCal
 * address, see when it last synced, sync now, or remove it (which removes every
 * imported meeting). The address is never shown back in full.
 */
export default function MeetingsFeedDrawer({ open, onClose, feed, onChanged }: Props) {
    const [url, setUrl] = useState('')
    const [replacing, setReplacing] = useState(false)
    const [busy, setBusy] = useState<'save' | 'sync' | 'remove' | null>(null)
    const [error, setError] = useState('')
    const [confirmRemove, setConfirmRemove] = useState(false)
    const [note, setNote] = useState('')

    const connected = !!feed?.connected
    const showForm = !connected || replacing

    function reset() {
        setUrl('')
        setReplacing(false)
        setError('')
        setConfirmRemove(false)
        setNote('')
    }

    async function save() {
        if (!url.trim()) {
            setError('Paste the secret address first.')
            return
        }
        setBusy('save')
        setError('')
        try {
            const { status, result } = await setMeetingsFeed(url.trim())
            onChanged(status)
            setUrl('')
            setReplacing(false)
            setNote(`Imported ${result.total} ${result.total === 1 ? 'meeting' : 'meetings'}.`)
        } catch (err) {
            setError(errorMessage(err, 'Could not read that address. Please try again.'))
        } finally {
            setBusy(null)
        }
    }

    async function syncNow() {
        setBusy('sync')
        setError('')
        setNote('')
        try {
            const { status, result } = await syncMeetingsFeed()
            onChanged(status)
            if (result) {
                const bits = [`${result.total} ${result.total === 1 ? 'meeting' : 'meetings'}`]
                if (result.added) bits.push(`${result.added} new`)
                if (result.removed) bits.push(`${result.removed} removed`)
                setNote(`Synced · ${bits.join(' · ')}.`)
            }
        } catch (err) {
            setError(errorMessage(err, 'Sync failed. Please try again.'))
        } finally {
            setBusy(null)
        }
    }

    async function remove() {
        setBusy('remove')
        setError('')
        try {
            await deleteMeetingsFeed()
            onChanged({ connected: false })
            reset()
        } catch (err) {
            setError(errorMessage(err, 'Could not remove the feed. Please try again.'))
        } finally {
            setBusy(null)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={() => {
                reset()
                onClose()
            }}
            size="xl"
            title="Google meetings"
            footer={
                <Button
                    variant="ghost"
                    onClick={() => {
                        reset()
                        onClose()
                    }}
                >
                    Close
                </Button>
            }
        >
            <div className="flex flex-col gap-6">
                <p className="text-sm text-neutral-500">
                    Meetings from your Google Calendar show on a Meetings calendar here, read-only,
                    and count as clashes in the Fitness planner. It syncs when you open the calendar
                    (at most every 15 minutes) and covers a week back to 90 days ahead.
                </p>

                {connected && feed && (
                    <section className="flex flex-col gap-3 rounded-2xl bg-neutral-50 px-4 py-3.5">
                        <div className="flex items-start gap-3">
                            <span
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white text-xs text-neutral-700 ring-1 ring-neutral-200"
                                aria-hidden="true"
                            >
                                <i className="fa-solid fa-video" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p
                                    className="truncate text-sm font-medium text-neutral-900"
                                    title={feed.maskedUrl}
                                >
                                    {feed.maskedUrl}
                                </p>
                                <p className="mt-0.5 text-xs text-neutral-500">
                                    Synced {syncedAgo(feed.lastSyncedAt)} · {feed.lastCount ?? 0}{' '}
                                    {feed.lastCount === 1 ? 'meeting' : 'meetings'}
                                </p>
                            </div>
                        </div>
                        {feed.lastError && (
                            <p className={FIELD_ERROR_TEXT}>
                                <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                                Last sync failed: {feed.lastError}
                            </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                icon="fa-solid fa-rotate"
                                onClick={syncNow}
                                disabled={!!busy}
                            >
                                {busy === 'sync' ? 'Syncing…' : 'Sync now'}
                            </Button>
                            {!replacing && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                        setReplacing(true)
                                        setConfirmRemove(false)
                                    }}
                                    disabled={!!busy}
                                >
                                    Replace address
                                </Button>
                            )}
                            {confirmRemove ? (
                                <Button
                                    size="sm"
                                    variant="danger"
                                    icon="fa-solid fa-trash-can"
                                    onClick={remove}
                                    disabled={!!busy}
                                >
                                    {busy === 'remove'
                                        ? 'Removing…'
                                        : 'Remove feed and its meetings'}
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => setConfirmRemove(true)}
                                    disabled={!!busy}
                                >
                                    Remove
                                </Button>
                            )}
                        </div>
                    </section>
                )}

                {note && !error && <p className="text-sm text-neutral-700">{note}</p>}

                {showForm && (
                    <section className="flex flex-col gap-3">
                        <Input
                            label={
                                replacing ? 'New secret address' : 'Secret address in iCal format'
                            }
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value)
                                setError('')
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void save()
                            }}
                            error={error || undefined}
                        />
                        <div className="flex gap-2">
                            <Button onClick={save} disabled={!!busy}>
                                {busy === 'save' ? 'Importing…' : replacing ? 'Replace' : 'Connect'}
                            </Button>
                            {replacing && (
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setReplacing(false)
                                        setUrl('')
                                        setError('')
                                    }}
                                    disabled={!!busy}
                                >
                                    Cancel
                                </Button>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <p className={FIELD_LABEL}>Where to find it</p>
                            <p className={FIELD_HINT}>
                                Google Calendar on the web → Settings → pick your calendar under
                                “Settings for my calendars” → Integrate calendar → copy “Secret
                                address in iCal format”. Treat it like a password: anyone with it
                                can read your calendar. It is stored on the server and never shown
                                in full again.
                            </p>
                        </div>
                    </section>
                )}

                {!showForm && error && (
                    <p className={FIELD_ERROR_TEXT}>
                        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                        {error}
                    </p>
                )}
            </div>
        </Drawer>
    )
}
