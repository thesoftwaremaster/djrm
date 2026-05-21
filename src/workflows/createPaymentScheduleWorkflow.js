import { supabase } from '../supabase'
import { logActivity } from './activityLogActions'
import { fetchAppSettings } from '../utils/appSettings'

const roundCurrency = (value) => {
  return Math.round(Number(value || 0) * 100) / 100
}

const getTodayDate = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export const createPaymentScheduleWorkflow = async ({ invoiceId }) => {
  if (!invoiceId) {
    throw new Error('Invoice is required to create a payment schedule.')
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id, total, due_date, booking_id, client_id')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) throw invoiceError

  if (!invoice) {
    throw new Error('Invoice not found. Reload invoices and try again.')
  }

  const invoiceTotal = roundCurrency(invoice.total)

  if (invoiceTotal <= 0) {
    throw new Error('Add invoice items before creating a payment schedule.')
  }

  const { data: existingScheduleRows, error: existingScheduleError } = await supabase
    .from('payments')
    .select('id, type, paid')
    .eq('invoice_id', invoiceId)
    .eq('paid', false)
    .in('type', ['deposit', 'balance'])

  if (existingScheduleError) throw existingScheduleError

  if ((existingScheduleRows || []).length > 0) {
    throw new Error('This invoice already has unpaid deposit or balance schedule rows.')
  }

  const settings = await fetchAppSettings()
  const depositPercentage = Number(settings.default_deposit_percentage ?? 50)
  const safeDepositPercentage = Number.isFinite(depositPercentage)
    ? Math.min(100, Math.max(0, depositPercentage))
    : 50
  const depositAmount = roundCurrency(invoiceTotal * (safeDepositPercentage / 100))
  const balanceAmount = roundCurrency(invoiceTotal - depositAmount)

  const { data: payments, error: paymentError } = await supabase
    .from('payments')
    .insert([
      {
        invoice_id: invoice.id,
        booking_id: invoice.booking_id,
        amount: depositAmount,
        type: 'deposit',
        paid: false,
        due_date: getTodayDate(),
      },
      {
        invoice_id: invoice.id,
        booking_id: invoice.booking_id,
        amount: balanceAmount,
        type: 'balance',
        paid: false,
        due_date: invoice.due_date || null,
      },
    ])
    .select('id, type, amount, paid, due_date')

  if (paymentError) throw paymentError

  await logActivity({
    entityType: 'invoice',
    entityId: invoice.id,
    bookingId: invoice.booking_id,
    clientId: invoice.client_id,
    action: 'payment_schedule_created',
    title: 'Payment schedule created',
    description: `A ${safeDepositPercentage}% deposit and balance payment schedule was added.`,
    metadata: {
      invoice_id: invoice.id,
      payment_ids: (payments || []).map((payment) => payment.id),
      deposit_amount: depositAmount,
      balance_amount: balanceAmount,
      deposit_percentage: safeDepositPercentage,
    },
  })

  return payments || []
}
