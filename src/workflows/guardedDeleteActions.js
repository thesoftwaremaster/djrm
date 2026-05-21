import { supabase } from '../supabase'
import { assertCurrentUserCanDelete } from '../utils/demoMode'

const CONTRACT_BUCKET = 'contracts'

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

  const invoiceIds = invoices?.map((invoice) => invoice.id) || []
  let paymentCount = 0

  if (invoiceIds.length > 0) {
    const { count, error: paymentError } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds)

    if (paymentError) throw paymentError
    paymentCount = count || 0
  }

  return {
    enquiryCount: enquiryCount || 0,
    invoiceCount: invoices?.length || 0,
    bookingCount: bookings?.length || 0,
    paymentCount,
  }
}

export const deleteCustomerGuarded = async ({ customerId }) => {
  await assertCurrentUserCanDelete()

  const dependencies = await getCustomerDeleteDependencies({ customerId })

  if (
    dependencies.invoiceCount > 0 ||
    dependencies.bookingCount > 0 ||
    dependencies.paymentCount > 0
  ) {
    throw new Error('Financial history is protected and cannot be deleted.')
  }

  if (dependencies.enquiryCount > 0) {
    throw new Error(
      'This customer cannot be deleted while linked enquiries still exist.'
    )
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
    { count: invoiceCount, error: invoiceError },
    { count: paymentCount, error: paymentError },
    { count: eventCount, error: eventError },
    { count: contractCount, error: contractError },
  ] =
    await Promise.all([
      supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', bookingId),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
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

  return {
    invoiceCount: invoiceCount || 0,
    paymentCount: paymentCount || 0,
    eventCount: eventCount || 0,
    contractCount: contractCount || 0,
  }
}

export const deleteBookingGuarded = async ({ bookingId }) => {
  await assertCurrentUserCanDelete()

  const { data: invoices, error: invoiceFetchError } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('booking_id', bookingId)

  if (invoiceFetchError) throw invoiceFetchError

  const invoiceIds = (invoices || []).map((invoice) => invoice.id)
  const hasProtectedInvoices = (invoices || []).some(
    (invoice) => invoice.status !== 'draft'
  )

  const { data: contracts, error: contractFetchError } = await supabase
    .from('booking_contracts')
    .select('id, file_path')
    .eq('booking_id', bookingId)

  if (contractFetchError) throw contractFetchError

  const { count: bookingPaidPaymentCount, error: bookingPaymentCountError } = await supabase
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('booking_id', bookingId)
    .eq('paid', true)

  if (bookingPaymentCountError) throw bookingPaymentCountError

  let invoicePaidPaymentCount = 0

  if (invoiceIds.length > 0) {
    const { count, error: invoicePaymentCountError } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('invoice_id', invoiceIds)
      .eq('paid', true)

    if (invoicePaymentCountError) throw invoicePaymentCountError
    invoicePaidPaymentCount = count || 0
  }

  if (hasProtectedInvoices || (bookingPaidPaymentCount || 0) > 0 || invoicePaidPaymentCount > 0) {
    throw new Error('Financial history is protected and cannot be deleted.')
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

    if (invoicePaymentDeleteError) {
      throw new Error(
        getDeleteErrorMessage(invoicePaymentDeleteError, 'Could not delete invoice payment records.')
      )
    }
  }

  const { error: bookingPaymentDeleteError } = await supabase
    .from('payments')
    .delete()
    .eq('booking_id', bookingId)

  if (bookingPaymentDeleteError) {
    throw new Error(
      getDeleteErrorMessage(bookingPaymentDeleteError, 'Could not delete booking payment records.')
    )
  }

  if (invoiceIds.length > 0) {
    const { error: itemDeleteError } = await supabase
      .from('invoice_items')
      .delete()
      .in('invoice_id', invoiceIds)

    if (itemDeleteError) {
      throw new Error(
        getDeleteErrorMessage(itemDeleteError, 'Could not delete linked invoice items.')
      )
    }

    const { error: invoiceDeleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('booking_id', bookingId)

    if (invoiceDeleteError) {
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

    if (contractDeleteError) {
      throw new Error(
        getDeleteErrorMessage(contractDeleteError, 'Could not delete linked contract records.')
      )
    }
  }

  const dependencies = await getBookingDeleteDependencies({ bookingId })

  if (dependencies.eventCount > 0) {
    const { error: eventDeleteError } = await supabase
      .from('events')
      .delete()
      .eq('booking_id', bookingId)

    if (eventDeleteError) {
      throw new Error(
        getDeleteErrorMessage(eventDeleteError, 'Could not delete linked event details.')
      )
    }
  }

  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId)

  if (error) {
    throw new Error(getDeleteErrorMessage(error, 'Could not delete booking.'))
  }
}
