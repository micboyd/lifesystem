import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Container from '../components/Container'
import Button from '../components/Button'

export default function Profile() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    function handleLogout() {
        logout()
        navigate('/login', { replace: true })
    }

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">
                        {user?.name ?? 'Profile'}
                    </h1>
                    {user?.email && (
                        <p className="mt-1 text-sm text-neutral-500">{user.email}</p>
                    )}
                </div>
                <Button variant="secondary" icon="fa-solid fa-arrow-right-from-bracket" onClick={handleLogout}>
                    Log out
                </Button>
            </header>

            <div className="rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 p-10 text-center">
                <p className="text-sm text-neutral-500">More profile settings coming soon.</p>
            </div>
        </Container>
    )
}
