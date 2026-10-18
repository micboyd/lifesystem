import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import DayView from '../components/calendar/DayView'
import HabitsDaySection from '../components/habits/HabitsDaySection'
import TasksDaySection from '../components/tasks/TasksDaySection'
import DayStatusSection from '../components/calendar/DayStatusSection'
import RemindersDaySection from '../components/reminders/RemindersDaySection'
import { formatDateLong, todayKey } from '../lib/calendar'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export default function Day() {
    const { date } = useParams<{ date: string }>()
    const navigate = useNavigate()
    const { state } = useLocation()
    const openPart = (state as { openPart?: string } | null)?.openPart

    if (!date || !DATE_PATTERN.test(date)) {
        return <Navigate to="/calendar" replace />
    }

    const isToday = date === todayKey()

    return (
        <Container as="main" className="py-10">
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
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                        Today
                    </p>
                )}
                <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                    {formatDateLong(date)}
                </h1>
            </header>

            {/* Events */}
            <section className="mb-8">
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                    Events
                </h2>
                <DayView date={date} initialOpenPart={openPart} />
            </section>

            {/* Reminders */}
            <section className="mb-8">
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                    Reminders
                </h2>
                <RemindersDaySection date={date} />
            </section>

            {/* Tasks */}
            <section className="mb-8">
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                    Tasks
                </h2>
                <TasksDaySection date={date} />
            </section>

            {/* Habits */}
            <section className="mb-8">
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                    Habits
                </h2>
                <HabitsDaySection date={date} />
            </section>

            {/* Leave / Holiday status */}
            <section>
                <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                    Leave & Holidays
                </h2>
                <DayStatusSection date={date} />
            </section>
        </Container>
    )
}
