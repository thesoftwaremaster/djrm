import { supabase } from '../supabase'
import { logActivity } from './activityLogActions'
import { isValidDateInput, isValidDateTimeInput, isValidEmail } from '../utils/validation'

const normalizeOptionalText = (value) => {
  const trimmedValue = value?.trim() || ''
  return trimmedValue || null
}

const normalizeEmail = (email = '') => email.trim().toLowerCase()

const normalizeOptionalDateTime = (value) => {
  return value || null
}

const protectedBookingStatuses = ['completed', 'cancelled']

const logBookingEdited = ({ bookingId }) =>
  logActivity({
    entityType: 'booking',
    entityId: bookingId,
    bookingId,
    action: 'booking_edited',
    title: 'Booking edited',
    description: 'Booking details were updated.',
    metadata: {
      changed_fields: ['status', 'total_price', 'event_details'],
    },
  })

const findClientByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail) return null

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, phone, created_at')
    .eq('email', normalizedEmail)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error

  return data?.[0] || null
}

const findClientById = async (clientId) => {
  if (!clientId) return null

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, phone, created_at')
    .eq('id', clientId)
    .maybeSingle()

  if (error) throw error
  return data
}

const findOrCreateClientForEnquiry = async ({ clientId, name, email, phone }) => {
  if (clientId) {
    const existingClient = await findClientById(clientId)

    if (existingClient) return existingClient
  }

  const normalizedEmail = normalizeEmail(email)

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('A valid customer email is required.')
  }

  const existingClient = await findClientByEmail(normalizedEmail)

  if (existingClient) {
    if (phone?.trim() && !existingClient.phone) {
      const { data: updatedClient, error: updateError } = await supabase
        .from('clients')
        .update({ phone: phone.trim() })
        .eq('id', existingClient.id)
        .select('id, name, email, phone, created_at')
        .single()

      if (updateError) throw updateError
      return updatedClient
    }

    return existingClient
  }

  const { data: newClient, error: createError } = await supabase
    .from('clients')
    .insert([
      {
        name: name.trim(),
        email: normalizedEmail,
        phone: normalizeOptionalText(phone),
      },
    ])
    .select('id, name, email, phone, created_at')
    .single()

  if (createError) throw createError

  return newClient
}

export const createEnquiryWithCustomer = async ({
  clientId,
  name,
  email,
  phone,
  eventType,
  eventDate,
  venue,
}) => {
  if (!clientId && !name?.trim()) {
    throw new Error('Customer name is required.')
  }

  if (!eventType?.trim()) {
    throw new Error('Event type is required.')
  }

  if (eventDate && !isValidDateInput(eventDate)) {
    throw new Error('Event date must be a valid date.')
  }

  const client = await findOrCreateClientForEnquiry({ clientId, name, email, phone })

  const { data: enquiry, error } = await supabase
    .from('enquiries')
    .insert([
      {
        client_id: client.id,
        event_type: eventType,
        event_date: eventDate || null,
        venue: normalizeOptionalText(venue),
        status: 'new',
      },
    ])
    .select()
    .single()

  if (error) throw error

  return { client, enquiry }
}

export const updateEnquiryDetails = async ({
  enquiryId,
  eventType,
  eventDate,
  venue,
  notes,
  status,
}) => {
  if (eventDate && !isValidDateInput(eventDate)) {
    throw new Error('Event date must be a valid date.')
  }

  const { error } = await supabase
    .from('enquiries')
    .update({
      event_type: eventType,
      event_date: eventDate || null,
      venue: normalizeOptionalText(venue),
      notes: notes || null,
      status,
    })
    .eq('id', enquiryId)

  if (error) throw error
}

export const updateEnquiryStatus = async ({ enquiryId, status }) => {
  const { error } = await supabase
    .from('enquiries')
    .update({ status })
    .eq('id', enquiryId)

  if (error) throw error
}

export const updateBookingStatus = async ({ bookingId, status }) => {
  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', bookingId)

  if (error) throw error

  await logActivity({
    entityType: 'booking',
    entityId: bookingId,
    bookingId,
    action: 'booking_edited',
    title: 'Booking status updated',
    description: `Booking status changed to ${status}.`,
    metadata: {
      changed_fields: ['status'],
    },
  })
}

export const updateBookingDetails = async ({
  bookingId,
  status,
  totalPrice,
  eventId = null,
  location = '',
  startTime = '',
  endTime = '',
  notes = '',
}) => {
  if (!bookingId) {
    throw new Error('Booking ID is required.')
  }

  if (!Number.isFinite(Number(totalPrice)) || Number(totalPrice) < 0) {
    throw new Error('Total price must be 0 or more.')
  }

  if (!isValidDateTimeInput(startTime) || !isValidDateTimeInput(endTime)) {
    throw new Error('Event start and end times must be valid.')
  }

  if (startTime && endTime && new Date(endTime) < new Date(startTime)) {
    throw new Error('Event end time cannot be before start time.')
  }

  const { error: bookingError } = await supabase
    .from('bookings')
    .update({
      status,
      total_price: totalPrice,
    })
    .eq('id', bookingId)

  if (bookingError) throw bookingError

  const eventPayload = {
    location: normalizeOptionalText(location),
    start_time: normalizeOptionalDateTime(startTime),
    end_time: normalizeOptionalDateTime(endTime),
    notes: normalizeOptionalText(notes),
  }

  const hasEventValues = Object.values(eventPayload).some((value) => value !== null)

  if (eventId) {
    const { error: eventError } = await supabase
      .from('events')
      .update(eventPayload)
      .eq('id', eventId)

    if (eventError) throw eventError
    await logBookingEdited({ bookingId })
    return
  }

  if (!hasEventValues) {
    await logBookingEdited({ bookingId })
    return
  }

  const { error: eventError } = await supabase
    .from('events')
    .insert([
      {
        booking_id: bookingId,
        ...eventPayload,
      },
    ])

  if (eventError) throw eventError

  await logBookingEdited({ bookingId })
}

const ensureBookingEventLocation = async ({ bookingId, location }) => {
  const normalizedLocation = normalizeOptionalText(location)

  if (!normalizedLocation) return null

  const { data: existingEvents, error: lookupError } = await supabase
    .from('events')
    .select('id, location')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (lookupError) throw lookupError

  const existingEvent = existingEvents?.[0] || null

  if (existingEvent) {
    if (existingEvent.location) return existingEvent

    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({ location: normalizedLocation })
      .eq('id', existingEvent.id)
      .select('id, location')
      .single()

    if (updateError) throw updateError
    return updatedEvent
  }

  const { data: createdEvent, error: createError } = await supabase
    .from('events')
    .insert([
      {
        booking_id: bookingId,
        location: normalizedLocation,
      },
    ])
    .select('id, location')
    .single()

  if (createError) throw createError

  return createdEvent
}

export const convertEnquiryToBooking = async ({ enquiryId }) => {
  const { data: enquiry, error: enquiryError } = await supabase
    .from('enquiries')
    .select('id, venue, client_id')
    .eq('id', enquiryId)
    .single()

  if (enquiryError) throw enquiryError

  const { data: existingBooking, error: existingBookingError } = await supabase
    .from('bookings')
    .select('id, enquiry_id, status, total_price, created_at')
    .eq('enquiry_id', enquiryId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingBookingError) throw existingBookingError

  const savedBooking = existingBooking?.[0] || null

  if (savedBooking) {
    if (!protectedBookingStatuses.includes(savedBooking.status) && savedBooking.status !== 'confirmed') {
      const { data: updatedBooking, error: updateBookingError } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', savedBooking.id)
        .select('id, enquiry_id, status, total_price, created_at')
        .single()

      if (updateBookingError) throw updateBookingError

      await ensureBookingEventLocation({
        bookingId: updatedBooking.id,
        location: enquiry.venue,
      })
      await updateEnquiryStatus({ enquiryId, status: 'booked' })
      await logActivity({
        entityType: 'booking',
        entityId: updatedBooking.id,
        bookingId: updatedBooking.id,
        clientId: enquiry.client_id,
        action: 'enquiry_converted_to_booking',
        title: 'Enquiry converted to booking',
        description: 'The enquiry was linked to this booking.',
        metadata: {
          enquiry_id: enquiryId,
        },
      })
      return updatedBooking
    }

    await ensureBookingEventLocation({
      bookingId: savedBooking.id,
      location: enquiry.venue,
    })
    await updateEnquiryStatus({ enquiryId, status: 'booked' })
    await logActivity({
      entityType: 'booking',
      entityId: savedBooking.id,
      bookingId: savedBooking.id,
      clientId: enquiry.client_id,
      action: 'enquiry_converted_to_booking',
      title: 'Enquiry converted to booking',
      description: 'The enquiry was linked to this booking.',
      metadata: {
        enquiry_id: enquiryId,
      },
    })
    return savedBooking
  }

  const { data: createdBooking, error: bookingError } = await supabase
    .from('bookings')
    .insert([
      {
        enquiry_id: enquiryId,
        status: 'confirmed',
        total_price: 0,
      },
    ])
    .select()
    .single()

  if (bookingError) throw bookingError

  await ensureBookingEventLocation({
    bookingId: createdBooking.id,
    location: enquiry.venue,
  })
  await updateEnquiryStatus({ enquiryId, status: 'booked' })
  await logActivity({
    entityType: 'booking',
    entityId: createdBooking.id,
    bookingId: createdBooking.id,
    clientId: enquiry.client_id,
    action: 'enquiry_converted_to_booking',
    title: 'Enquiry converted to booking',
    description: 'The enquiry was converted into a confirmed booking.',
    metadata: {
      enquiry_id: enquiryId,
    },
  })

  return createdBooking
}
