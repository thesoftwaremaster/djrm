import { supabase } from '../supabase'

const parseDateOnly = (value) => {
  if (!value) return null

  const [year, month, day] = value.split('-').map(Number)

  if (!year || !month || !day) return null

  return new Date(year, month - 1, day)
}

const getLocalDateKey = (value) => {
  if (!value) return ''

  if (!value.includes('T')) return value

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return ''

  const year = parsedDate.getFullYear()
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0')
  const day = String(parsedDate.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const getTimeValue = (value) => {
  if (!value) return null

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return null

  return parsedDate.getTime()
}

const hasTimeOverlap = ({ firstStart, firstEnd, secondStart, secondEnd }) => {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false

  return firstStart < secondEnd && secondStart < firstEnd
}

export const getBookingDateKey = (booking) => {
  return getLocalDateKey(booking.event?.start_time || booking.enquiries?.event_date)
}

export const getCandidateDateKey = ({ eventDate, startTime }) => {
  return getLocalDateKey(startTime || eventDate)
}

export const getBookingConflictSummary = ({ candidate, bookings = [] }) => {
  const candidateDateKey = getCandidateDateKey(candidate)

  if (!candidateDateKey) {
    return {
      hasConflict: false,
      hasOverlap: false,
      message: '',
      conflicts: [],
    }
  }

  const candidateStart = getTimeValue(candidate.startTime)
  const candidateEnd = getTimeValue(candidate.endTime)

  const sameDayBookings = bookings.filter((booking) => {
    if (booking.status === 'cancelled') return false
    if (candidate.excludeBookingId && booking.id === candidate.excludeBookingId) return false

    return getBookingDateKey(booking) === candidateDateKey
  })

  const overlappingBookings = sameDayBookings.filter((booking) => (
    hasTimeOverlap({
      firstStart: candidateStart,
      firstEnd: candidateEnd,
      secondStart: getTimeValue(booking.event?.start_time),
      secondEnd: getTimeValue(booking.event?.end_time),
    })
  ))

  const hasOverlap = overlappingBookings.length > 0
  const conflicts = hasOverlap ? overlappingBookings : sameDayBookings

  return {
    hasConflict: conflicts.length > 0,
    hasOverlap,
    message: hasOverlap
      ? 'This booking overlaps with another booking.'
      : conflicts.length > 0
        ? 'You already have a booking on this date.'
        : '',
    conflicts,
  }
}

export const fetchBookingConflicts = async ({
  eventDate,
  startTime,
  endTime,
  excludeBookingId = null,
}) => {
  const candidateDateKey = getCandidateDateKey({ eventDate, startTime })

  if (!candidateDateKey) {
    return {
      hasConflict: false,
      hasOverlap: false,
      message: '',
      conflicts: [],
    }
  }

  const [bookingsResponse, eventsResponse] = await Promise.all([
    supabase
      .from('bookings')
      .select(`
        id,
        status,
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

  if (bookingsResponse.error) throw bookingsResponse.error
  if (eventsResponse.error) throw eventsResponse.error

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

  return getBookingConflictSummary({
    candidate: {
      eventDate,
      startTime,
      endTime,
      excludeBookingId,
    },
    bookings: (bookingsResponse.data || []).map((booking) => ({
      ...booking,
      event: eventsByBookingId[booking.id] || null,
    })),
  })
}

export const getConflictLinkText = (conflict) => {
  const clientName = conflict?.enquiries?.clients?.name || 'booking'
  const eventType = conflict?.enquiries?.event_type || 'event'

  return `${clientName} - ${eventType}`
}

export const getDateSortValue = (value) => {
  const parsedDate = parseDateOnly(value)
  return parsedDate ? parsedDate.getTime() : Number.MAX_SAFE_INTEGER
}
