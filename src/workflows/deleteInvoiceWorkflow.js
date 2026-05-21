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

export const deleteInvoiceWorkflow = async ({ invoiceId }) => {
  await assertCurrentUserCanDelete()
  const userId = await getCurrentUserId()

  if (!invoiceId) {
    throw new Error('Invoice ID is required.')
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, status, booking_id, client_id')
    .eq('id', invoiceId)
    .eq('user_id', userId)
    .single()

  if (invoiceError) throw invoiceError

  if (invoice.status !== 'draft') {
    throw new Error(`Only draft invoices can be deleted. Current status: ${invoice.status || 'unknown'}`)
  }

  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .select('id, paid, amount, type')
    .eq('invoice_id', invoiceId)
    .eq('user_id', userId)

  if (paymentError) throw paymentError

  if ((payments || []).some((payment) => payment.paid === true)) {
    throw new Error('Invoices with paid payments cannot be deleted.')
  }

  const paymentIds = (payments || []).map((payment) => payment.id)

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
      const { data: remainingPayments, error: remainingPaymentError } = await supabase
        .from('payments')
        .select('id, paid, amount, type')
        .eq('invoice_id', invoiceId)
        .eq('user_id', userId)

      if (remainingPaymentError) throw remainingPaymentError

      if ((remainingPayments || []).length > 0) {
        throw new Error('Invoice has linked records in payments.')
      }
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
    .eq('status', 'draft')
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
      description: 'Draft invoice and linked payment records were deleted.',
    })
  } catch (activityLogError) {
    console.warn('Activity log failed:', activityLogError)
  }
}
