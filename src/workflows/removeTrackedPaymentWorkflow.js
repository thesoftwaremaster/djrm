import { supabase } from '../supabase'
import { logActivity } from './activityLogActions'
import { assertCurrentUserCanDelete } from '../utils/demoMode'

const getDeleteErrorMessage = (error) => {
  if (error?.code === '42501') {
    return 'Supabase blocked payment deletion due to RLS.'
  }

  return error?.message || 'Could not delete payment.'
}

export const removeTrackedPaymentWorkflow = async ({ paymentId }) => {
  await assertCurrentUserCanDelete()

  if (!paymentId) {
    throw new Error('Payment ID is required.')
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, invoice_id, paid, amount, type')
    .eq('id', paymentId)
    .single()

  if (paymentError) throw paymentError

  let invoice = null

  if (payment.invoice_id) {
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select('id, booking_id, client_id')
      .eq('id', payment.invoice_id)
      .maybeSingle()

    if (invoiceError) throw invoiceError
    invoice = invoiceData
  }

  const { data: deletedPayment, error: deleteError } = await supabase
    .from('payments')
    .delete()
    .eq('id', payment.id)
    .select('id')
    .maybeSingle()

  if (deleteError) {
    throw new Error(getDeleteErrorMessage(deleteError))
  }

  if (!deletedPayment) {
    throw new Error('Payment could not be deleted.')
  }

  try {
    const paymentWasPaid = payment.paid === true

    await logActivity({
      entityType: 'payment',
      entityId: payment.id,
      bookingId: invoice?.booking_id || null,
      clientId: invoice?.client_id || null,
      action: 'payment_deleted',
      title: 'Payment deleted',
      description: paymentWasPaid
        ? 'A recorded paid payment was deleted from the invoice.'
        : 'An unpaid tracked payment was removed from the invoice.',
      metadata: {
        invoice_id: payment.invoice_id,
        payment_id: payment.id,
        type: payment.type,
        paid: payment.paid,
      },
    })
  } catch (activityLogError) {
    console.warn('Activity log failed:', activityLogError)
  }

  return payment
}
