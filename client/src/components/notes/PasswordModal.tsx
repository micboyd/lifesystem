import { useState, type FormEvent } from 'react'
import Modal from '../Modal'
import Input from '../Input'
import Button from '../Button'

interface PasswordModalProps {
    /** `set` collects a new password (with confirmation); `enter` verifies an existing one. */
    mode: 'set' | 'enter'
    title: string
    submitLabel: string
    /** Runs the action; reject to keep the dialog open and show an error. */
    onSubmit: (password: string) => Promise<void>
    /** Supplying this in `enter` mode reveals a "Forgot password?" recovery path. */
    onReset?: (accountPassword: string) => Promise<void>
    onClose: () => void
}

const MIN = 4

export default function PasswordModal({
    mode,
    title,
    submitLabel,
    onSubmit,
    onReset,
    onClose,
}: PasswordModalProps) {
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [account, setAccount] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    // In `enter` mode the user can switch to the account-password recovery view.
    const [recovering, setRecovering] = useState(false)

    const setInvalid = mode === 'set' && (password.length < MIN || password !== confirm)

    async function run(action: () => Promise<void>, fallback: string) {
        setBusy(true)
        setError('')
        try {
            await action()
        } catch (e) {
            const msg =
                (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                fallback
            setError(msg)
            setBusy(false)
        }
    }

    function submit() {
        if (recovering) {
            if (!account) return
            run(() => onReset!(account), 'Incorrect account password.')
        } else {
            if (mode === 'set' && setInvalid) return
            if (mode === 'enter' && !password) return
            run(() => onSubmit(password), 'Incorrect password.')
        }
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault()
        submit()
    }

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title={recovering ? 'Reset lock' : title}
            footer={
                <div className="flex w-full items-center justify-end gap-2">
                    <Button
                        variant="secondary"
                        onClick={recovering ? () => setRecovering(false) : onClose}
                        disabled={busy}
                    >
                        {recovering ? 'Back' : 'Cancel'}
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={busy || (recovering ? !account : mode === 'set' ? setInvalid : !password)}
                    >
                        {busy ? 'Working…' : recovering ? 'Reset lock' : submitLabel}
                    </Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {recovering ? (
                    <>
                        <p className="text-sm text-neutral-500">
                            Forgotten this note’s password? Confirm your account password to remove
                            the lock. You can set a new one afterwards.
                        </p>
                        <Input
                            label="Account password"
                            type="password"
                            icon="fa-solid fa-user-lock"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            autoFocus
                            autoComplete="current-password"
                        />
                    </>
                ) : (
                    <>
                        <Input
                            label={mode === 'set' ? 'New password' : 'Password'}
                            type="password"
                            icon="fa-solid fa-lock"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                            autoComplete="off"
                            hint={mode === 'set' ? `At least ${MIN} characters.` : undefined}
                        />
                        {mode === 'set' && (
                            <Input
                                label="Confirm password"
                                type="password"
                                icon="fa-solid fa-lock"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                autoComplete="off"
                                error={
                                    confirm && password !== confirm ? 'Passwords don’t match.' : undefined
                                }
                            />
                        )}
                    </>
                )}

                {error && <p className="text-sm text-red-500">{error}</p>}

                {mode === 'enter' && onReset && !recovering && (
                    <button
                        type="button"
                        onClick={() => {
                            setError('')
                            setRecovering(true)
                        }}
                        className="self-start text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-700"
                    >
                        Forgot password?
                    </button>
                )}

                {/* Hidden submit so Enter works inside the dialog. */}
                <button type="submit" className="hidden" aria-hidden="true" />
            </form>
        </Modal>
    )
}
