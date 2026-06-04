import { Card, CardHeader, CardTitle } from '../Card'
import EmptyState from '../EmptyState'
import Button from '../Button'

export default function NotesWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Quick notes</CardTitle>
            </CardHeader>

            <EmptyState
                icon="fa-regular fa-note-sticky"
                title="No notes yet"
                description="Jot down a thought, idea, or reminder for the day."
                action={
                    <Button variant="secondary" size="sm" icon="fa-solid fa-plus">
                        New note
                    </Button>
                }
            />
        </Card>
    )
}
