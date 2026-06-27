import { supabase } from '../supabase'
import { assertCurrentUserCanDelete } from '../utils/demoMode'
import { getCurrentUserId } from '../utils/tenant'

const CONTRACT_BUCKET = 'contracts'
export const BOOKING_DELETE_BLOCKED_MESSAGE =
  'This booking cannot be deleted because it has linked records.'

const logBookingDeleteStep = (step, details = {}) => {
  console.info(`[deleteBookingGuarded] ${step}`, details)
}

const logBookingDeleteError = (step, error, details = {}) => {
  console.error(`[deleteBookingGuarded] ${step} failed`, {
    ...details,
    error,
  })
}

const getDeleteErrorMessage = (error, fallbackMessage) => {
  if (error?.code === '42501') {
    return 'Supabase blocked deletion due to RLS.'
  }

  if (error?.code === '23503') {
    const linkedTable = error.message?.match(/table "([^"]+)"/)?.[1]
    return linkedTable
      ? `This record has linked rows in ${linkedTable}.`
      : 'This record has linked rows and cannot be deleted.'
  }

  return error?.message || fallbackMessage
}

export const getCustomerDeleteDependencies = async ({ customerId }) => {
  const [{ count: enquiryCount, error: enquiryError }, { data: invoices, error: invoiceError }, { data: bookings, error: bookingError }] =
    await Promise.all([
      supabase
        .from('enquiries')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', customerId),
      supabase
        .from('invoices')
        .select('id')
        .eq('client_id', customerId),
      supabase
        .from('bookings')
        .select(`
          id,
          enquiries!inner (
            client_id
          )
        `)
        .eq('enquiries.client_id', customerId),
    ])

  if (enquiryError) throw enquiryError
  if (invoiceError) throw invoiceError
  if (bookingError) throw bookingError

  const directInvoiceIds = invoices?.map((invoice) => invoice.id) || []
  const bookingIds = bookings?.map((booking) => booking.id) || []
  const invoiceIds = new Set(directInvoiceIds)
  const paymentIds = new Set()
  let eventCount = 0
  let contractCount = 0

  if (bookingIds.length > 0) {
    const { data: bookingInvoices, error: bookingInvoiceError } = await supabase
      .from('invoices')
      .select('id')
      .in('booking_id', bookingIds)

    if (bookingInvoiceError) throw bookingInvoiceError

    for (const invoice of bookingInvoices || []) {
      invoiceIds.add(invoice.id)
    }
  }

  const allInvoiceIds = Array.from(invoiceIds)

  if (allInvoiceIds.length > 0) {
    const { data: invoicePayments, error: paymentError } = await supabase
      .from('payments')
      .select('id')
      .in('invoice_id', allInvoiceIds)

    if (paymentError) throw paymentError
    for (const payment of invoicePayments || []) {
      paymentIds.add(payment.id)
    }
  }

  if (bookingIds.length > 0) {
    const [
      { data: bookingPayments, error: bookingPaymentError },
      { count: linkedEventCount, error: eventError },
      { count: linkedContractCount, error: contractError },
    ] = await Promise.all([
      supabase
        .from('payments')
        .select('id')
        .in('booking_id', bookingIds),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .in('booking_id', bookingIds),
      supabase
        .from('booking_contracts')
        .select('id', { count: 'exact', head: true })
        .in('booking_id', bookingIds),
    ])

    if (bookingPaymentError) throw bookingPaymentError
    if (eventError) throw eventError
    if (contractError) throw contractError

    for (const payment of bookingPayments || []) {
      paymentIds.add(payment.id)
    }
    eventCount = linkedEventCount || 0
    contractCount = linkedContractCount || 0
  }

  return {
    enquiryCount: enquiryCount || 0,
    invoiceCount: allInvoiceIds.length,
    bookingCount: bookings?.length || 0,
    paymentCount: paymentIds.size,
    eventCount,
    contractCount,
  }
}

export const deleteCustomerGuarded = async ({ customerId }) => {
  await assertCurrentUserCanDelete()

  const dependencies = await getCustomerDeleteDependencies({ customerId })

  if (
    dependencies.enquiryCount > 0 ||
    dependencies.invoiceCount > 0 ||
    dependencies.bookingCount > 0 ||
    dependencies.paymentCount > 0 ||
    dependencies.eventCount > 0 ||
    dependencies.contractCount > 0
  ) {
    // TODO: Future improvement: add archived_at or is_archived.
    // TODO: Future improvement: hide archived records from default queries.
    // TODO: Future improvement: prevent creating new invoices for archived customers.
    throw new Error('This customer cannot be deleted because they have linked records. Delete or resolve linked records first.')
  }

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', customerId)

  if (error) throw error
}

export const getEnquiryDeleteDependencies = async ({ enquiryId }) => {
  const { count, error } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('enquiry_id', enquiryId)

  if (error) throw error

  return {
    bookingCount: count || 0,
  }
}

export const deleteEnquiryGuarded = async ({ enquiryId }) => {
  await assertCurrentUserCanDelete()

  const dependencies = await getEnquiryDeleteDependencies({ enquiryId })

  if (dependencies.bookingCount > 0) {
    throw new Error(
      'This enquiry cannot be deleted because a linked booking already exists.'
    )
  }

  const { error } = await supabase
    .from('enquiries')
    .delete()
    .eq('id', enquiryId)

  if (error) throw error
}

export const getBookingDeleteDependencies = async ({ bookingId }) => {
  const [
    { data: invoices, error: invoiceError },
    { data: bookingPayments, error: paymentError },
    { count: eventCount, error: eventError },
    { count: contractCount, error: contractError },
  ] =
    await Promise.all([
      supabase
        .from('invoices')
        .select('id')
        .eq('booking_id', bookingId),
      supabase
        .from('payments')
        .select('id')
        .eq('booking_id', bookingId),
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId),
      supabase
        .from('booking_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId),
    ])

  if (invoiceError) throw invoiceError
  if (paymentError) throw paymentError
  if (eventError) throw eventError
  if (contractError) throw contractError

  const invoiceIds = (invoices || []).map((invoice) => invoice.id)
  const paymentIds = new Set((bookingPayments || []).map((payment) => payment.id))

  if (invoiceIds.length > 0) {
    const { data: invoicePayments, error: invoicePaymentError } = await supabase
      .from('payments')
      .select('id')
      .in('invoice_id', invoiceIds)

    if (invoicePaymentError) throw invoicePaymentError

    for (const payment of invoicePayments || []) {
      paymentIds.add(payment.id)
    }
  }

  return {
    invoiceCount: invoices?.length || 0,
    paymentCount: paymentIds.size,
    eventCount: eventCount || 0,
    contractCount: contractCount || 0,
  }
}

const hasBookingDeleteBlockers = (dependencies) => (
  dependencies.invoiceCount > 0 ||
  dependencies.paymentCount > 0 ||
  dependencies.eventCount > 0 ||
  dependencies.contractCount > 0
)

export const deleteBookingGuarded = async ({ bookingId }) => {
  await assertCurrentUserCanDelete()
  const userId = await getCurrentUserId()

  if (!bookingId) {
    throw new Error('Booking ID is required.')
  }

  const { data: booking, error: bookingFetchError } = await supabase
    .from('bookings')
    .select(`
      id,
      user_id,
      enquiry_id,
      enquiries (
        id,
        user_id,
        client_id,
        clients (
          id,
          user_id
        )
      )
    `)
    .eq('id', bookingId)
    .eq('user_id', userId)
    .maybeSingle()

  logBookingDeleteStep('loaded booking ownership', {
    bookingId,
    bookingUserId: booking?.user_id || null,
    currentUserId: userId,
    enquiryId: booking?.enquiry_id || null,
    enquiryUserId: booking?.enquiries?.user_id || null,
    clientId: booking?.enquiries?.clients?.id || null,
    clientUserId: booking?.enquiries?.clients?.user_id || null,
  })

  if (bookingFetchError) {
    logBookingDeleteError('load booking ownership', bookingFetchError, {
      bookingId,
      currentUserId: userId,
    })
    throw bookingFetchError
  }

  if (!booking) {
    throw new Error('Booking not found. It may have been deleted or you may not have access.')
  }

  if (
    booking.enquiries?.user_id !== userId ||
    booking.enquiries?.clients?.user_id !== userId
  ) {
    console.warn('[deleteBookingGuarded] Booking has mismatched linked ownership.', {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
      enquiryId: booking.enquiry_id,
      enquiryUserId: booking.enquiries?.user_id || null,
      clientId: booking.enquiries?.clients?.id || null,
      clientUserId: booking.enquiries?.clients?.user_id || null,
    })
    throw new Error('Booking has linked records with mismatched ownership.')
  }

  const initialDependencies = await getBookingDeleteDependencies({ bookingId })

  if (hasBookingDeleteBlockers(initialDependencies)) {
    throw new Error(BOOKING_DELETE_BLOCKED_MESSAGE)
  }

  const { data: invoices, error: invoiceFetchError } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('booking_id', bookingId)
    .eq('user_id', userId)

  logBookingDeleteStep('loaded linked invoices', {
    bookingId,
    bookingUserId: booking.user_id,
    currentUserId: userId,
    invoiceCount: invoices?.length || 0,
    invoiceIds: (invoices || []).map((invoice) => invoice.id),
  })

  if (invoiceFetchError) {
    logBookingDeleteError('load linked invoices', invoiceFetchError, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw invoiceFetchError
  }

  const invoiceIds = (invoices || []).map((invoice) => invoice.id)
  const hasProtectedInvoices = invoiceIds.length > 0

  const { data: contracts, error: contractFetchError } = await supabase
    .from('booking_contracts')
    .select('id, user_id, file_path')
    .eq('booking_id', bookingId)
    .eq('user_id', userId)

  logBookingDeleteStep('loaded linked contracts', {
    bookingId,
    bookingUserId: booking.user_id,
    currentUserId: userId,
    contractCount: contracts?.length || 0,
    contractIds: (contracts || []).map((contract) => contract.id),
  })

  if (contractFetchError) {
    logBookingDeleteError('load linked contracts', contractFetchError, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw contractFetchError
  }

  const { count: bookingPaidPaymentCount, error: bookingPaymentCountError } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('user_id', userId)
    .eq('paid', true)

  logBookingDeleteStep('checked paid booking payments', {
    bookingId,
    bookingUserId: booking.user_id,
    currentUserId: userId,
    paidPaymentCount: bookingPaidPaymentCount || 0,
  })

  if (bookingPaymentCountError) {
    logBookingDeleteError('check paid booking payments', bookingPaymentCountError, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw bookingPaymentCountError
  }

  let invoicePaidPaymentCount = 0

  if (invoiceIds.length > 0) {
    const { count, error: invoicePaymentCountError } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds)
      .eq('user_id', userId)
      .eq('paid', true)

    logBookingDeleteStep('checked paid invoice payments', {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
      invoiceIds,
      paidPaymentCount: count || 0,
    })

    if (invoicePaymentCountError) {
      logBookingDeleteError('check paid invoice payments', invoicePaymentCountError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        invoiceIds,
      })
      throw invoicePaymentCountError
    }
    invoicePaidPaymentCount = count || 0
  }

  if (hasProtectedInvoices || (bookingPaidPaymentCount || 0) > 0 || invoicePaidPaymentCount > 0) {
    throw new Error(BOOKING_DELETE_BLOCKED_MESSAGE)
  }

  const contractFilePaths = (contracts || [])
    .map((contract) => contract.file_path)
    .filter(Boolean)

  if (contractFilePaths.length > 0) {
    const { error: contractFileDeleteError } = await supabase.storage
      .from(CONTRACT_BUCKET)
      .remove(contractFilePaths)

    if (contractFileDeleteError) {
      console.warn('Contract file cleanup failed:', contractFileDeleteError)
    }
  }

  if (invoiceIds.length > 0) {
    const { error: invoicePaymentDeleteError } = await supabase
      .from('payments')
      .delete()
      .in('invoice_id', invoiceIds)
      .eq('user_id', userId)

    if (invoicePaymentDeleteError) {
      logBookingDeleteError('delete invoice payments', invoicePaymentDeleteError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        invoiceIds,
      })
      throw new Error(
        getDeleteErrorMessage(invoicePaymentDeleteError, 'Could not delete invoice payment records.')
      )
    }
  }

  const { error: bookingPaymentDeleteError } = await supabase
    .from('payments')
    .delete()
    .eq('booking_id', bookingId)
    .eq('user_id', userId)

  if (bookingPaymentDeleteError) {
    logBookingDeleteError('delete booking payments', bookingPaymentDeleteError, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw new Error(
      getDeleteErrorMessage(bookingPaymentDeleteError, 'Could not delete booking payment records.')
    )
  }

  if (invoiceIds.length > 0) {
    const { error: itemDeleteError } = await supabase
      .from('invoice_items')
      .delete()
      .in('invoice_id', invoiceIds)
      .eq('user_id', userId)

    if (itemDeleteError) {
      logBookingDeleteError('delete invoice items', itemDeleteError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        invoiceIds,
      })
      throw new Error(
        getDeleteErrorMessage(itemDeleteError, 'Could not delete linked invoice items.')
      )
    }

    const { error: invoiceDeleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('booking_id', bookingId)
      .eq('user_id', userId)

    if (invoiceDeleteError) {
      logBookingDeleteError('delete invoices', invoiceDeleteError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        invoiceIds,
      })
      throw new Error(
        getDeleteErrorMessage(invoiceDeleteError, 'Could not delete linked invoices.')
      )
    }
  }

  if ((contracts || []).length > 0) {
    const { error: contractDeleteError } = await supabase
      .from('booking_contracts')
      .delete()
      .eq('booking_id', bookingId)
      .eq('user_id', userId)

    if (contractDeleteError) {
      logBookingDeleteError('delete contract records', contractDeleteError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        contractIds: (contracts || []).map((contract) => contract.id),
      })
      throw new Error(
        getDeleteErrorMessage(contractDeleteError, 'Could not delete linked contract records.')
      )
    }
  }

  const dependencies = await getBookingDeleteDependencies({ bookingId })

  if (hasBookingDeleteBlockers(dependencies)) {
    throw new Error(BOOKING_DELETE_BLOCKED_MESSAGE)
  }

  if (dependencies.eventCount > 0) {
    const { error: eventDeleteError } = await supabase
      .from('events')
      .delete()
      .eq('booking_id', bookingId)
      .eq('user_id', userId)

    if (eventDeleteError) {
      logBookingDeleteError('delete event details', eventDeleteError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
      })
      throw new Error(
        getDeleteErrorMessage(eventDeleteError, 'Could not delete linked event details.')
      )
    }
  }

  const [
    { data: activityByBooking, error: activityByBookingError },
    { data: activityByEntity, error: activityByEntityError },
  ] = await Promise.all([
    supabase
      .from('activity_logs')
      .select('id, user_id, entity_type, entity_id, booking_id')
      .eq('booking_id', bookingId)
      .eq('user_id', userId),
    supabase
      .from('activity_logs')
      .select('id, user_id, entity_type, entity_id, booking_id')
      .eq('entity_type', 'booking')
      .eq('entity_id', bookingId)
      .eq('user_id', userId),
  ])

  if (activityByBookingError) {
    logBookingDeleteError('load booking activity logs', activityByBookingError, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw activityByBookingError
  }

  if (activityByEntityError) {
    logBookingDeleteError('load booking entity activity logs', activityByEntityError, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw activityByEntityError
  }

  const activityLogMap = new Map()

  for (const activityLog of [...(activityByBooking || []), ...(activityByEntity || [])]) {
    activityLogMap.set(activityLog.id, activityLog)
  }

  const activityLogs = Array.from(activityLogMap.values())
  const activityLogIds = activityLogs.map((activityLog) => activityLog.id)

  logBookingDeleteStep('loaded owned activity logs', {
    bookingId,
    bookingUserId: booking.user_id,
    currentUserId: userId,
    activityLogCount: activityLogs.length,
    activityLogIds,
    activityLogUserIds: [...new Set(activityLogs.map((activityLog) => activityLog.user_id))],
  })

  if (activityLogIds.length > 0) {
    const { data: deletedActivityLogs, error: activityDeleteError } = await supabase
      .from('activity_logs')
      .delete()
      .eq('user_id', userId)
      .in('id', activityLogIds)
      .select('id')

    if (activityDeleteError) {
      logBookingDeleteError('delete owned activity logs', activityDeleteError, {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        activityLogIds,
      })
      throw activityDeleteError
    }

    logBookingDeleteStep('deleted owned activity logs', {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
      requestedActivityLogCount: activityLogIds.length,
      deletedActivityLogIds: (deletedActivityLogs || []).map((activityLog) => activityLog.id),
    })

    if ((deletedActivityLogs || []).length !== activityLogIds.length) {
      console.warn('[deleteBookingGuarded] Skipped activity logs not owned by current user.', {
        bookingId,
        bookingUserId: booking.user_id,
        currentUserId: userId,
        requestedActivityLogCount: activityLogIds.length,
        deletedActivityLogCount: deletedActivityLogs?.length || 0,
      })
    }
  }

  const finalDependencies = await getBookingDeleteDependencies({ bookingId })

  if (hasBookingDeleteBlockers(finalDependencies)) {
    throw new Error(BOOKING_DELETE_BLOCKED_MESSAGE)
  }

  const { data: deletedBooking, error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (error) {
    logBookingDeleteError('delete booking row', error, {
      bookingId,
      bookingUserId: booking.user_id,
      currentUserId: userId,
    })
    throw new Error(getDeleteErrorMessage(error, 'Could not delete booking.'))
  }

  if (!deletedBooking) {
    throw new Error('Supabase blocked booking deletion due to RLS.')
  }

  logBookingDeleteStep('deleted booking row', {
    bookingId,
    bookingUserId: booking.user_id,
    currentUserId: userId,
  })
}
