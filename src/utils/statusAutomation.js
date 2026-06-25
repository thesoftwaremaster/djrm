import { supabase } from '../supabase'

const protectedInvoiceStatuses = ['cancelled']
const protectedBookingStatuses = ['completed', 'cancelled']
const invoiceStatusAliases = {
  partially_paid: 'part_paid',
  'partially paid': 'part_paid',
}
const invoiceStatuses = ['draft', 'sent', 'part_paid', 'paid', 'overdue', 'cancelled']

export const normalizeInvoiceStatus = (status = 'draft') => {
  const normalizedStatus = invoiceStatusAliases[status] || status

  return invoiceStatuses.includes(normalizedStatus) ? normalizedStatus : 'draft'
}

export const getPaidTotal = (payments = []) => {
  return payments.reduce((sum, payment) => {
    if (!payment.paid) return sum
    return sum + Number(payment.amount || 0)
  }, 0)
}

export const isPastDueDate = (dueDate, today = new Date()) => {
  if (!dueDate) return false

  const due = new Date(dueDate)
  const currentDay = new Date(today)

  due.setHours(0, 0, 0, 0)
  currentDay.setHours(0, 0, 0, 0)

  return due < currentDay
}

export const calculateInvoiceStatus = ({
  invoiceTotal = 0,
  paidTotal = 0,
  dueDate = null,
  sentAt = null,
  currentStatus = 'draft',
  today = new Date(),
}) => {
  if (protectedInvoiceStatuses.includes(currentStatus)) return currentStatus

  const total = Number(invoiceTotal || 0)
  const paid = Number(paidTotal || 0)

  if (paid >= total && total > 0) return 'paid'
  if (paid > 0) return 'part_paid'
  if (isPastDueDate(dueDate, today)) return 'overdue'
  if (sentAt) return 'sent'

  return 'draft'
}

export const deriveInvoiceStatus = ({ invoice, totalPaid = 0, today = new Date() }) => {
  if (!invoice) return null

  return calculateInvoiceStatus({
    invoiceTotal: invoice.total,
    paidTotal: totalPaid,
    dueDate: invoice.due_date,
    sentAt: invoice.last_sent_at || invoice.invoice_sent_at || (
      invoice.status === 'sent' ? invoice.status : null
    ),
    currentStatus: invoice.status,
    today,
  })
}

export const derivePaymentState = ({ invoiceTotal = 0, totalPaid = 0 }) => {
  if (totalPaid <= 0) return 'No payments yet'
  if (totalPaid >= Number(invoiceTotal || 0)) return 'Fully paid'
  return 'Partially paid'
}

export const getPaymentProgress = ({ invoiceTotal = 0, totalPaid = 0 }) => {
  const total = Number(invoiceTotal || 0)

  if (total <= 0) return 0

  return Math.min(100, Math.round((totalPaid / total) * 100))
}

export const syncInvoiceAndBookingStatus = async ({ invoice, payments = [] }) => {
  if (!invoice) {
    return {
      invoiceStatus: null,
      bookingStatus: null,
    }
  }

  const totalPaid = getPaidTotal(payments)
  const invoiceStatus = deriveInvoiceStatus({ invoice, totalPaid })
  const invoiceTotal = Number(invoice.total || 0)
  const paymentStatus = totalPaid <= 0
    ? 'unpaid'
    : totalPaid >= invoiceTotal && invoiceTotal > 0
      ? 'paid'
      : 'partially_paid'
  let bookingStatus = invoice.bookings?.status || null

  if (
    invoiceStatus &&
    (
      invoiceStatus !== invoice.status ||
      Number(invoice.amount_paid || 0) !== totalPaid ||
      Number(invoice.balance_due || 0) !== Math.max(0, invoiceTotal - totalPaid) ||
      invoice.payment_status !== paymentStatus
    )
  ) {
    const invoiceUpdateQuery = supabase
      .from('invoices')
      .update({
        status: invoiceStatus,
        amount_paid: totalPaid,
        balance_due: Math.max(0, invoiceTotal - totalPaid),
        payment_status: paymentStatus,
        paid_at: paymentStatus === 'paid' ? invoice.paid_at || new Date().toISOString() : null,
      })
      .eq('id', invoice.id)

    const { error: invoiceUpdateError } = invoice.user_id
      ? await invoiceUpdateQuery.eq('user_id', invoice.user_id)
      : await invoiceUpdateQuery

    if (invoiceUpdateError) throw invoiceUpdateError
  }

  if (
    invoiceStatus === 'paid' &&
    invoice.booking_id &&
    bookingStatus !== 'confirmed' &&
    !protectedBookingStatuses.includes(bookingStatus)
  ) {
    const bookingUpdateQuery = supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', invoice.booking_id)

    const { error: bookingUpdateError } = invoice.user_id
      ? await bookingUpdateQuery.eq('user_id', invoice.user_id)
      : await bookingUpdateQuery

    if (bookingUpdateError) throw bookingUpdateError

    bookingStatus = 'confirmed'
  }

  return {
    invoiceStatus,
    bookingStatus,
  }
}
