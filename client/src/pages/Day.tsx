import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import DayView from '../components/calendar/DayView'
import HabitsDaySection from '../components/habits/HabitsDaySection'
import TasksDaySection from '../components/tasks/TasksDaySection'
import DayStatusSection from '../components/calendar/DayStatusSection'
import StudyDaySection from '../components/study/StudyDaySection'
import { useAuth } from '../context/AuthContext'
import { formatDateLong, todayKey } from '../lib/calendar'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default function Day() {
    const { date } = useParams<{ date: string }>()
    const navigate = useNavigate()
    const { state } = useLocation()
    const { user } = useAuth()
    const studyRowId = user?.settings?.studyRowId
    const openPart = (state as { openPart?: string } | null)?.openPart

    if (!date || !DATE_PATTERN.test(date)) {
        return <Navigate to="/calendar" replace />
    }

    const isToday = date === todayKey()

    return (
        <Container as="main" className="py-10 max-w-2xl">
            <Button
                variant="ghost"
                size="sm"
                icon="fa-solid fa-arrow-left"
                onClick={() => navigate(-1)}
                className="mb-6"
            >
                Back
            </Button>

            <header className="mb-8">
                {isToday && (
                    <p className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                        Today
                    </p>
                )}
                <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">
                    {formatDateLong(date)}
                </h1>
            </header>

            {/* Events */}
            <section className="mb-8">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                    Events
                </h2>
                <DayView date={date} initialOpenPart={openPart} />
            </section>

            {/* Tasks */}
            <section className="mb-8">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                    Tasks
                </h2>
                <TasksDaySection date={date} />
            </section>

            {/* Habits */}
            <section className="mb-8">
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                    Habits
                </h2>
                <HabitsDaySection date={date} />
            </section>

            {/* Study hours */}
            {studyRowId && (
                <section className="mb-8">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                        Study
                    </h2>
                    <StudyDaySection date={date} rowId={studyRowId} />
                </section>
            )}

            {/* Leave / Holiday status */}
            <section>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                    Leave & Holidays
                </h2>
                <DayStatusSection date={date} />
            </section>
        </Container>
    )
}
