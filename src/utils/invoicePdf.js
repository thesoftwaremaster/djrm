import { jsPDF } from 'jspdf'
import { invoiceBusinessDetails } from '../config/invoiceBusinessDetails'
import { getPaidTotal } from './statusAutomation'
import { getPaymentDetailsLines } from './appSettings'

const formatCurrency = (value, currency = 'GBP') => {
  return `${currency} ${Number(value || 0).toFixed(2)}`
}

const formatDate = (dateValue) => {
  if (!dateValue) return '-'

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) return dateValue

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const getFileSafeInvoiceNumber = (invoice) => {
  return String(invoice.invoice_number || invoice.id || 'invoice')
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

const drawMetadataItem = (doc, label, value, x, y, width) => {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(120, 130, 145)
  doc.text(label.toUpperCase(), x + width, y, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(17, 24, 39)
  doc.text(String(value || '-'), x + width, y + 5, { align: 'right' })
}

const addWrappedText = (doc, text, x, y, maxWidth, lineHeight = 5) => {
  const lines = doc.splitTextToSize(text || '-', maxWidth)
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

const getInvoiceBusinessDetails = (settings) => ({
  businessName:
    settings?.business_name ||
    settings?.display_name ||
    invoiceBusinessDetails.businessName,
  tagline: settings?.display_name || invoiceBusinessDetails.tagline,
  addressLines: settings?.address
    ? settings.address.split(/\r?\n/).filter(Boolean)
    : invoiceBusinessDetails.addressLines,
  contactLines: [
    settings?.contact_email,
    settings?.phone,
    settings?.website,
  ].filter(Boolean),
  bankLines: getPaymentDetailsLines(settings || {}),
  currency: settings?.currency || 'GBP',
  thankYou: {
    ...invoiceBusinessDetails.thankYou,
    signatureName:
      settings?.display_name ||
      settings?.business_name ||
      invoiceBusinessDetails.thankYou.signatureName,
  },
})

export const downloadInvoicePdf = ({
  invoice,
  items = [],
  payments = [],
  totalPaid = getPaidTotal(payments),
  remainingBalance,
  settings,
}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const businessDetails = getInvoiceBusinessDetails(settings)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2
  const rightEdge = pageWidth - margin
  const invoiceTotal = Number(invoice.total || 0)
  const balance = remainingBalance ?? Math.max(0, invoiceTotal - totalPaid)
  const invoiceNumber = invoice.invoice_number || `Invoice ${String(invoice.id || '').slice(0, 8)}`

  let y = 20

  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(17, 24, 39)
  doc.text(businessDetails.businessName, pageWidth / 2, y, { align: 'center' })

  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(102, 112, 133)
  doc.text(businessDetails.tagline, pageWidth / 2, y, { align: 'center' })

  const headerDetailLines = [
    ...businessDetails.contactLines,
    ...businessDetails.addressLines,
  ]

  if (headerDetailLines.length) {
    y += 6
    doc.setFontSize(8)
    doc.text(headerDetailLines.join(' | '), pageWidth / 2, y, { align: 'center' })
  }

  y += 18
  doc.setDrawColor(231, 235, 243)
  doc.line(margin, y, rightEdge, y)

  y += 16
  const blockTop = y
  const leftColumnWidth = 88
  const rightColumnX = 120
  const rightColumnWidth = 70

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(120, 130, 145)
  doc.text('ISSUED TO', margin, y)

  y += 8.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(17, 24, 39)
  doc.text(invoice.clients?.name || 'Unknown client', margin, y)

  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(75, 85, 99)
  if (invoice.clients?.email) y = addWrappedText(doc, invoice.clients.email, margin, y, leftColumnWidth, 5)
  if (invoice.clients?.phone) y = addWrappedText(doc, invoice.clients.phone, margin, y, leftColumnWidth, 5)
  if (invoice.booking_id) {
    y = addWrappedText(
      doc,
      `Booking ref: ${String(invoice.booking_id).slice(0, 8)}`,
      margin,
      y + 2,
      leftColumnWidth,
      5
    )
  }

  drawMetadataItem(doc, 'Invoice no.', invoiceNumber, rightColumnX, blockTop, rightColumnWidth)
  drawMetadataItem(doc, 'Date', formatDate(invoice.created_at || new Date()), rightColumnX, blockTop + 13, rightColumnWidth)
  drawMetadataItem(doc, 'Due date', formatDate(invoice.due_date), rightColumnX, blockTop + 26, rightColumnWidth)

  y = Math.max(y + 16, blockTop + 44)

  const tableTop = y
  const columns = {
    description: margin + 4,
    unitPrice: 121,
    quantity: 147,
    total: rightEdge - 4,
  }

  doc.setFillColor(243, 246, 251)
  doc.roundedRect(margin, tableTop, contentWidth, 12, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(102, 112, 133)
  doc.text('DESCRIPTION', columns.description, tableTop + 7.5)
  doc.text('UNIT PRICE', columns.unitPrice, tableTop + 7.5, { align: 'right' })
  doc.text('QTY', columns.quantity, tableTop + 7.5, { align: 'center' })
  doc.text('TOTAL', columns.total, tableTop + 7.5, { align: 'right' })

  y = tableTop + 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(17, 24, 39)

  const normalizedItems = items.length
    ? items
    : [{ description: 'Invoice item', quantity: 1, unit_price: invoice.total, line_total: invoice.total }]

  normalizedItems.forEach((item) => {
    const descriptionLines = doc.splitTextToSize(item.description || 'Invoice item', 82)
    const rowHeight = Math.max(15, descriptionLines.length * 5 + 6)

    if (y + rowHeight > 226) {
      doc.addPage()
      y = 26
    }

    doc.text(descriptionLines, columns.description, y)
    doc.text(formatCurrency(item.unit_price, businessDetails.currency), columns.unitPrice, y, { align: 'right' })
    doc.text(String(item.quantity || 0), columns.quantity, y, { align: 'center' })
    doc.text(formatCurrency(item.line_total, businessDetails.currency), columns.total, y, { align: 'right' })

    y += rowHeight
    doc.setDrawColor(237, 241, 247)
    doc.line(margin, y - 5, rightEdge, y - 5)
  })

  y += 10
  const totalsX = 118
  const totalsValueX = rightEdge - 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(75, 85, 99)
  doc.text('Subtotal', totalsX, y)
  doc.text(formatCurrency(invoice.subtotal, businessDetails.currency), totalsValueX, y, { align: 'right' })

  y += 8
  doc.text('Tax', totalsX, y)
  doc.text(formatCurrency(invoice.tax, businessDetails.currency), totalsValueX, y, { align: 'right' })

  y += 8
  doc.text('Paid', totalsX, y)
  doc.text(formatCurrency(totalPaid, businessDetails.currency), totalsValueX, y, { align: 'right' })

  y += 8
  doc.text('Balance due', totalsX, y)
  doc.text(formatCurrency(balance, businessDetails.currency), totalsValueX, y, { align: 'right' })

  y += 10
  doc.setFillColor(17, 24, 39)
  doc.roundedRect(totalsX - 5, y - 7, rightEdge - totalsX + 5, 14, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL', totalsX, y + 1.5)
  doc.text(formatCurrency(invoice.total, businessDetails.currency), totalsValueX, y + 1.5, { align: 'right' })

  y += 32
  if (y > 246) {
    doc.addPage()
    y = 28
  }

  doc.setDrawColor(231, 235, 243)
  doc.line(margin, y - 10, rightEdge, y - 10)

  const footerTop = y
  const footerRightX = 118
  const footerColumnWidth = 72

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(17, 24, 39)
  doc.text('Payment Details', margin, footerTop)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(75, 85, 99)
  const bankLines = businessDetails.bankLines.length
    ? businessDetails.bankLines
    : ['Payment details to be confirmed.']
  bankLines.slice(0, 8).forEach((line, index) => {
    doc.text(line, margin, footerTop + 9 + index * 5.5)
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(17, 24, 39)
  doc.text(businessDetails.thankYou.title, footerRightX, footerTop)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(75, 85, 99)
  const thankYouLines = doc.splitTextToSize(businessDetails.thankYou.message, footerColumnWidth)
  doc.text(thankYouLines, footerRightX, footerTop + 9)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(17, 24, 39)
  if (businessDetails.thankYou.signatureName) {
    doc.text(businessDetails.thankYou.signatureName, footerRightX, footerTop + 27)
  }

  doc.save(`invoice-${getFileSafeInvoiceNumber(invoice)}.pdf`)
}
