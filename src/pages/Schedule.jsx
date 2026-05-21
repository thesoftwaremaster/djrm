import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { supabase } from '../supabase'
import RelatedTasks from '../components/RelatedTasks'
import StatusBadge from '../components/ui/StatusBadge'
import { fetchOpenTasks } from '../workflows/tasksWorkflow'
import {
  getBookingConflictSummary,
  getBookingDateKey,
  getDateSortValue,
} from '../utils/bookingConflicts'

const parseDateOnly = (value) => {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const formatDate = (value) => {
  if (!value) return 'No date set'

  const parsedDate = parseDateOnly(value) || new Date(value)

  if (Number.isNaN(parsedDate.getTime())) return value

  return parsedDate.toLocaleDateString()
}

const formatMonth = (value) => {
  return value.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

const formatTime = (value) => {
  if (!value) return ''

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) return ''

  return parsedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getTimeRange = (booking) => {
  if (!booking.event?.start_time) return 'No time set'

  const startTime = formatTime(booking.event.start_time)
  const endTime = formatTime(booking.event.end_time)

  return endTime ? `${startTime} - ${endTime}` : startTime
}

const getCompactTime = (booking) => {
  return formatTime(booking.event?.start_time)
}

const getTimeValue = (value) => {
  if (!value) return null

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return null

  return parsedDate.getTime()
}

const getDateKeyFromDate = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const getMonthDays = (monthDate) => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const leadingDays = firstDay.getDay()
  const totalCells = Math.max(
    35,
    Math.ceil((leadingDays + lastDay.getDate()) / 7) * 7
  )

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(year, month, index - leadingDays + 1)

    return {
      date,
      dateKey: getDateKeyFromDate(date),
      isCurrentMonth: date.getMonth() === month,
    }
  })
}

const getMonthWeeks = (monthDate) => {
  const days = getMonthDays(monthDate)
  const weeks = []

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7))
  }

  return weeks
}

const getWeekRange = (date) => {
  const start = new Date(date)
  const day = start.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  start.setDate(start.getDate() + mondayOffset)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

const getMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

const isDateInRange = (date, range) => {
  if (!date || Number.isNaN(date.getTime())) return false

  return date.getTime() >= range.start.getTime() && date.getTime() <= range.end.getTime()
}

const getConflictLabel = (booking, sameDayBookings) => {
  const conflictSummary = getBookingConflictSummary({
    candidate: {
      eventDate: booking.enquiries?.event_date,
      startTime: booking.event?.start_time,
      endTime: booking.event?.end_time,
      excludeBookingId: booking.id,
    },
    bookings: sameDayBookings,
  })

  if (!conflictSummary.hasConflict) return ''
  return conflictSummary.hasOverlap ? 'Time overlap' : 'Same-day booking'
}

const getDayConflictType = (dayBookings) => {
  if (dayBookings.length <= 1) return ''

  const hasOverlap = dayBookings.some((booking) => {
    const conflictSummary = getBookingConflictSummary({
      candidate: {
        eventDate: booking.enquiries?.event_date,
        startTime: booking.event?.start_time,
        endTime: booking.event?.end_time,
        excludeBookingId: booking.id,
      },
      bookings: dayBookings,
    })

    return conflictSummary.hasOverlap
  })

  return hasOverlap ? 'overlap' : 'same-day'
}

const getBookingChipClass = (status) => {
  const chipClasses = {
    confirmed: 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    pending: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    completed: 'border-gray-200 bg-surface-subtle text-slate-700 hover:bg-gray-100',
  }

  return chipClasses[status] || 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
}

const getBookingDotClass = (status) => {
  const dotClasses = {
    confirmed: 'bg-emerald-500',
    pending: 'bg-amber-500',
    completed: 'bg-gray-400',
  }

  return dotClasses[status] || 'bg-slate-500'
}

const getBookingChipTitle = (booking) => {
  const client = booking.enquiries?.clients?.name || 'Unknown client'
  const eventType = booking.enquiries?.event_type || 'Booking'
  const venue = booking.event?.location || booking.enquiries?.venue || 'No venue'
  const time = getTimeRange(booking)

  return `${client} | ${eventType} | ${venue} | ${time}`
}

const Schedule = () => {
  const [bookings, setBookings] = useState([])
  const [scheduleTasks, setScheduleTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date()
    return new Date(today.getFullYear(), today.getMonth(), 1)
  })

  const fetchSchedule = async () => {
    setLoading(true)
    setError('')

    const [bookingsResponse, eventsResponse] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          status,
          created_at,
          enquiry_id,
          enquiries (
            id,
            event_type,
            event_date,
            venue,
            clients (
              id,
              name
            )
          )
        `),
      supabase
        .from('events')
        .select(`
          id,
          booking_id,
          start_time,
          end_time,
          location
        `),
    ])

    if (bookingsResponse.error || eventsResponse.error) {
      console.error(bookingsResponse.error || eventsResponse.error)
      setError('Could not load schedule.')
      setLoading(false)
      return
    }

    const eventsByBookingId = (eventsResponse.data || []).reduce((events, event) => {
      if (!event.booking_id) return events
      const currentEvent = events[event.booking_id]

      if (!currentEvent) {
        return {
          ...events,
          [event.booking_id]: event,
        }
      }

      if (!currentEvent.start_time) return events
      if (!event.start_time) return events

      return new Date(event.start_time) < new Date(currentEvent.start_time)
        ? {
            ...events,
            [event.booking_id]: event,
          }
        : events
    }, {})

    setBookings(
      (bookingsResponse.data || []).map((booking) => ({
        ...booking,
        event: eventsByBookingId[booking.id] || null,
      }))
    )

    try {
      const tasks = await fetchOpenTasks()
      setScheduleTasks(tasks)
    } catch (taskError) {
      console.error(taskError)
      setScheduleTasks([])
    }

    setLoading(false)
  }

  useEffect(() => {
    void Promise.resolve().then(() => fetchSchedule())
  }, [])

  const activeBookings = useMemo(() => (
    bookings.filter((booking) => booking.status !== 'cancelled' && getBookingDateKey(booking))
  ), [bookings])

  const bookingsByDate = useMemo(() => (
    activeBookings.reduce((groups, booking) => {
      const dateKey = getBookingDateKey(booking)

      return {
        ...groups,
        [dateKey]: [...(groups[dateKey] || []), booking],
      }
    }, {})
  ), [activeBookings])

  const groupedBookings = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const upcomingBookings = activeBookings
      .filter((booking) => {
        const dateKey = getBookingDateKey(booking)

        return getDateSortValue(dateKey) >= today.getTime()
      })
      .sort((firstBooking, secondBooking) => {
        const dateDifference =
          getDateSortValue(getBookingDateKey(firstBooking)) -
          getDateSortValue(getBookingDateKey(secondBooking))

        if (dateDifference !== 0) return dateDifference

        return (
          (getTimeValue(firstBooking.event?.start_time) || 0) -
          (getTimeValue(secondBooking.event?.start_time) || 0)
        )
      })

    return upcomingBookings.reduce((groups, booking) => {
      const dateKey = getBookingDateKey(booking)

      return {
        ...groups,
        [dateKey]: [...(groups[dateKey] || []), booking],
      }
    }, {})
  }, [activeBookings])

  const dateGroups = Object.entries(groupedBookings).sort(
    ([firstDate], [secondDate]) => getDateSortValue(firstDate) - getDateSortValue(secondDate)
  )

  const calendarWeeks = useMemo(() => getMonthWeeks(calendarMonth), [calendarMonth])
  const todayKey = getDateKeyFromDate(new Date())
  const monthBookings = useMemo(() => calendarWeeks.flat().flatMap((day) => (
    day.isCurrentMonth ? bookingsByDate[day.dateKey] || [] : []
  )), [bookingsByDate, calendarWeeks])

  const visibleScheduleTasks = useMemo(() => {
    const visibleBookings = viewMode === 'calendar'
      ? monthBookings
      : dateGroups.flatMap(([, dayBookings]) => dayBookings)
    const visibleBookingIds = new Set(visibleBookings.map((booking) => booking.id))
    const dueDateRange = viewMode === 'calendar'
      ? getMonthRange(calendarMonth)
      : getWeekRange(new Date())

    return scheduleTasks.filter((task) => {
      const linkedToVisibleBooking = task.booking_id && visibleBookingIds.has(task.booking_id)
      const linkedToScheduleRecord = Boolean(task.booking_id || task.entity_type === 'booking')
      const dueInCurrentRange =
        linkedToScheduleRecord && isDateInRange(parseDateOnly(task.due_date), dueDateRange)

      return linkedToVisibleBooking || dueInCurrentRange
    })
  }, [calendarMonth, dateGroups, monthBookings, scheduleTasks, viewMode])

  const goToPreviousMonth = () => {
    setCalendarMonth((currentMonth) => (
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    ))
  }

  const goToNextMonth = () => {
    setCalendarMonth((currentMonth) => (
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    ))
  }

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-text-primary">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-text-muted">Availability</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
                Booking schedule
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-2xl border border-border-soft bg-surface-subtle p-1">
              {['list', 'calendar'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`h-9 rounded-xl px-3 text-sm font-medium capitalize transition ${
                    viewMode === mode
                      ? 'bg-surface text-text-primary shadow-[0_4px_12px_rgba(15,23,42,0.05)]'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
              {loading ? '...' : `${dateGroups.length} dates`}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={cardClass}>
          <p className="py-6 text-center text-sm text-text-muted">
            Loading schedule...
          </p>
        </div>
      ) : viewMode === 'calendar' ? (
        <div className={cardClass}>
          <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-text-muted">Month view</p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary">
                {formatMonth(calendarMonth)}
              </h2>
            </div>

            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                onClick={goToPreviousMonth}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle sm:flex-none"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={goToNextMonth}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle sm:flex-none"
              >
                Next
              </button>
            </div>
          </div>

          {!monthBookings.length && (
            <p className="mb-4 rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-center text-sm text-text-muted">
              No bookings this month.
            </p>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[760px] overflow-hidden rounded-2xl border border-border-soft bg-surface">
              <div className="grid grid-cols-7 border-b border-border-soft bg-surface-subtle text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName) => (
                  <div key={dayName} className="px-3 py-2">
                    {dayName}
                  </div>
                ))}
              </div>

              <div>
                {calendarWeeks.map((week, weekIndex) => (
                  <div
                    key={`week-${week[0]?.dateKey || weekIndex}`}
                    className="grid grid-cols-7"
                  >
                    {week.map((day, dayIndex) => {
                      const dayBookings = bookingsByDate[day.dateKey] || []
                      const conflictType = getDayConflictType(dayBookings)
                      const hasConflict = Boolean(conflictType)
                      const isToday = day.dateKey === todayKey

                      return (
                        <div
                          key={day.dateKey}
                          className={`min-h-[132px] border-b border-border-soft p-2 ${
                            dayIndex < 6 ? 'border-r border-border-soft' : ''
                          } ${
                            day.isCurrentMonth ? 'bg-surface' : 'bg-surface-subtle text-slate-300'
                          } ${isToday ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : ''} ${
                            hasConflict
                              ? conflictType === 'overlap'
                                ? 'border-amber-300 bg-amber-50/80 ring-1 ring-inset ring-amber-200'
                                : 'border-amber-200 bg-amber-50/45'
                              : ''
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className={`text-sm font-semibold ${isToday ? 'text-text-primary' : 'text-text-secondary'}`}>
                              {day.date.getDate()}
                            </span>
                            {hasConflict && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-surface px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                <AlertTriangle className="h-3 w-3" />
                                {dayBookings.length}
                              </span>
                            )}
                          </div>

                          <div className="space-y-1">
                            {dayBookings.slice(0, 2).map((booking) => {
                              const compactTime = getCompactTime(booking)
                              const chipLabel =
                                booking.enquiries?.clients?.name ||
                                booking.enquiries?.event_type ||
                                'Booking'

                              return (
                              <Link
                                key={booking.id}
                                to={`/bookings/${booking.id}`}
                                title={getBookingChipTitle(booking)}
                                className={`block min-h-9 rounded-xl border px-2 py-1 text-left text-xs transition ${getBookingChipClass(booking.status)}`}
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${getBookingDotClass(booking.status)}`} />
                                  <span className="min-w-0 truncate font-medium">
                                    {chipLabel}
                                  </span>
                                </span>
                                {compactTime && (
                                  <span className="mt-0.5 block truncate pl-3.5 text-[11px] opacity-80">
                                    {compactTime}
                                  </span>
                                )}
                              </Link>
                              )
                            })}

                            {dayBookings.length > 2 && (
                              <p className="rounded-xl bg-surface/75 px-2 py-1 text-xs font-medium text-text-secondary">
                                +{dayBookings.length - 2} more
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : dateGroups.length ? (
        <div className="space-y-4">
          {dateGroups.map(([dateKey, dayBookings]) => (
            <div key={dateKey} className={cardClass}>
              <div className="mb-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-text-muted">Event date</p>
                  <h2 className="mt-1 text-xl font-semibold text-text-primary">
                    {formatDate(dateKey)}
                  </h2>
                </div>

                {dayBookings.length > 1 && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {dayBookings.length} bookings
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-2xl border border-border-soft bg-surface">
                <div className="hidden grid-cols-[0.8fr_1fr_1fr_1fr_0.7fr_0.8fr_0.5fr] border-b border-border-soft bg-surface-subtle px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted md:grid">
                  <span>Time</span>
                  <span>Client</span>
                  <span>Event</span>
                  <span>Venue</span>
                  <span>Status</span>
                  <span>Conflict</span>
                  <span>Link</span>
                </div>

                {dayBookings.map((booking) => {
                  const conflictLabel = getConflictLabel(booking, dayBookings)

                  return (
                    <Link
                      key={booking.id}
                      to={`/bookings/${booking.id}`}
                      className="grid min-w-0 gap-2 border-b border-border-soft px-4 py-3 text-sm transition last:border-b-0 hover:bg-surface-subtle md:grid-cols-[0.8fr_1fr_1fr_1fr_0.7fr_0.8fr_0.5fr] md:items-center [&>*]:min-w-0 [&>*]:break-words"
                    >
                      <span className="font-medium text-text-primary">
                        {getTimeRange(booking)}
                      </span>
                      <span className="text-text-secondary">
                        {booking.enquiries?.clients?.name || 'Unknown client'}
                      </span>
                      <span className="text-text-secondary">
                        {booking.enquiries?.event_type || 'Booking'}
                      </span>
                      <span className="text-text-secondary">
                        {booking.event?.location || booking.enquiries?.venue || 'No venue'}
                      </span>
                      <span>
                        <StatusBadge status={booking.status} />
                      </span>
                      <span className={conflictLabel ? 'font-medium text-amber-700' : 'text-text-muted'}>
                        {conflictLabel || 'Clear'}
                      </span>
                      <span className="text-sm font-medium text-text-secondary">
                        Open
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={cardClass}>
          <p className="py-6 text-center text-sm text-text-muted">
            No upcoming bookings.
          </p>
        </div>
      )}

      {!loading && (
        <RelatedTasks
          title="Schedule tasks"
          tasks={visibleScheduleTasks}
          scheduleMode
          emptyMessage="No schedule tasks."
          onTaskCompleted={(taskId) => {
            setScheduleTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId))
          }}
        />
      )}
    </div>
  )
}

export default Schedule

