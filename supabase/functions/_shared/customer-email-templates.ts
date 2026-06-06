type DetailRow = {
  label: string
  value: string | null | undefined
}

type InvoiceLineItem = {
  description: string
  quantity: string
  unitPrice: string
  lineTotal: string
}

type InvoiceEmailParams = {
  clientName?: string | null
  invoiceNumber: string
  lineItems: InvoiceLineItem[]
  subtotal: string
  tax: string
  total: string
  amountDue: string
  dueDate: string
  eventDate?: string | null
  eventType?: string | null
  paymentLink?: string | null
  contactEmail: string
}

type ReceiptEmailParams = {
  clientName?: string | null
  invoiceNumber: string
  amountPaid: string
  invoiceTotal: string
  remainingBalance?: string | null
  paidDate: string
  contactEmail: string
}

type OwnerNotificationEmailParams = {
  invoiceNumber: string
  clientName: string
  amountReceived: string
  invoiceTotal: string
  remainingBalance: string
  paidDate: string
  invoiceUrl?: string | null
  contactEmail: string
}

type BalanceReminderEmailParams = {
  clientName?: string | null
  invoiceNumber: string
  balanceDue: string
  dueDate: string
  paymentLink?: string | null
  contactEmail: string
}

export const getContactEmail = (fromEmail: string) => {
  const match = fromEmail.trim().match(/<([^<>]+)>$/)

  return match?.[1] || fromEmail.trim()
}

const escapeHtml = (value: string | number | null | undefined) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const renderDetailRows = (rows: DetailRow[]) => {
  return rows
    .filter((row) => row.value)
    .map((row) => {
      return `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #e7ebf3; color: #64748b; font-family: Arial, sans-serif; font-size: 13px; line-height: 20px;">
            ${escapeHtml(row.label)}
          </td>
          <td align="right" style="padding: 10px 0; border-bottom: 1px solid #e7ebf3; color: #0f172a; font-family: Arial, sans-serif; font-size: 13px; font-weight: 700; line-height: 20px;">
            ${escapeHtml(row.value)}
          </td>
        </tr>
      `
    })
    .join('')
}

const renderLayout = ({
  preheader,
  children,
  contactEmail,
}: {
  preheader: string
  children: string
  contactEmail: string
}) => {
  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>DJRM</title>
  </head>
  <body style="margin: 0; padding: 0; width: 100% !important; background: #f6f8fb;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; background: #f6f8fb; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; max-width: 620px; border-collapse: collapse;">
            <tr>
              <td style="padding: 0 0 14px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                  <tr>
                    <td align="left" style="font-family: Arial, sans-serif;">
                      <div style="display: inline-block; border-radius: 16px; border: 1px solid #dbe3ef; background: #ffffff; padding: 10px 14px; color: #0f172a; font-size: 18px; font-weight: 800; letter-spacing: 1px;">
                        DJRM
                      </div>
                      <div style="padding-top: 6px; color: #64748b; font-size: 12px; font-weight: 700; letter-spacing: 0; line-height: 18px;">
                        Professional DJ Business Management
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border-radius: 24px; background: #ffffff; border: 1px solid #e7ebf3; overflow: hidden;">
                ${children}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 18px 10px 0 10px; color: #64748b; font-family: Arial, sans-serif; font-size: 12px; line-height: 18px;">
                Questions? Reply to this email or contact
                <a href="mailto:${escapeHtml(contactEmail)}" style="color: #334155; text-decoration: underline;">${escapeHtml(contactEmail)}</a>.
                <br>Sent securely by DJRM.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

const renderButton = ({ href, label }: { href: string; label: string }) => {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
      <tr>
        <td align="center" bgcolor="#4f46e5" style="border-radius: 14px;">
          <a href="${escapeHtml(href)}" style="display: inline-block; padding: 14px 24px; color: #ffffff; font-family: Arial, sans-serif; font-size: 15px; font-weight: 700; line-height: 18px; text-decoration: none;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `
}

export const renderInvoiceEmail = ({
  clientName,
  invoiceNumber,
  lineItems,
  subtotal,
  tax,
  total,
  amountDue,
  dueDate,
  eventDate,
  eventType,
  paymentLink,
  contactEmail,
}: InvoiceEmailParams) => {
  const details = renderDetailRows([
    { label: 'Invoice number', value: invoiceNumber },
    { label: 'Client', value: clientName || 'Client' },
    { label: 'Invoice total', value: total },
    { label: 'Amount due', value: amountDue },
    { label: 'Due date', value: dueDate },
    { label: 'Event date', value: eventDate },
    { label: 'Event type', value: eventType },
  ])

  const paymentBlock = paymentLink
    ? `
      <tr>
        <td style="padding: 24px 28px 6px 28px;">
          ${renderButton({ href: paymentLink, label: `Pay ${amountDue} Now` })}
        </td>
      </tr>
      <tr>
        <td style="padding: 12px 28px 26px 28px; color: #64748b; font-family: Arial, sans-serif; font-size: 12px; line-height: 18px; word-break: break-word;">
          If the button does not work,
          <a href="${escapeHtml(paymentLink)}" style="color: #334155; font-weight: 700; text-decoration: underline;">open the secure payment page</a>.
        </td>
      </tr>
    `
    : `
      <tr>
        <td style="padding: 20px 28px 26px 28px; color: #64748b; font-family: Arial, sans-serif; font-size: 13px; line-height: 20px;">
          Payment link not available yet.
        </td>
      </tr>
    `

  return renderLayout({
    preheader: `${invoiceNumber} is ready. Amount due: ${amountDue}.`,
    contactEmail,
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 30px 28px 8px 28px; font-family: Arial, sans-serif;">
            <div style="display: inline-block; margin-bottom: 14px; border-radius: 999px; border: 1px solid #fed7aa; background: #fff7ed; padding: 6px 10px; color: #c2410c; font-family: Arial, sans-serif; font-size: 12px; font-weight: 800; line-height: 14px;">
              Awaiting Payment
            </div>
            <h1 style="margin: 0; color: #0f172a; font-size: 28px; line-height: 34px; font-weight: 800;">Invoice Ready</h1>
            <p style="margin: 12px 0 0 0; color: #475569; font-size: 15px; line-height: 24px;">
              Hello ${escapeHtml(clientName || 'there')}, your invoice is ready to review and pay.
              A detailed PDF invoice is attached for your records.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 28px 0 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
              ${details}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 28px 0 28px; color: #64748b; font-family: Arial, sans-serif; font-size: 13px; line-height: 20px;">
            The attached PDF includes ${escapeHtml(lineItems.length || 1)} invoice item${lineItems.length === 1 ? '' : 's'}, subtotal ${escapeHtml(subtotal)}, and tax ${escapeHtml(tax)}.
          </td>
        </tr>
        ${paymentBlock}
      </table>
    `,
  })
}

export const renderReceiptEmail = ({
  clientName,
  invoiceNumber,
  amountPaid,
  invoiceTotal,
  remainingBalance,
  paidDate,
  contactEmail,
}: ReceiptEmailParams) => {
  const details = renderDetailRows([
    { label: 'Invoice number', value: invoiceNumber },
    { label: 'Amount paid', value: amountPaid },
    { label: 'Invoice total', value: invoiceTotal },
    { label: 'Remaining balance', value: remainingBalance },
    { label: 'Paid date', value: paidDate },
  ])

  return renderLayout({
    preheader: `Payment received for ${invoiceNumber}.`,
    contactEmail,
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 20px 28px; background: #ecfdf5; border-bottom: 1px solid #bbf7d0; font-family: Arial, sans-serif;">
            <p style="margin: 0; color: #047857; font-size: 14px; font-weight: 800; line-height: 20px;">Payment received</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 28px 28px 8px 28px; font-family: Arial, sans-serif;">
            <h1 style="margin: 0; color: #0f172a; font-size: 26px; line-height: 32px; font-weight: 800;">Thank you</h1>
            <h2 style="margin: 8px 0 0 0; color: #0f172a; font-size: 20px; line-height: 26px; font-weight: 800;">Payment Received</h2>
            <p style="margin: 12px 0 0 0; color: #475569; font-size: 15px; line-height: 24px;">
              Hello ${escapeHtml(clientName || 'there')}, we have received your payment.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 28px 28px 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
              ${details}
            </table>
            <p style="margin: 22px 0 0 0; color: #475569; font-family: Arial, sans-serif; font-size: 14px; line-height: 22px;">
              Thanks again. We appreciate your booking and look forward to your event.
            </p>
          </td>
        </tr>
      </table>
    `,
  })
}

export const renderOwnerNotificationEmail = ({
  invoiceNumber,
  clientName,
  amountReceived,
  invoiceTotal,
  remainingBalance,
  paidDate,
  invoiceUrl,
  contactEmail,
}: OwnerNotificationEmailParams) => {
  const details = renderDetailRows([
    { label: 'Invoice number', value: invoiceNumber },
    { label: 'Client', value: clientName },
    { label: 'Amount received', value: amountReceived },
    { label: 'Invoice total', value: invoiceTotal },
    { label: 'Remaining balance', value: remainingBalance },
    { label: 'Paid date', value: paidDate },
  ])

  return renderLayout({
    preheader: `${invoiceNumber} has been paid.`,
    contactEmail,
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 30px 28px 8px 28px; font-family: Arial, sans-serif;">
            <h1 style="margin: 0; color: #0f172a; font-size: 26px; line-height: 32px; font-weight: 800;">Invoice Paid</h1>
            <p style="margin: 12px 0 0 0; color: #475569; font-size: 15px; line-height: 24px;">
              ${escapeHtml(invoiceNumber)} has been paid by ${escapeHtml(clientName || 'Unknown client')}.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 28px 0 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
              ${details}
            </table>
          </td>
        </tr>
        ${invoiceUrl ? `
          <tr>
            <td style="padding: 24px 28px 28px 28px;">
              ${renderButton({ href: invoiceUrl, label: 'Open Invoice in DJRM' })}
            </td>
          </tr>
        ` : `
          <tr>
            <td style="padding: 14px 28px 28px 28px; color: #64748b; font-family: Arial, sans-serif; font-size: 13px; line-height: 20px;">
              Open DJRM to review the invoice.
            </td>
          </tr>
        `}
      </table>
    `,
  })
}

export const renderBalanceReminderEmail = ({
  clientName,
  invoiceNumber,
  balanceDue,
  dueDate,
  paymentLink,
  contactEmail,
}: BalanceReminderEmailParams) => {
  const details = renderDetailRows([
    { label: 'Invoice number', value: invoiceNumber },
    { label: 'Balance due', value: balanceDue },
    { label: 'Due date', value: dueDate },
  ])

  return renderLayout({
    preheader: `Balance reminder for ${invoiceNumber}.`,
    contactEmail,
    children: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
        <tr>
          <td style="padding: 30px 28px 8px 28px; font-family: Arial, sans-serif;">
            <h1 style="margin: 0; color: #0f172a; font-size: 26px; line-height: 32px; font-weight: 800;">Balance Reminder</h1>
            <p style="margin: 12px 0 0 0; color: #475569; font-size: 15px; line-height: 24px;">
              Hello ${escapeHtml(clientName || 'there')}, this is a friendly reminder that a balance remains on your invoice.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 18px 28px 0 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
              ${details}
            </table>
          </td>
        </tr>
        ${paymentLink ? `
          <tr>
            <td style="padding: 24px 28px 6px 28px;">
              ${renderButton({ href: paymentLink, label: 'Pay Balance' })}
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 28px 26px 28px; color: #64748b; font-family: Arial, sans-serif; font-size: 12px; line-height: 18px; word-break: break-word;">
              Fallback payment link:<br>
              <a href="${escapeHtml(paymentLink)}" style="color: #334155; text-decoration: underline;">${escapeHtml(paymentLink)}</a>
            </td>
          </tr>
        ` : ''}
      </table>
    `,
  })
}
