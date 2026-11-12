/** An imported Google meeting as the server lists it for a date range. */
export interface MeetingBlock {
    _id: string
    date: string
    title: string
    startTime: string
    endTime: string
    location?: string
    notes?: string
}
