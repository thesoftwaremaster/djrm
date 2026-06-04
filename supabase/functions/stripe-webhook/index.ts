import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const jsonResponse = (body: Record<string, unknown>, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

const formatCurrency = (value: number | string | null | undefined, currency = 'GBP') => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency || 'GBP',
  }).format(Number(value || 0))
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

const isValidEmail = (value: unknown): value is string => {
  if (typeof value !== 'string') return false

  const email = value.trim()

  if (email.length > 254) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const sendEmail = async ({
  resendApiKey,
  fromEmail,
  to,
  subject,
  text,
}: {
  resendApiKey: string
  fromEmail: string
  to: string
  subject: string
  text: string
}) => {
  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [to],
      subject,
      text,
    }),
  })

  if (!emailResponse.ok) {
    const providerText = await emailResponse.text().catch(() => '')
    throw new Error(`Email provider rejected message (${emailResponse.status}): ${providerText.slice(0, 200)}`)
  }
}

const getInvoiceLabel = (invoice: { id: string; invoice_number?: string | null }) => {
  return invoice.invoice_number || `Invoice ${invoice.id.slice(0, 8)}`
}

const timingSafeEqual = (first: string, second: string) => {
  if (first.length !== second.length) return false

  let result = 0

  for (let index = 0; index < first.length; index += 1) {
    result |= first.charCodeAt(index) ^ second.charCodeAt(index)
  }

  return result === 0
}

const toHex = (bytes: Uint8Array) => {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const createHmacSha256 = async (secret: string, value: string) => {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))

  return toHex(new Uint8Array(signature))
}

const zeroDecimalCurrencies = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
])

const signatureToleranceSeconds = 300

const fromMinorUnits = (amountMinor: number, currency: string) => {
  return zeroDecimalCurrencies.has(currency)
    ? amountMinor
    : amountMinor / 100
}

const parseStripeSignature = (signatureHeader: string | null) => {
  const parts = (signatureHeader || '').split(',').map((part) => part.trim())
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) || ''
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3))

  return { timestamp, signatures }
}

const verifyStripeSignature = async ({
  body,
  signatureHeader,
  secret,
}: {
  body: string
  signatureHeader: string | null
  secret: string
}) => {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader)

  if (!timestamp || !signatures.length) return false

  const timestampSeconds = Number(timestamp)

  if (!Number.isFinite(timestampSeconds)) return false

  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds)

  if (ageSeconds > signatureToleranceSeconds) return false

  const expectedSignature = await createHmacSha256(secret, `${timestamp}.${body}`)

  return signatures.some((signature) => timingSafeEqual(signature, expectedSignature))
}

const sendPaidInvoiceNotifications = async ({
  supabase,
  paymentId,
  resendApiKey,
  fromEmail,
}: {
  supabase: any
  paymentId: string
  resendApiKey: string | null
  fromEmail: string | null
}) => {
  if (!resendApiKey || !fromEmail) {
    console.warn('stripe-webhook paid invoice email skipped because email is not configured', {
      hasResendApiKey: Boolean(resendApiKey),
      hasFromEmail: Boolean(fromEmail),
    })
    return
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      payment_currency,
      invoice_id,
      invoices (
        id,
        user_id,
        invoice_number,
        total,
        currency,
        paid_at,
        receipt_sent_at,
        owner_notified_at,
        clients (
          name,
          email
        )
      )
    `)
    .eq('id', paymentId)
    .single()

  if (paymentError || !payment?.invoices) {
    console.error('stripe-webhook paid invoice notification lookup failed', {
      paymentId,
      message: paymentError?.message,
      code: paymentError?.code,
    })
    return
  }

  const invoice = Array.isArray(payment.invoices) ? payment.invoices[0] : payment.invoices
  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  const invoiceLabel = getInvoiceLabel(invoice)
  const currency = payment.payment_currency || invoice.currency || 'GBP'

  if (!invoice.receipt_sent_at && isValidEmail(client?.email)) {
    const { data: claimedInvoice, error: claimError } = await supabase.rpc('claim_paid_invoice_notification', {
      target_invoice_id: invoice.id,
      notification_field: 'receipt_sent_at',
    })

    if (claimError) {
      console.error('stripe-webhook receipt claim failed', {
        invoiceId: invoice.id,
        message: claimError.message,
        code: claimError.code,
      })
    } else if (claimedInvoice === true) {
      await sendEmail({
        resendApiKey,
        fromEmail,
        to: client.email.trim(),
        subject: `Payment receipt for ${invoiceLabel}`,
        text: [
          `Hello ${client.name || 'there'},`,
          '',
          `Thank you, payment has been received for ${invoiceLabel}.`,
          '',
          `Amount received: ${formatCurrency(payment.amount, currency)}`,
          `Invoice total: ${formatCurrency(invoice.total, invoice.currency || currency)}`,
          `Paid date: ${formatDate(invoice.paid_at || new Date().toISOString())}`,
          '',
          'Thank you.',
        ].join('\n'),
      })
    }
  }

  if (!invoice.owner_notified_at) {
    const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(invoice.user_id)
    const ownerEmail = ownerData?.user?.email

    if (ownerError || !isValidEmail(ownerEmail)) {
      console.error('stripe-webhook owner notification lookup failed', {
        invoiceId: invoice.id,
        userId: invoice.user_id,
        message: ownerError?.message,
      })
      return
    }

    const { data: claimedInvoice, error: claimError } = await supabase.rpc('claim_paid_invoice_notification', {
      target_invoice_id: invoice.id,
      notification_field: 'owner_notified_at',
    })

    if (claimError) {
      console.error('stripe-webhook owner notification claim failed', {
        invoiceId: invoice.id,
        message: claimError.message,
        code: claimError.code,
      })
    } else if (claimedInvoice === true) {
      await sendEmail({
        resendApiKey,
        fromEmail,
        to: ownerEmail.trim(),
        subject: 'Invoice paid',
        text: [
          'Invoice paid',
          '',
          `${invoiceLabel} has been paid.`,
          `Amount received: ${formatCurrency(payment.amount, currency)}`,
          `Client: ${client?.name || client?.email || 'Unknown client'}`,
        ].join('\n'),
      })
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVOICE_FROM_EMAIL')

  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('stripe-webhook missing required configuration', {
      hasWebhookSecret: Boolean(webhookSecret),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    })
    return jsonResponse({ error: 'Webhook is not configured.' }, 500)
  }

  const body = await req.text()
  const signatureHeader = req.headers.get('Stripe-Signature')
  const isVerified = await verifyStripeSignature({
    body,
    signatureHeader,
    secret: webhookSecret,
  })

  if (!isVerified) {
    console.error('stripe-webhook signature verification failed')
    return jsonResponse({ error: 'Invalid webhook signature.' }, 400)
  }

  let event: Record<string, any>

  try {
    event = JSON.parse(body)
  } catch {
    return jsonResponse({ error: 'Invalid webhook payload.' }, 400)
  }

  if (event.type !== 'checkout.session.completed') {
    return jsonResponse({ received: true, ignored: true })
  }

  const session = event.data?.object
  const sessionId = session?.id
  const amountTotalMinor = Number(session?.amount_total || 0)
  const currency = typeof session?.currency === 'string' ? session.currency.toLowerCase() : ''
  const amountTotal = fromMinorUnits(amountTotalMinor, currency)

  if (!sessionId || amountTotalMinor <= 0 || !currency) {
    console.error('stripe-webhook missing session payment details', {
      eventId: event.id,
      sessionId,
      amountTotalMinor,
      amountTotal,
      currency,
    })
    return jsonResponse({ error: 'Webhook payment details are incomplete.' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await supabase.rpc('record_online_invoice_payment', {
    provider_name: 'stripe',
    provider_session_id: sessionId,
    provider_event_id: event.id,
    amount_received: amountTotal,
    amount_received_minor: amountTotalMinor,
    received_currency: currency,
  })

  if (error) {
    console.error('stripe-webhook payment recording failed', {
      eventId: event.id,
      sessionId,
      message: error.message,
      code: error.code,
    })
    return jsonResponse({ error: 'Could not record payment.' }, 500)
  }

  try {
    if (typeof data === 'string') {
      await sendPaidInvoiceNotifications({
        supabase,
        paymentId: data,
        resendApiKey,
        fromEmail,
      })
    }
  } catch (notificationError) {
    console.error('stripe-webhook paid invoice notification failed', {
      paymentId: data,
      message: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
  }

  return jsonResponse({
    received: true,
    paymentId: data,
  })
})
