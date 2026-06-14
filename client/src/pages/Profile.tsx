import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { updateProfile, changePassword } from '../services/users'
import Container from '../components/Container'
import { Card, CardHeader, CardTitle, CardBody } from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'
import Alert from '../components/Alert'
import SettingsCard from '../components/profile/SettingsCard'

function errorMessage(err: unknown, fallback: string): string {
    return (
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
    )
}

export default function Profile() {
    const { user, logout, updateUser } = useAuth()
    const navigate = useNavigate()

    // ── Details form ──
    const [name, setName] = useState(user?.name ?? '')
    const [email, setEmail] = useState(user?.email ?? '')
    const [savingDetails, setSavingDetails] = useState(false)
    const [detailsMsg, setDetailsMsg] = useState<{
        type: 'success' | 'danger'
        text: string
    } | null>(null)

    // ── Password form ──
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)
    const [passwordMsg, setPasswordMsg] = useState<{
        type: 'success' | 'danger'
        text: string
    } | null>(null)

    const detailsChanged =
        name.trim() !== (user?.name ?? '') || email.trim() !== (user?.email ?? '')

    async function handleDetails(e: FormEvent) {
        e.preventDefault()
        setDetailsMsg(null)
        setSavingDetails(true)
        try {
            const updated = await updateProfile(name.trim(), email.trim())
            updateUser(updated)
            setDetailsMsg({ type: 'success', text: 'Profile updated.' })
        } catch (err) {
            setDetailsMsg({ type: 'danger', text: errorMessage(err, 'Could not update profile.') })
        } finally {
            setSavingDetails(false)
        }
    }

    async function handlePassword(e: FormEvent) {
        e.preventDefault()
        setPasswordMsg(null)
        if (newPassword !== confirmPassword) {
            setPasswordMsg({ type: 'danger', text: 'New passwords do not match.' })
            return
        }
        setSavingPassword(true)
        try {
            await changePassword(currentPassword, newPassword)
            setPasswordMsg({ type: 'success', text: 'Password updated.' })
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
        } catch (err) {
            setPasswordMsg({
                type: 'danger',
                text: errorMessage(err, 'Could not update password.'),
            })
        } finally {
            setSavingPassword(false)
        }
    }

    function handleLogout() {
        logout()
        navigate('/login', { replace: true })
    }

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Profile</h1>
                    <p className="mt-1 text-sm text-neutral-500">Manage your account details</p>
                </div>
                <Button
                    variant="secondary"
                    icon="fa-solid fa-arrow-right-from-bracket"
                    onClick={handleLogout}
                >
                    Log out
                </Button>
            </header>

            <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
                {/* Left column: Details + Password */}
                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Details</CardTitle>
                        </CardHeader>
                        <CardBody>
                            <form onSubmit={handleDetails} className="flex flex-col gap-4">
                                {detailsMsg && (
                                    <Alert variant={detailsMsg.type}>{detailsMsg.text}</Alert>
                                )}
                                <Input
                                    label="Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    icon="fa-solid fa-user"
                                    placeholder="Your name"
                                />
                                <Input
                                    label="Email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    icon="fa-solid fa-envelope"
                                    placeholder="you@example.com"
                                />
                                <div>
                                    <Button
                                        type="submit"
                                        disabled={
                                            savingDetails ||
                                            !detailsChanged ||
                                            !name.trim() ||
                                            !email.trim()
                                        }
                                    >
                                        {savingDetails ? 'Saving…' : 'Save changes'}
                                    </Button>
                                </div>
                            </form>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Password</CardTitle>
                        </CardHeader>
                        <CardBody>
                            <form onSubmit={handlePassword} className="flex flex-col gap-4">
                                {passwordMsg && (
                                    <Alert variant={passwordMsg.type}>{passwordMsg.text}</Alert>
                                )}
                                <Input
                                    label="Current password"
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    icon="fa-solid fa-lock"
                                    autoComplete="current-password"
                                />
                                <Input
                                    label="New password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    icon="fa-solid fa-lock"
                                    hint="At least 6 characters"
                                    autoComplete="new-password"
                                />
                                <Input
                                    label="Confirm new password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    icon="fa-solid fa-lock"
                                    autoComplete="new-password"
                                />
                                <div>
                                    <Button
                                        type="submit"
                                        disabled={
                                            savingPassword ||
                                            !currentPassword ||
                                            !newPassword ||
                                            !confirmPassword
                                        }
                                    >
                                        {savingPassword ? 'Updating…' : 'Update password'}
                                    </Button>
                                </div>
                            </form>
                        </CardBody>
                    </Card>
                </div>

                {/* Right column: Settings */}
                <SettingsCard />
            </div>
        </Container>
    )
}
