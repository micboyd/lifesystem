import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import HabitTiles from '../habits/HabitTiles'
import { todayKey } from '../../lib/calendar'

export default function HabitsWidget({ date = todayKey() }: { date?: string }) {
    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Habits</CardTitle>
                <CardAction to="/habits">All habits</CardAction>
            </CardHeader>
            <HabitTiles date={date} />
        </Card>
    )
}
