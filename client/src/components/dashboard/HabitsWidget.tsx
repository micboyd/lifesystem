import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../Card'
import HabitsDaySection from '../habits/HabitsDaySection'
import { todayKey } from '../../lib/calendar'

export default function HabitsWidget({ date = todayKey() }: { date?: string }) {
    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Habits</CardTitle>
                <Link
                    to="/habits"
                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Manage
                </Link>
            </CardHeader>
            <HabitsDaySection date={date} compact />
        </Card>
    )
}
