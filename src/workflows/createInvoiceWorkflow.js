import { supabase } from '../supabase.js'
import { logActivity } from './activityLogActions.js'
import {
  createSettingsInvoiceNumber,
  fetchAppSettings,
  getDateAfterDays,
  getNextInvoiceNumberValue,
  incrementSettingsInvoiceNumber,
  isMissingInvoiceCurrencyError,
} from '../utils/appSettings.js'
import { isValidEmail } from '../utils/validation.js'
import { getCurrentUserId } from '../utils/tenant.js'

const stripEmptyFields = (record) => {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

const normalizeInvoiceItem = (item = {}) => {
  const quantity = Number(item.quantity || 0)
  const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0)
  const lineTotal = quantity * unitPrice
  const safeLineTotal = Number.isFinite(lineTotal) ? lineTotal : 0

  return {
    ...item,
    quantity,
    unit_price: unitPrice,
    line_total: safeLineTotal,
  }
}

export const calculateInvoiceSubtotal = (items = []) => {
  return items.reduce((total, item) => {
    const normalizedItem = normalizeInvoiceItem(item)
    return total + Number(normalizedItem.line_total || 0)
  }, 0)
}

export const calculateInvoiceTotals = ({ items = [], tax = 0 }) => {
  const subtotal = calculateInvoiceSubtotal(items)
  const normalizedTax = Number(tax || 0)
  const safeTax = Number.isFinite(normalizedTax) ? normalizedTax : 0

  return {
    subtotal,
    tax: safeTax,
    total: subtotal + safeTax,
  }
}

const validateInvoiceItems = (items = []) => {
  items.forEach((item) => {
    const normalizedItem = normalizeInvoiceItem(item)

    if (!normalizedItem.description?.trim()) {
      throw new Error('Each invoice item needs a description.')
    }

    if (!Number.isFinite(normalizedItem.quantity) || normalizedItem.quantity <= 0) {
      throw new Error('Each invoice item quantity must be greater than 0.')
    }

    if (!Number.isFinite(normalizedItem.unit_price) || normalizedItem.unit_price < 0) {
      throw new Error('Each invoice item unit price must be 0 or more.')
    }
  })
}

const buildInvoiceItemsPayload = ({ items, invoiceId, userId }) => {
  return items.map((item) => {
    const normalizedItem = normalizeInvoiceItem(item)

    return stripEmptyFields({
      invoice_id: invoiceId,
      user_id: userId,
      description: normalizedItem.description.trim(),
      quantity: normalizedItem.quantity,
      unit_price: normalizedItem.unit_price,
      line_total: normalizedItem.line_total,
    })
  })
}

const normalizeEmail = (email = '') => email.trim().toLowerCase()

const findClientById = async (clientId, userId) => {
  if (!clientId) return null

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, phone, created_at')
    .eq('id', clientId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

const findClientByEmail = async (email, userId) => {
  const normalizedEmail = normalizeEmail(email)

  if (!normalizedEmail) return null

  const { data, error } = await supabase
    .from('clients')
    .select('id, name, email, phone, created_at')
    .eq('email', normalizedEmail)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (error) throw error

  return data?.[0] || null
}

const findOrCreateClient = async ({ id, name, email, phone, userId }) => {
  const normalizedEmail = normalizeEmail(email)

  if (id) {
    const existingClient = await findClientById(id, userId)

    if (existingClient) {
      if (phone?.trim() && !existingClient.phone) {
        const { data: updatedClient, error: updateError } = await supabase
          .from('clients')
          .update({ phone: phone.trim() })
          .eq('id', existingClient.id)
          .eq('user_id', userId)
          .select('id, name, email, phone, created_at')
          .single()

        if (updateError) throw updateError
        return updatedClient
      }

      return existingClient
    }
  }

  const existingClient = await findClientByEmail(normalizedEmail, userId)

  if (existingClient) {
    if (phone?.trim() && !existingClient.phone) {
      const { data: updatedClient, error: updateError } = await supabase
        .from('clients')
        .update({ phone: phone.trim() })
        .eq('id', existingClient.id)
        .eq('user_id', userId)
        .select('id, name, email, phone, created_at')
        .single()

      if (updateError) throw updateError
      return updatedClient
    }

    return existingClient
  }

  const { data: newClient, error: createError } = await supabase
    .from('clients')
    .insert([stripEmptyFields({ name, email: normalizedEmail, phone, user_id: userId })])
    .select()
    .single()

  if (createError) throw createError

  return newClient
}

const getBookingContext = async (bookingId, userId) => {
  if (!bookingId) return null

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      total_price,
      enquiry_id,
      enquiries (
        id,
        event_type,
        event_date,
        venue,
        status,
        client_id,
        clients (
          id,
          name,
          email,
          phone
        )
      )
    `)
    .eq('id', bookingId)
    .eq('user_id', userId)
    .single()

  if (error) throw error

  return data
}

const createInvoiceWithCurrencyFallback = async (invoicePayload) => {
  const { data, error } = await supabase
    .from('invoices')
    .insert([invoicePayload])
    .select()
    .single()

  if (!error) return data

  if (!isMissingInvoiceCurrencyError(error)) throw error

  const { currency, ...payloadWithoutCurrency } = invoicePayload
  const { data: fallbackData, error: fallbackError } = await supabase
    .from('invoices')
    .insert([payloadWithoutCurrency])
    .select()
    .single()

  if (fallbackError) throw fallbackError

  return {
    ...fallbackData,
    currency,
  }
}

const getExistingInvoiceNumber = async (invoiceNumber, userId) => {
  const { data, error } = await supabase
    .from('invoices')
    .select('id')
    .eq('invoice_number', invoiceNumber)
    .eq('user_id', userId)
    .limit(1)

  if (error) throw error

  return data?.[0] || null
}

const createAvailableInvoiceNumber = async (settings, requestedInvoiceNumber, userId) => {
  if (requestedInvoiceNumber) {
    const existingInvoice = await getExistingInvoiceNumber(requestedInvoiceNumber, userId)

    if (existingInvoice) {
      throw new Error('Invoice number is already in use. Choose another number or update Settings next invoice number.')
    }

    return {
      invoiceNumber: requestedInvoiceNumber,
      usedInvoiceNumberValue: null,
    }
  }

  const nextInvoiceNumber = getNextInvoiceNumberValue(settings)
  const prefix = settings.invoice_prefix || 'INV'

  if (!nextInvoiceNumber) {
    return {
      invoiceNumber: createSettingsInvoiceNumber(settings),
      usedInvoiceNumberValue: null,
    }
  }

  for (let offset = 0; offset < 100; offset += 1) {
    const candidateNumberValue = nextInvoiceNumber + offset
    const candidateInvoiceNumber = `${prefix}-${candidateNumberValue}`
    const existingInvoice = await getExistingInvoiceNumber(candidateInvoiceNumber, userId)

    if (!existingInvoice) {
      return {
        invoiceNumber: candidateInvoiceNumber,
        usedInvoiceNumberValue: candidateNumberValue,
      }
    }
  }

  return {
    invoiceNumber: `${prefix}-${Date.now()}`,
    usedInvoiceNumberValue: null,
  }
}

export const createInvoiceWorkflow = async ({
  client,
  enquiry = {},
  booking = {},
  event = null,
  invoice = {},
  items = [],
  enquiryStatusAfterInvoice = 'booked',
}) => {
  const normalizedEmail = normalizeEmail(client?.email)
  const userId = await getCurrentUserId()
  const existingBookingId = booking?.id || booking?.booking_id || null

  if (!isValidEmail(normalizedEmail)) {
    throw new Error('A valid client email is required to create an invoice.')
  }

  if (!items.length) {
    throw new Error('At least one invoice item is required.')
  }

  validateInvoiceItems(items)

  const settings = await fetchAppSettings()
  const invoiceSubtotal = invoice.subtotal ?? calculateInvoiceSubtotal(items)
  const defaultTaxRate = Number(settings.default_tax_rate || 0)
  const invoiceTax = invoice.tax ?? (Number(invoiceSubtotal) * defaultTaxRate) / 100
  const invoiceTotal = invoice.total ?? Number(invoiceSubtotal) + Number(invoiceTax)
  const { invoiceNumber, usedInvoiceNumberValue } = await createAvailableInvoiceNumber(
    settings,
    invoice.invoice_number,
    userId
  )
  const invoiceDueDate = invoice.due_date || getDateAfterDays(settings.default_due_days)
  const invoiceCurrency = invoice.currency || settings.currency

  try {
    if (existingBookingId) {
      const existingBooking = await getBookingContext(existingBookingId, userId)
      const bookingClient = existingBooking?.enquiries?.clients
      const bookingClientEmail = normalizeEmail(bookingClient?.email)

      if (!bookingClient?.id || !bookingClientEmail) {
        throw new Error(
          'This booking is missing a linked customer with a valid email.'
        )
      }

      const invoicePayload = stripEmptyFields({
        client_id: bookingClient.id,
        user_id: userId,
        booking_id: existingBooking.id,
        invoice_number: invoiceNumber,
        status: invoice.status || 'draft',
        subtotal: invoiceSubtotal,
        tax: invoiceTax,
        total: invoiceTotal,
        currency: invoiceCurrency,
        due_date: invoiceDueDate,
        notes: invoice.notes,
      })

      const savedInvoice = await createInvoiceWithCurrencyFallback(invoicePayload)

      const invoiceItems = buildInvoiceItemsPayload({
        items,
        invoiceId: savedInvoice.id,
        userId,
      })

      const { data: savedItems, error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems)
        .select()

      if (itemsError) throw itemsError

      await incrementSettingsInvoiceNumber(settings, usedInvoiceNumberValue)

      await logActivity({
        entityType: 'invoice',
        entityId: savedInvoice.id,
        bookingId: existingBooking.id,
        clientId: bookingClient.id,
        action: 'invoice_created_from_booking',
        title: 'Invoice created',
        description: 'An invoice was created from this booking.',
        metadata: {
          invoice_id: savedInvoice.id,
          invoice_number: savedInvoice.invoice_number,
        },
      })

      return {
        client: bookingClient,
        enquiry: existingBooking.enquiries,
        booking: existingBooking,
        event: null,
        invoice: savedInvoice,
        items: savedItems,
        currency: invoiceCurrency,
      }
    }

    const savedClient = await findOrCreateClient({
      ...client,
      email: normalizedEmail,
      userId,
    })

    const { data: savedEnquiry, error: enquiryError } = await supabase
      .from('enquiries')
      .insert([
        stripEmptyFields({
          client_id: savedClient.id,
          user_id: userId,
          event_type: enquiry.event_type || event?.event_type,
          event_date: enquiry.event_date || event?.event_date,
          venue: enquiry.venue || event?.venue || event?.location,
          status: enquiry.status || 'new',
          notes: enquiry.notes,
        }),
      ])
      .select()
      .single()

    if (enquiryError) throw enquiryError

    const { data: savedBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert([
        stripEmptyFields({
          enquiry_id: savedEnquiry.id,
          user_id: userId,
          status: booking.status || settings.default_booking_status || 'pending',
          total_price: booking.total_price ?? invoiceTotal,
          notes: booking.notes,
        }),
      ])
      .select()
      .single()

    if (bookingError) throw bookingError

    let savedEvent = null

    if (event) {
      const eventNotes = [
        event.event_type,
        event.event_date,
        event.venue,
        event.notes,
      ]
        .filter(Boolean)
        .join(' | ')

      const { data: createdEvent, error: eventError } = await supabase
        .from('events')
        .insert([
          stripEmptyFields({
            booking_id: savedBooking.id,
            user_id: userId,
            location: event.location || event.venue,
            start_time: event.start_time,
            end_time: event.end_time,
            notes: eventNotes,
          }),
        ])
        .select()
        .single()

      if (eventError) throw eventError
      savedEvent = createdEvent
    }

    const invoicePayload = stripEmptyFields({
      client_id: savedClient.id,
      user_id: userId,
      booking_id: savedBooking.id,
      invoice_number: invoiceNumber,
      status: invoice.status || 'draft',
      subtotal: invoiceSubtotal,
      tax: invoiceTax,
      total: invoiceTotal,
      currency: invoiceCurrency,
      due_date: invoiceDueDate,
      notes: invoice.notes,
    })

    const savedInvoice = await createInvoiceWithCurrencyFallback(invoicePayload)

    const invoiceItems = buildInvoiceItemsPayload({
      items,
      invoiceId: savedInvoice.id,
      userId,
    })

    const { data: savedItems, error: itemsError } = await supabase
      .from('invoice_items')
      .insert(invoiceItems)
      .select()

    if (itemsError) throw itemsError

    await incrementSettingsInvoiceNumber(settings, usedInvoiceNumberValue)

    const { error: updateEnquiryError } = await supabase
      .from('enquiries')
      .update({ status: enquiryStatusAfterInvoice })
      .eq('id', savedEnquiry.id)
      .eq('user_id', userId)

    if (updateEnquiryError) throw updateEnquiryError

    return {
      client: savedClient,
      enquiry: { ...savedEnquiry, status: enquiryStatusAfterInvoice },
      booking: savedBooking,
      event: savedEvent,
      invoice: savedInvoice,
      items: savedItems,
      currency: invoiceCurrency,
    }
  } catch (error) {
    console.error('createInvoiceWorkflow failed:', error)
    throw error
  }
}
