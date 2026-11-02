import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Card, CardHeader, CardTitle, CardBody } from '../Card'
import Input from '../Input'
import Button from '../Button'
import Alert from '../Alert'
import Spinner from '../Spinner'
import ConfirmModal from '../ConfirmModal'
import {
    connectGarmin,
    disconnectGarmin,
    garminError,
    getGarminStatus,
    submitGarminMfa,
    type GarminStatus,
} from '../../services/garmin'

/**
 * Connect a Garmin account so conditioning sessions can go to the watch. The
 * password is sent once, over the app's own connection, and never stored:
 * the server keeps only Garmin's session tokens, encrypted. A second step
 * takes the code when Garmin asks for one (MFA).
 */
export default function GarminCard() {
    const [status, setStatus] = useState<GarminStatus | null>(null)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null)
    const [confirmDisconnect, setConfirmDisconnect] = useState(false)
    // Arriving from a "Connect Garmin" link (/profile#garmin) scrolls here.
    const anchor = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (window.location.hash === '#garmin') anchor.current?.scrollIntoView({ block: 'start' })
    }, [])

    function refresh() {
        getGarminStatus()
            .then(setStatus)
            .catch((err) => setMsg({ type: 'danger', text: garminError(err).message }))
    }
    useEffect(refresh, [])

    async function handleConnect(e: FormEvent) {
        e.preventDefault()
        setMsg(null)
        setBusy(true)
        try {
            const result = await connectGarmin(email.trim(), password)
            setPassword('')
            if (result === 'connected') setMsg({ type: 'success', text: 'Garmin connected.' })
            refresh()
        } catch (err) {
            setMsg({ type: 'danger', text: garminError(err).message })
        } finally {
            setBusy(false)
        }
    }

    async function handleMfa(e: FormEvent) {
        e.preventDefault()
        setMsg(null)
        setBusy(true)
        try {
            await submitGarminMfa(code.trim())
            setCode('')
            setMsg({ type: 'success', text: 'Garmin connected.' })
            refresh()
        } catch (err) {
            setMsg({ type: 'danger', text: garminError(err).message })
        } finally {
            setBusy(false)
        }
    }

    async function handleDisconnect() {
        setBusy(true)
        try {
            await disconnectGarmin()
            setMsg({ type: 'success', text: 'Garmin disconnected.' })
            refresh()
        } catch (err) {
            setMsg({ type: 'danger', text: garminError(err).message })
        } finally {
            setBusy(false)
            setConfirmDisconnect(false)
        }
    }

    const connected = status?.status === 'connected'

    return (
        <div id="garmin" ref={anchor} className="scroll-mt-6">
        <Card>
            <CardHeader>
                <CardTitle>Garmin</CardTitle>
            </CardHeader>
            <CardBody>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-neutral-600">
                        Send conditioning sessions to your watch as structured workouts. They go on your
                        Garmin calendar on the planned day, and the watch alerts you at each step.
                    </p>
                    {msg && <Alert variant={msg.type}>{msg.text}</Alert>}

                    {!status ? (
                        <div className="grid place-items-center py-6">
                            <Spinner size="sm" />
                        </div>
                    ) : !status.configured ? (
                        <Alert variant="warning">
                            Garmin isn’t set up on the server yet: it needs a GARMIN_TOKEN_KEY to store your
                            sign-in securely.
                        </Alert>
                    ) : connected ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-neutral-900">
                                    <i className="fa-solid fa-circle-check mr-2 text-success" aria-hidden="true" />
                                    Connected{status.displayName ? ` as ${status.displayName}` : ''}
                                </p>
                                {status.connectedAt && (
                                    <p className="mt-0.5 text-[13px] text-neutral-500">
                                        Since{' '}
                                        {new Date(status.connectedAt).toLocaleDateString(undefined, {
                                            dateStyle: 'medium',
                                        })}
                                    </p>
                                )}
                            </div>
                            <Button variant="secondary" size="sm" onClick={() => setConfirmDisconnect(true)} disabled={busy}>
                                Disconnect
                            </Button>
                        </div>
                    ) : status.status === 'pending_mfa' ? (
                        <form onSubmit={handleMfa} className="flex flex-col gap-4">
                            <Alert variant="info">Garmin sent you a code. Enter it to finish connecting.</Alert>
                            <Input
                                label="Code"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                icon="fa-solid fa-key"
                                autoFocus
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button type="submit" disabled={busy || !code.trim()}>
                                    {busy ? 'Checking…' : 'Verify'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => void handleDisconnect()}
                                    disabled={busy}
                                >
                                    Start again
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleConnect} className="flex flex-col gap-4">
                            {status.status === 'expired' && (
                                <Alert variant="warning">
                                    Your Garmin session has expired. Sign in again to keep sending workouts.
                                </Alert>
                            )}
                            <Input
                                label="Garmin email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                icon="fa-solid fa-envelope"
                                autoComplete="username"
                            />
                            <Input
                                label="Garmin password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                icon="fa-solid fa-lock"
                                autoComplete="current-password"
                                hint="Used once to sign in. Only Garmin’s session is kept, encrypted."
                            />
                            <div>
                                <Button type="submit" disabled={busy || !email.trim() || !password}>
                                    {busy
                                        ? 'Connecting…'
                                        : status.status === 'expired'
                                          ? 'Reconnect Garmin'
                                          : 'Connect Garmin'}
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </CardBody>
            <ConfirmModal
                open={confirmDisconnect}
                title="Disconnect Garmin?"
                message="Workouts already sent stay on your Garmin calendar and watch. You can connect again any time."
                confirmLabel="Disconnect"
                onConfirm={() => void handleDisconnect()}
                onClose={() => setConfirmDisconnect(false)}
            />
        </Card>
        </div>
    )
}
