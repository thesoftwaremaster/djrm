import { supabase } from '../supabase'
import { logActivity } from './activityLogActions'
import { assertCurrentUserCanDelete } from '../utils/demoMode'
import { getCurrentUserId } from '../utils/tenant'

const getDeleteErrorMessage = (error, fallbackMessage) => {
  if (!error) return fallbackMessage

  if (error.code === '42501') {
    return 'Supabase blocked invoice deletion due to RLS.'
  }

  if (error.code === '23503') {
    const linkedTable = error.message?.match(/table "([^"]+)"/)?.[1]
    return linkedTable
      ? `Invoice has linked records in ${linkedTable}.`
      : 'Invoice has linked records and cannot be deleted.'
  }

  return error.message || fallbackMessage
}

export const getInvoiceDeleteDependencies = async ({ invoiceId }) => {
  if (!invoiceId) {
    throw new Error('Invoice ID is required.')
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, booking_id')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) throw invoiceError

  const [
    { count: paymentCount, error: paymentError },
    { data: paymentTotals, error: paymentTotalError },
    { count: itemCount, error: itemError },
    { count: activityCount, error: activityError },
  ] = await Promise.all([
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId),
    supabase
      .from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId),
    supabase
      .from('invoice_items')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId),
    supabase
      .from('activity_logs')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'invoice')
      .eq('entity_id', invoiceId),
  ])

  if (paymentError) throw paymentError
  if (paymentTotalError) throw paymentTotalError
  if (itemError) throw itemError
  if (activityError) throw activityError

  const paymentTotal = (paymentTotals || []).reduce((sum, payment) => {
    return sum + Number(payment.amount || 0)
  }, 0)

  return {
    invoiceNumber: invoice?.invoice_number || '',
    paymentCount: paymentCount || 0,
    paymentTotal,
    itemCount: itemCount || 0,
    bookingLinkCount: invoice?.booking_id ? 1 : 0,
    activityLogCount: activityCount || 0,
  }
}

export const deleteInvoiceWorkflow = async ({ invoiceId }) => {
  await assertCurrentUserCanDelete()
  const userId = await getCurrentUserId()

  if (!invoiceId) {
    throw new Error('Invoice ID is required.')
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, booking_id, client_id')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .single()

  if (invoiceError) throw invoiceError

  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('id, paid, amount, type')
    .eq('invoice_id', invoiceId)
    .eq('user_id', userId)

  if (paymentError) throw paymentError

  const paymentIds = (payments || []).map((payment) => payment.id)
  const paymentTotal = (payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)

  if (paymentIds.length > 0) {
    const { data: deletedPayments, error: paymentDeleteError } = await supabase
      .from('payments')
      .delete()
      .eq('user_id', userId)
      .in('id', paymentIds)
      .select('id')

    if (paymentDeleteError) {
      throw new Error(getDeleteErrorMessage(paymentDeleteError, 'Could not delete invoice payments.'))
    }

    if ((deletedPayments || []).length !== paymentIds.length) {
      throw new Error('One or more linked payments could not be deleted.')
    }
  }

  const { error: itemDeleteError } = await supabase
    .from('invoice_items')
    .delete()
    .eq('invoice_id', invoiceId)
    .eq('user_id', userId)

  if (itemDeleteError) {
    throw new Error(getDeleteErrorMessage(itemDeleteError, 'Could not delete invoice items.'))
  }

  const { data: deletedInvoice, error: invoiceDeleteError } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()

  if (invoiceDeleteError) {
    throw new Error(getDeleteErrorMessage(invoiceDeleteError, 'Could not delete invoice.'))
  }

  if (!deletedInvoice) {
    throw new Error('Supabase blocked invoice deletion due to RLS.')
  }

  try {
    await logActivity({
      entityType: 'invoice',
      entityId: invoice.id,
      bookingId: invoice.booking_id,
      clientId: invoice.client_id,
      action: 'invoice_deleted',
      title: 'Invoice deleted',
      description: paymentIds.length > 0
        ? 'Invoice, linked payments, and linked invoice items were deleted.'
        : 'Invoice and linked invoice items were deleted.',
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        deleted_payment_count: paymentIds.length,
        deleted_payment_total: paymentTotal,
      },
    })
  } catch (activityLogError) {
    console.warn('Activity log failed:', activityLogError)
  }
}
