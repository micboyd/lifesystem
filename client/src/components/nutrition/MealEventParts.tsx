import { useState } from 'react'
import BottomSheet from '../BottomSheet'
import { CATEGORY } from './mealUi'
import { eventsInMealSlot, mealDayPill } from '../../lib/mealEvents'
import { MEAL_TYPES, type Event, type MealType } from '../../types'

/**
 * Calendar events on the nutrition planner, drawn like the fitness planner's:
 * a pill under the day's title saying which meals the diary lands on, a tag on
 * each slot it covers, and a sheet listing the day's events.
 */

const label = (s: MealType) => CATEGORY[s].label.replace(/s$/, '')

/** "Lunch & dinner · Wedding" under the day's title. Solid when every meal is taken. */
export function DayEventPill({
    events,
    date,
    weekday,
    skip,
    onOpen,
}: {
    events: Event[]
    date: string
    weekday: string
    /** Slots whose clash has been accepted on the meal there. */
    skip?: MealType[]
    onOpen: () => void
}) {
    const pill = mealDayPill(events, date, label, skip)
    if (!pill) return null
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-label={`On the calendar ${weekday}: ${pill.when}, ${pill.what} — view`}
            className={`inline-flex max-w-full self-start items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 ${
                pill.full ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200'
            }`}
        >
            <i className="fa-regular fa-calendar text-[9px]" aria-hidden="true" />
            <span className="shrink-0">{pill.when}</span>
            <span className="truncate font-medium opacity-80">· {pill.what}</span>
        </button>
    )
}

/**
 * The tag beside a slot's name when the diary covers that meal time. Amber
 * when a meal is still planned there (it might not work), sky when the slot is
 * empty. Tapping it offers to mark the slot away — or, once it's away (the
 * slot then shows only this tag), opens the day's events.
 */
export function SlotEventTag({
    events,
    plannedHere,
    slot,
    away = false,
    onAway,
    onShow,
}: {
    /** The events over this slot. */
    events: Event[]
    /** Meals still to eat in the slot. */
    plannedHere: number
    slot: MealType
    /** The slot is already marked away — no meal there. */
    away?: boolean
    onAway: () => void
    onShow?: () => void
}) {
    if (events.length === 0) return null
    const clash = plannedHere > 0
    const what = events.length === 1 ? events[0].title : `${events.length} events`
    const at = label(slot).toLowerCase()
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                if (away && onShow) onShow()
                else onAway()
            }}
            title={
                away
                    ? `${what} is on at ${at} — no meal here.`
                    : clash
                      ? `${what} is on at ${at} — this meal might not work. Tap to mark it away.`
                      : `${what} is on at ${at}. Tap to mark it away.`
            }
            aria-label={
                away
                    ? `${what} at ${at}, no meal here — view`
                    : `${what} at ${at}${clash ? ', clashes with the planned meal' : ''} — mark away`
            }
            className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80 ${
                clash ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300' : 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200'
            }`}
        >
            <i
                className={`${clash ? 'fa-solid fa-triangle-exclamation' : 'fa-regular fa-calendar'} shrink-0 text-[8px]`}
                aria-hidden="true"
            />
            <span className="truncate">{what}</span>
        </button>
    )
}

/** The day's events, with the meals each one lands on. */
export function MealEventsSheet({
    date,
    dayLabel,
    events,
    onClose,
}: {
    date: string | null
    dayLabel: string
    events: Event[]
    onClose: () => void
}) {
    // Keep the last day on show while the sheet slides shut.
    const [shown, setShown] = useState<{ date: string; label: string; events: Event[] } | null>(null)
    if (date && (shown?.date !== date || shown.events !== events)) setShown({ date, label: dayLabel, events })

    return (
        <BottomSheet open={!!date} onClose={onClose} title={shown ? `On the calendar · ${shown.label}` : 'On the calendar'}>
            {shown && (
                <ul className="flex flex-col gap-2 pb-2">
                    {shown.events.map((event) => {
                        const meals = MEAL_TYPES.filter((s) => eventsInMealSlot([event], shown.date, s).length > 0)
                        return (
                            <li key={event._id} className="flex items-start gap-3 rounded-xl border border-neutral-200 px-3 py-3">
                                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-600">
                                    <i className="fa-regular fa-calendar text-xs" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-semibold text-neutral-900">{event.title}</p>
                                    <p className="mt-0.5 text-xs text-neutral-500">
                                        {meals.length ? `Over ${meals.map((s) => label(s).toLowerCase()).join(' & ')}` : 'Not over a meal'}
                                        {event.time && ` · ${event.time}`}
                                        {event.location && ` · ${event.location}`}
                                    </p>
                                    {event.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">{event.notes}</p>}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            )}
        </BottomSheet>
    )
}
