export const getInvoicedTotal = (invoices = []) => {
  return invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0)
}

export const getBookingDisplayTotal = (booking = {}) => {
  const directTotal = Number(booking?.total_price || 0)

  if (directTotal > 0) return directTotal

  return getInvoicedTotal(booking?.invoices || [])
}
