import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getContactEmail, renderInvoiceEmail } from '../_shared/customer-email-templates.ts'
import { renderInvoicePdfAttachment } from '../_shared/invoice-pdf.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const formatCurrency = (value: number | string | null | undefined, currency = 'GBP') => {
  return `${currency || 'GBP'} ${Number(value || 0).toFixed(2)}`
}

const formatDate = (dateValue: string | null | undefined) => {
  if (!dateValue) return 'not set'

  const date = new Date(dateValue)

  if (Number.isNaN(date.getTime())) return dateValue

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const jsonResponse = (body: Record<string, unknown>, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isUuid = (value: unknown): value is string => {
  if (typeof value !== 'string') return false

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

const isValidEmail = (value: unknown): value is string => {
  if (typeof value !== 'string') return false

  const email = value.trim()

  if (email.length > 254) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const isValidSender = (value: unknown) => {
  if (isValidEmail(value)) return true
  if (typeof value !== 'string') return false

  const match = value.trim().match(/<([^<>]+)>$/)

  return match ? isValidEmail(match[1]) : false
}

const getInvoiceLabel = (invoice: { id: string; invoice_number?: string | null }) => {
  return invoice.invoice_number || `Invoice ${invoice.id.slice(0, 8)}`
}

const getNestedRecord = (value: unknown) => {
  return Array.isArray(value) ? value[0] : value
}

const formatQuantity = (value: number | string | null | undefined) => {
  const numericValue = Number(value || 0)

  return Number.isFinite(numericValue) ? String(numericValue) : '0'
}

const getPaymentMethodLines = (settings: Record<string, string | null> | null | undefined) => {
  if (!settings) return []

  return [
    settings.bank_name,
    settings.bank_account_name,
    settings.bank_sort_code ? `Sort code: ${settings.bank_sort_code}` : '',
    settings.bank_account_number ? `Account: ${settings.bank_account_number}` : '',
    settings.iban ? `IBAN: ${settings.iban}` : '',
    settings.bic_swift ? `BIC/SWIFT: ${settings.bic_swift}` : '',
    settings.payment_reference_instructions,
  ].filter((line): line is string => Boolean(line))
}

const getSettingsValue = (
  settings: Record<string, string | null> | null | undefined,
  field: string
) => {
  const value = settings?.[field]

  return typeof value === 'string' && value.trim() ? value.trim() : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVOICE_FROM_EMAIL')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!resendApiKey || !fromEmail || !supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('send-invoice missing required configuration', {
      hasResendApiKey: Boolean(resendApiKey),
      hasFromEmail: Boolean(fromEmail),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    })
    return jsonResponse(
      { error: 'Invoice email service is not configured. Ask the app owner to check Supabase function secrets.' },
      500
    )
  }

  if (!isValidSender(fromEmail)) {
    return jsonResponse(
      { error: 'Invoice sender email is not configured correctly.' },
      500
    )
  }

  let payload: unknown

  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  if (!isPlainObject(payload) || !isUuid(payload.invoiceId)) {
    return jsonResponse({ error: 'A valid invoice ID is required.' }, 400)
  }

  const invoiceId = payload.invoiceId
  const forceResend = payload.forceResend === true
  const authHeader = req.headers.get('Authorization')

  if (!authHeader) {
    return jsonResponse({ error: 'Authentication is required.' }, 401)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const { data: userData, error: userError } = await authClient.auth.getUser()

  if (userError || !userData.user) {
    console.error('send-invoice auth failed', { message: userError?.message })
    return jsonResponse({ error: 'Authentication is required.' }, 401)
  }

  // Service-role access is intentionally narrow: after caller authentication,
  // it only reads the requested invoice/items and conditionally marks it sent.
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      id,
      user_id,
      invoice_number,
      status,
      subtotal,
      tax,
      total,
      currency,
      amount_paid,
      balance_due,
      due_date,
      invoice_sent_at,
      last_sent_at,
      booking_id,
      payment_link_url,
      notes,
      clients (
        name,
        email,
        phone
      )
    `)
    .eq('id', invoiceId)
    .eq('user_id', userData.user.id)
    .single()

  if (invoiceError || !invoice) {
    console.error('send-invoice invoice lookup failed', {
      invoiceId,
      userId: userData.user.id,
      message: invoiceError?.message,
      code: invoiceError?.code,
    })
    return jsonResponse({ error: 'Could not load invoice, or you do not have access to it.' }, 404)
  }

  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients

  if (!client?.email || !isValidEmail(client.email)) {
    return jsonResponse({ error: 'Client email is missing.' }, 400)
  }

  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return jsonResponse(
      { error: `Cannot send an invoice with status "${invoice.status}".` },
      400
    )
  }

  const alreadySentAt = invoice.last_sent_at || invoice.invoice_sent_at

  if (alreadySentAt && !forceResend) {
    return jsonResponse(
      {
        error: `This invoice was already sent on ${formatDate(alreadySentAt)}. Send again?`,
        alreadySent: true,
        sentAt: alreadySentAt,
      },
      409
    )
  }

  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select('description, quantity, unit_price, line_total')
    .eq('invoice_id', invoiceId)
    .eq('user_id', userData.user.id)

  if (itemsError) {
    console.error('send-invoice item lookup failed', {
      invoiceId,
      userId: userData.user.id,
      message: itemsError.message,
      code: itemsError.code,
    })
    return jsonResponse({ error: 'Could not load invoice items.' }, 500)
  }

  const { data: settings, error: settingsError } = await supabase
    .from('app_settings')
    .select(`
      payment_link_url,
      bank_name,
      bank_account_name,
      bank_sort_code,
      bank_account_number,
      iban,
      bic_swift,
      payment_reference_instructions,
      business_name,
      display_name,
      contact_email,
      currency,
      invoice_footer_text,
      invoice_thank_you_message
    `)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (settingsError) {
    console.error('send-invoice settings lookup failed', {
      invoiceId,
      userId: userData.user.id,
      message: settingsError.message,
      code: settingsError.code,
    })
  }

  let eventDate: string | null = null
  let eventType: string | null = null

  if (invoice.booking_id) {
    const { data: bookingContext, error: bookingContextError } = await supabase
      .from('bookings')
      .select(`
        id,
        enquiries (
          event_type,
          event_date
        )
      `)
      .eq('id', invoice.booking_id)
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (bookingContextError) {
      console.error('send-invoice booking context lookup failed', {
        invoiceId,
        bookingId: invoice.booking_id,
        userId: userData.user.id,
        message: bookingContextError.message,
        code: bookingContextError.code,
      })
    }

    const enquiry = getNestedRecord(bookingContext?.enquiries) as {
      event_type?: string | null
      event_date?: string | null
    } | null

    eventType = enquiry?.event_type || null
    eventDate = enquiry?.event_date || null

    const { data: eventContext, error: eventContextError } = await supabase
      .from('events')
      .select('start_time')
      .eq('booking_id', invoice.booking_id)
      .eq('user_id', userData.user.id)
      .order('start_time', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (eventContextError) {
      console.error('send-invoice event context lookup failed', {
        invoiceId,
        bookingId: invoice.booking_id,
        userId: userData.user.id,
        message: eventContextError.message,
        code: eventContextError.code,
      })
    }

    eventDate = eventContext?.start_time || eventDate
  }

  const invoiceLabel = getInvoiceLabel(invoice)
  const balanceDue = Number(invoice.balance_due)
  const amountDue = Number.isFinite(balanceDue)
    ? Math.max(0, balanceDue)
    : Number(invoice.total || 0)
  const amountPaid = Number(invoice.amount_paid || 0)
  const invoiceCurrency = invoice.currency || getSettingsValue(settings, 'currency') || 'GBP'
  const settingsContactEmail = getSettingsValue(settings, 'contact_email')
  const documentContactEmail = settingsContactEmail && isValidEmail(settingsContactEmail)
    ? settingsContactEmail
    : getContactEmail(fromEmail)
  const pdfStatus = amountDue <= 0
    ? 'Paid'
    : amountPaid > 0
      ? 'Partially Paid'
      : 'Awaiting Payment'
  const formattedLineItems = (items || []).map((item) => ({
    description: item.description || 'Invoice item',
    quantity: formatQuantity(item.quantity),
    unitPrice: formatCurrency(item.unit_price, invoiceCurrency),
    lineTotal: formatCurrency(item.line_total, invoiceCurrency),
  }))
  const itemLines = (items || [])
    .map((item) => {
      return `${item.description || 'Invoice item'} - ${item.quantity || 0} x ${formatCurrency(
        item.unit_price,
        invoiceCurrency
      )} = ${formatCurrency(item.line_total, invoiceCurrency)}`
    })
    .join('\n')

  const text = [
    `Hello ${client.name || 'there'},`,
    '',
    `Please find the details for ${invoiceLabel} below.`,
    '',
    itemLines || 'Invoice items are listed on the invoice.',
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal, invoiceCurrency)}`,
    `Tax: ${formatCurrency(invoice.tax, invoiceCurrency)}`,
    `Total: ${formatCurrency(invoice.total, invoiceCurrency)}`,
    `Amount due: ${formatCurrency(amountDue, invoiceCurrency)}`,
    `Due date: ${formatDate(invoice.due_date)}`,
    eventDate ? `Event date: ${formatDate(eventDate)}` : null,
    eventType ? `Event type: ${eventType}` : null,
    invoice.payment_link_url ? 'Pay online using the secure payment link below.' : null,
    invoice.payment_link_url ? `Payment link: ${invoice.payment_link_url}` : null,
    !invoice.payment_link_url ? 'Payment link not available yet.' : null,
    'A detailed PDF invoice is attached to this email.',
    '',
    invoice.notes ? `Notes: ${invoice.notes}` : null,
    invoice.notes ? '' : null,
    'Thank you.',
  ]
    .filter((line) => line !== null)
    .join('\n')

  const html = renderInvoiceEmail({
    clientName: client.name,
    invoiceNumber: invoiceLabel,
    lineItems: formattedLineItems,
    subtotal: formatCurrency(invoice.subtotal, invoiceCurrency),
    tax: formatCurrency(invoice.tax, invoiceCurrency),
    total: formatCurrency(invoice.total, invoiceCurrency),
    amountDue: formatCurrency(amountDue, invoiceCurrency),
    dueDate: formatDate(invoice.due_date),
    eventDate: eventDate ? formatDate(eventDate) : null,
    eventType,
    paymentLink: invoice.payment_link_url,
    contactEmail: documentContactEmail,
  })

  const pdfAttachment = renderInvoicePdfAttachment({
    businessName: getSettingsValue(settings, 'business_name') || getSettingsValue(settings, 'display_name') || 'DJRM',
    businessTagline: 'Professional DJ Business Management',
    invoiceNumber: invoiceLabel,
    status: pdfStatus,
    clientName: client.name,
    clientEmail: client.email,
    clientPhone: client.phone,
    subtotal: formatCurrency(invoice.subtotal, invoiceCurrency),
    tax: formatCurrency(invoice.tax, invoiceCurrency),
    total: formatCurrency(invoice.total, invoiceCurrency),
    amountPaid: formatCurrency(amountPaid, invoiceCurrency),
    balanceDue: formatCurrency(amountDue, invoiceCurrency),
    dueDate: formatDate(invoice.due_date),
    issuedDate: formatDate(new Date().toISOString()),
    eventDate: eventDate ? formatDate(eventDate) : null,
    eventType,
    paymentLink: invoice.payment_link_url,
    paymentMethodLines: getPaymentMethodLines(settings),
    contactEmail: documentContactEmail,
    footerText: getSettingsValue(settings, 'invoice_footer_text'),
    thankYouMessage: getSettingsValue(settings, 'invoice_thank_you_message'),
    lineItems: formattedLineItems,
    notes: invoice.notes,
  })

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [client.email.trim()],
      subject: `${invoiceLabel} from DJRM`,
      text,
      html,
      attachments: [pdfAttachment],
    }),
  })

  if (!emailResponse.ok) {
    const providerText = await emailResponse.text().catch(() => '')
    console.error('send-invoice email provider failed', {
      status: emailResponse.status,
      body: providerText.slice(0, 500),
    })
    return jsonResponse({ error: 'Email provider rejected the invoice email. Check Resend sender/domain configuration.' }, 502)
  }

  let updatedStatus = invoice.status
  const sentAt = new Date().toISOString()

  const invoiceUpdate: Record<string, string> = {
    invoice_sent_at: invoice.invoice_sent_at || sentAt,
    last_sent_at: sentAt,
  }

  if (invoice.status !== 'sent') {
    invoiceUpdate.status = 'sent'
  }

  const { data: updatedInvoice, error: updateError } = await authClient
    .from('invoices')
    .update(invoiceUpdate)
    .eq('id', invoice.id)
    .eq('user_id', userData.user.id)
    .not('status', 'in', '("paid","cancelled")')
    .select('status, invoice_sent_at, last_sent_at')
    .maybeSingle()

  if (updateError) {
    console.error('send-invoice status update failed', {
      invoiceId: invoice.id,
      userId: userData.user.id,
      message: updateError.message,
      code: updateError.code,
    })
    return jsonResponse(
      { error: 'Invoice was emailed, but the send timestamp could not be updated.' },
      500
    )
  }

  updatedStatus = updatedInvoice?.status || invoice.status

  return jsonResponse({
    message: 'Invoice email sent successfully with PDF attached.',
    status: updatedStatus,
    sentAt,
    attachmentIncluded: true,
  })
})
