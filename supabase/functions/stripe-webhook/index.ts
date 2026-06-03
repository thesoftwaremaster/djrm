import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const jsonResponse = (body: Record<string, unknown>, status = 200) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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

  return jsonResponse({
    received: true,
    paymentId: data,
  })
})
