type PdfLineItem = {
  description: string
  quantity: string
  unitPrice: string
  lineTotal: string
}

type InvoicePdfParams = {
  businessName?: string | null
  businessTagline?: string | null
  invoiceNumber: string
  status: string
  clientName?: string | null
  clientEmail?: string | null
  clientPhone?: string | null
  subtotal: string
  tax: string
  total: string
  amountPaid: string
  balanceDue: string
  dueDate: string
  issuedDate: string
  eventDate?: string | null
  eventType?: string | null
  paymentLink?: string | null
  paymentMethodLines?: string[]
  contactEmail: string
  footerText?: string | null
  thankYouMessage?: string | null
  lineItems: PdfLineItem[]
  notes?: string | null
}

const pageWidth = 595
const pageHeight = 842
const margin = 52
const contentWidth = pageWidth - margin * 2
const rightEdge = pageWidth - margin
const footerY = 66

const colors = {
  brand: '0.10 0.12 0.16',
  brandMuted: '0.35 0.39 0.46',
  border: '0.88 0.90 0.94',
  darkBorder: '0.78 0.81 0.87',
  soft: '0.97 0.98 0.99',
  card: '0.99 0.99 0.99',
  white: '1 1 1',
}

const escapePdfText = (value: string | number | null | undefined) => {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

const sanitizeFilename = (value: string) => {
  const safeName = value
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return safeName || 'invoice'
}

const wrapText = (value: string | null | undefined, maxChars: number) => {
  const words = String(value || '-').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let currentLine = ''

  words.forEach((word) => {
    const chunks = word.length > maxChars
      ? word.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [word]
      : [word]

    chunks.forEach((chunk) => {
      const candidate = currentLine ? `${currentLine} ${chunk}` : chunk

      if (candidate.length <= maxChars) {
        currentLine = candidate
        return
      }

      if (currentLine) lines.push(currentLine)
      currentLine = chunk
    })
  })

  if (currentLine) lines.push(currentLine)

  return lines.length ? lines : ['-']
}

const wrapLines = (values: string[], maxChars: number, maxLines: number) => {
  const wrappedLines = values.flatMap((value) => wrapText(value, maxChars))

  return wrappedLines.slice(0, maxLines)
}

const normalizeLineForDedupe = (value: string) => {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

const getUniqueLines = (values: string[]) => {
  const seenLines = new Set<string>()
  const lines: string[] = []

  values
    .flatMap((value) => String(value || '').split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => {
      const key = normalizeLineForDedupe(value)
      if (seenLines.has(key)) return

      seenLines.add(key)
      lines.push(value)
    })

  return lines
}

const shouldLogPaymentDetailsRender = () => {
  return ['development', 'local', 'true'].includes(
    String(Deno.env.get('ENVIRONMENT') || Deno.env.get('SUPABASE_ENV') || '').toLowerCase()
  )
}

const text = (value: string | number | null | undefined, x: number, y: number, options: {
  size?: number
  font?: 'regular' | 'bold'
  color?: string
  align?: 'left' | 'right' | 'center'
} = {}) => {
  const size = options.size || 10
  const font = options.font === 'bold' ? 'F2' : 'F1'
  const color = options.color || '0.10 0.12 0.16'
  const align = options.align || 'left'
  const escapedValue = escapePdfText(value)

  if (align === 'left') {
    return `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${escapedValue}) Tj ET\n`
  }

  const widthEstimate = escapedValue.length * size * 0.5
  const adjustedX = align === 'right'
    ? x - widthEstimate
    : x - widthEstimate / 2

  return `BT /${font} ${size} Tf ${color} rg ${adjustedX} ${y} Td (${escapedValue}) Tj ET\n`
}

const rect = (x: number, y: number, width: number, height: number, color: string) => {
  return `q ${color} rg ${x} ${y} ${width} ${height} re f Q\n`
}

const roundedRect = ({
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
}: {
  x: number
  y: number
  width: number
  height: number
  radius: number
  fill: string
  stroke?: string
}) => {
  const right = x + width
  const top = y + height
  const curve = radius * 0.55228475
  const paint = stroke ? 'B' : 'f'

  return [
    'q',
    `${fill} rg`,
    stroke ? `${stroke} RG 1 w` : '',
    `${x + radius} ${y} m`,
    `${right - radius} ${y} l`,
    `${right - radius + curve} ${y} ${right} ${y + radius - curve} ${right} ${y + radius} c`,
    `${right} ${top - radius} l`,
    `${right} ${top - radius + curve} ${right - radius + curve} ${top} ${right - radius} ${top} c`,
    `${x + radius} ${top} l`,
    `${x + radius - curve} ${top} ${x} ${top - radius + curve} ${x} ${top - radius} c`,
    `${x} ${y + radius} l`,
    `${x} ${y + radius - curve} ${x + radius - curve} ${y} ${x + radius} ${y} c`,
    `${paint}`,
    'Q',
    '',
  ].filter(Boolean).join('\n')
}

const line = (x1: number, y1: number, x2: number, y2: number, color = '0.90 0.92 0.95') => {
  return `q ${color} RG 1 w ${x1} ${y1} m ${x2} ${y2} l S Q\n`
}

const labelValue = (
  label: string,
  value: string | null | undefined,
  labelX: number,
  valueX: number,
  y: number
) => {
  return [
    text(label.toUpperCase(), labelX, y, { size: 8, font: 'bold', color: colors.brandMuted }),
    text(value || '-', valueX, y, { size: 10, font: 'bold', align: 'right' }),
  ].join('')
}

const totalRow = (
  label: string,
  value: string,
  y: number
) => {
  return [
    text(label, 362, y, {
      size: 10,
      color: colors.brandMuted,
    }),
    text(value, rightEdge, y, {
      size: 10,
      color: colors.brand,
      align: 'right',
    }),
  ].join('')
}

const normalizeStatus = (status: string) => {
  return String(status || 'Awaiting Payment')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

const isZeroAmount = (value: string) => {
  const numericValue = Number(String(value || '').replace(/[^0-9.-]/g, ''))

  return Number.isFinite(numericValue) && numericValue <= 0
}

const buildPdfContent = ({
  invoiceNumber,
  businessName,
  businessTagline,
  status,
  clientName,
  clientEmail,
  clientPhone,
  subtotal,
  tax,
  total,
  amountPaid,
  balanceDue,
  dueDate,
  issuedDate,
  eventDate,
  eventType,
  paymentLink,
  paymentMethodLines = [],
  contactEmail,
  footerText,
  thankYouMessage,
  lineItems,
  notes,
}: InvoicePdfParams) => {
  let content = ''
  let y = 778
  const statusLabel = normalizeStatus(status)
  const isPaid = statusLabel.toLowerCase() === 'paid' || isZeroAmount(balanceDue)

  content += rect(0, 0, pageWidth, pageHeight, colors.white)
  const displayBusinessName = businessName || 'DJRM'
  const displayTagline = businessTagline || 'PROFESSIONAL DJ BUSINESS MANAGEMENT'
  const displayThankYou = thankYouMessage || 'Thank you for choosing DJRM.'
  const displayFooter = footerText || 'A4 print-ready invoice'

  content += text(displayBusinessName, pageWidth / 2, y, {
    size: 32,
    font: 'bold',
    color: colors.brand,
    align: 'center',
  })
  content += text(displayTagline.toUpperCase(), pageWidth / 2, y - 22, {
    size: 7.5,
    color: colors.brandMuted,
    align: 'center',
  })

  y -= 84
  content += text('INVOICE', pageWidth / 2, y, {
    size: 20,
    font: 'bold',
    color: colors.brand,
    align: 'center',
  })

  y -= 58
  const headerTop = y
  const rightLabelX = 340

  content += text('ISSUED TO', margin, headerTop, { size: 8, font: 'bold', color: colors.brandMuted })
  content += text(clientName || 'Client', margin, headerTop - 24, { size: 17, font: 'bold' })
  content += text(clientEmail || '-', margin, headerTop - 44, { size: 10, color: colors.brandMuted })
  if (clientPhone) {
    content += text(clientPhone, margin, headerTop - 60, { size: 10, color: colors.brandMuted })
  }

  content += labelValue('Invoice No.', invoiceNumber, rightLabelX, rightEdge, headerTop)
  content += labelValue('Issue Date', issuedDate, rightLabelX, rightEdge, headerTop - 20)
  content += labelValue('Due Date', dueDate, rightLabelX, rightEdge, headerTop - 40)
  content += labelValue('Status', isPaid ? 'Paid' : statusLabel, rightLabelX, rightEdge, headerTop - 60)

  y = headerTop - 88
  content += line(margin, y + 18, rightEdge, y + 18, colors.border)

  if (eventDate || eventType) {
    content += text(
      `Event: ${[eventType, eventDate].filter(Boolean).join(' | ')}`,
      margin,
      y,
      { size: 9.5, color: colors.brandMuted }
    )
    y -= 38
  } else {
    y -= 20
  }

  const normalizedItems = lineItems.length
    ? lineItems
    : [{ description: 'Invoice item', quantity: '1', unitPrice: total, lineTotal: total }]
  const tableItems = normalizedItems
  const rowHeights = tableItems.map((item) => {
    const descriptionLines = wrapText(item.description || 'Invoice item', 52).slice(0, 3)

    return Math.max(34, descriptionLines.length * 12 + 16)
  })
  const tableHeaderHeight = 32
  const tableBodyHeight = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + 12
  const tableHeight = tableHeaderHeight + tableBodyHeight
  const tableTop = y
  const tableBottom = tableTop - tableHeight

  content += roundedRect({
    x: margin,
    y: tableBottom,
    width: contentWidth,
    height: tableHeight,
    radius: 14,
    fill: colors.white,
    stroke: colors.darkBorder,
  })
  content += roundedRect({
    x: margin,
    y: tableTop - tableHeaderHeight,
    width: contentWidth,
    height: tableHeaderHeight,
    radius: 14,
    fill: colors.brand,
  })
  content += rect(margin, tableTop - tableHeaderHeight, contentWidth, 15, colors.brand)
  content += text('DESCRIPTION', margin + 18, y - 12, { size: 8, font: 'bold', color: colors.white })
  content += text('UNIT PRICE', 368, y - 12, { size: 8, font: 'bold', color: colors.white, align: 'right' })
  content += text('QTY', 430, y - 12, { size: 8, font: 'bold', color: colors.white, align: 'center' })
  content += text('TOTAL', rightEdge - 18, y - 12, { size: 8, font: 'bold', color: colors.white, align: 'right' })

  y -= 48

  tableItems.forEach((item, index) => {
    const descriptionLines = wrapText(item.description || 'Invoice item', 52).slice(0, 3)
    const rowHeight = rowHeights[index]

    descriptionLines.forEach((descriptionLine, lineIndex) => {
      content += text(descriptionLine, margin + 18, y - lineIndex * 12, { size: 10.5 })
    })

    content += text(item.unitPrice, 368, y, { size: 10, align: 'right' })
    content += text(item.quantity, 430, y, { size: 10, align: 'center' })
    content += text(item.lineTotal, rightEdge - 18, y, { size: 10.5, font: 'bold', align: 'right' })
    if (index < tableItems.length - 1) {
      content += line(margin + 18, y - rowHeight + 11, rightEdge - 18, y - rowHeight + 11, colors.border)
    }
    y -= rowHeight
  })

  y = tableBottom - 34
  const totalsTop = y
  const totalBarLeft = 342
  const totalBarWidth = rightEdge - totalBarLeft

  content += totalRow('Subtotal', subtotal, totalsTop)
  content += totalRow('Tax', tax, totalsTop - 20)
  content += totalRow('Paid', amountPaid, totalsTop - 40)
  content += totalRow('Balance Due', balanceDue, totalsTop - 60)

  content += roundedRect({
    x: totalBarLeft,
    y: totalsTop - 112,
    width: totalBarWidth,
    height: 38,
    radius: 11,
    fill: colors.brand,
  })
  content += text(isPaid ? 'PAID' : 'TOTAL', totalBarLeft + 16, totalsTop - 98, {
    size: 9,
    font: 'bold',
    color: colors.white,
  })
  content += text(total, rightEdge - 16, totalsTop - 98, {
    size: 14,
    font: 'bold',
    color: colors.white,
    align: 'right',
  })

  y = Math.max(154, totalsTop - 146)

  const paymentLines = getUniqueLines([
    paymentLink
      ? 'Pay online via the secure link in the invoice email.'
      : 'Payment link not available yet.',
    ...paymentMethodLines.slice(0, 5),
    `Payment reference: ${invoiceNumber}`,
  ])

  const paymentCardWidth = 260
  const paymentTextLines = wrapLines(paymentLines, 48, 12)
  const paymentLineHeight = 13
  const paymentCardHeight = Math.max(104, 54 + paymentTextLines.length * paymentLineHeight)
  const minPaymentTop = footerY + 44 + paymentCardHeight - 10

  y = Math.max(y, minPaymentTop)

  content += roundedRect({
    x: margin,
    y: y - paymentCardHeight + 10,
    width: paymentCardWidth,
    height: paymentCardHeight,
    radius: 16,
    fill: colors.card,
    stroke: colors.border,
  })
  content += text('PAYMENT DETAILS', margin + 18, y - 10, {
    size: 8,
    font: 'bold',
    color: colors.brandMuted,
  })
  if (shouldLogPaymentDetailsRender()) {
    console.log('Rendering payment details')
  }
  let paymentLineY = y - 32
  paymentTextLines.forEach((paymentLine) => {
    content += text(paymentLine, margin + 18, paymentLineY, { size: 8.7, color: colors.brandMuted })
    paymentLineY -= paymentLineHeight
  })

  const thankYouX = 340
  content += text('THANK YOU', thankYouX, y - 4, { size: 12, font: 'bold' })
  const thankYouLines = wrapText(displayThankYou, 38).slice(0, 2)
  thankYouLines.forEach((thankYouLine, index) => {
    content += text(thankYouLine, thankYouX, y - 24 - index * 13, { size: 10, color: colors.brandMuted })
  })
  content += text(`Contact: ${contactEmail}`, thankYouX, y - 55, { size: 10, color: colors.brandMuted })

  const noteLines = notes ? wrapText(notes, 52).slice(0, 2) : []
  noteLines.forEach((noteLine, index) => {
    content += text(noteLine, thankYouX, y - 73 - index * 13, { size: 9.5, color: colors.brandMuted })
  })

  content += line(margin, footerY + 18, rightEdge, footerY + 18, colors.border)
  content += text(displayBusinessName, margin, footerY, { size: 9, font: 'bold', color: colors.brand })
  content += text(displayTagline, margin + 56, footerY, {
    size: 9,
    color: colors.brandMuted,
  })
  content += text(displayFooter, rightEdge, footerY, {
    size: 9,
    color: colors.brandMuted,
    align: 'right',
  })

  return content
}

const buildPdf = (content: string) => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = pdf.length

  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return pdf
}

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

export const renderInvoicePdfAttachment = (params: InvoicePdfParams) => {
  const pdfContent = buildPdfContent(params)
  const pdf = buildPdf(pdfContent)

  return {
    filename: `invoice-${sanitizeFilename(params.invoiceNumber)}.pdf`,
    content: toBase64(pdf),
  }
}
