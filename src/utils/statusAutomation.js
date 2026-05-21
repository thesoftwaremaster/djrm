import { supabase } from '../supabase'

const protectedInvoiceStatuses = ['cancelled']
const protectedBookingStatuses = ['completed', 'cancelled']

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

export const deriveInvoiceStatus = ({ invoice, totalPaid = 0, today = new Date() }) => {
  if (!invoice) return null
  if (protectedInvoiceStatuses.includes(invoice.status)) return invoice.status

  const invoiceTotal = Number(invoice.total || 0)
  const isFullyPaid = invoiceTotal > 0 && totalPaid >= invoiceTotal

  if (isFullyPaid) return 'paid'
  if (invoice.status === 'draft') return 'draft'
  if (isPastDueDate(invoice.due_date, today)) return 'overdue'

  return 'sent'
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
  let bookingStatus = invoice.bookings?.status || null

  if (invoiceStatus && invoiceStatus !== invoice.status) {
    const { error: invoiceUpdateError } = await supabase
      .from('invoices')
      .update({ status: invoiceStatus })
      .eq('id', invoice.id)

    if (invoiceUpdateError) throw invoiceUpdateError
  }

  if (
    invoiceStatus === 'paid' &&
    invoice.booking_id &&
    bookingStatus !== 'confirmed' &&
    !protectedBookingStatuses.includes(bookingStatus)
  ) {
    const { error: bookingUpdateError } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', invoice.booking_id)

    if (bookingUpdateError) throw bookingUpdateError

    bookingStatus = 'confirmed'
  }

  return {
    invoiceStatus,
    bookingStatus,
  }
}
