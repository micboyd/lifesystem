import { Card, CardHeader, CardTitle } from '../Card'
import TasksDaySection from '../tasks/TasksDaySection'
import { todayKey } from '../../lib/calendar'

export default function TasksWidget({ date = todayKey() }: { date?: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <TasksDaySection date={date} />
        </Card>
    )
}
