import { supabase } from '../supabase'
import { logActivity } from './activityLogActions'

export const updateTrackedPaymentStatusWorkflow = async ({ paymentId, paid }) => {
  if (!paymentId) {
    throw new Error('Payment ID is required.')
  }

  if (typeof paid !== 'boolean') {
    throw new Error('Payment status is required.')
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('id, invoice_id, paid, amount, type')
    .eq('id', paymentId)
    .single()

  if (paymentError) throw paymentError

  const { data: updatedPayment, error: updateError } = await supabase
    .from('payments')
    .update({ paid })
    .eq('id', payment.id)
    .select('id, invoice_id, paid, amount, type')
    .single()

  if (updateError) throw updateError

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

  try {
    await logActivity({
      entityType: 'payment',
      entityId: payment.id,
      bookingId: invoice?.booking_id || null,
      clientId: invoice?.client_id || null,
      action: paid ? 'payment_marked_paid' : 'payment_marked_unpaid',
      title: paid ? 'Payment marked paid' : 'Payment marked unpaid',
      description: paid
        ? 'A tracked payment was marked as paid.'
        : 'A tracked payment was marked as unpaid.',
      metadata: {
        invoice_id: payment.invoice_id,
        payment_id: payment.id,
        type: payment.type,
        amount: payment.amount,
        previous_paid: payment.paid,
        paid,
      },
    })
  } catch (activityLogError) {
    console.warn('Activity log failed:', activityLogError)
  }

  return updatedPayment
}
