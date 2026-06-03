import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value
  )
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

const normalizeCurrency = (currency: string | null | undefined) => {
  return (currency || 'GBP').trim().toLowerCase()
}

const isValidCurrency = (currency: string) => /^[a-z]{3}$/.test(currency)

const toMinorUnits = (value: number | string | null | undefined, currency: string) => {
  const numericValue = Number(value || 0)

  if (!Number.isFinite(numericValue)) return 0

  return zeroDecimalCurrencies.has(currency)
    ? Math.round(numericValue)
    : Math.round(numericValue * 100)
}

const getInvoiceLabel = (invoice: { id: string; invoice_number?: string | null }) => {
  return invoice.invoice_number || `Invoice ${invoice.id.slice(0, 8)}`
}

const getPayableAmount = ({
  invoice,
  scheduledPayments,
}: {
  invoice: any
  scheduledPayments: Array<Record<string, any>>
}) => {
  const unpaidScheduledPayment = scheduledPayments.find((payment) => {
    return payment && payment.paid !== true && Number(payment.amount || 0) > 0
  })

  if (unpaidScheduledPayment) {
    return {
      amount: Number(unpaidScheduledPayment.amount || 0),
      paymentType: unpaidScheduledPayment.type || 'other',
    }
  }

  const balanceDue = Number(invoice.balance_due ?? Number(invoice.total || 0) - Number(invoice.amount_paid || 0))

  return {
    amount: Math.max(0, balanceDue),
    paymentType: 'other',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appBaseUrl = Deno.env.get('APP_BASE_URL')

  if (!stripeSecretKey || !supabaseUrl || !anonKey || !serviceRoleKey || !appBaseUrl) {
    console.error('create-payment-link missing required configuration', {
      hasStripeSecretKey: Boolean(stripeSecretKey),
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasAppBaseUrl: Boolean(appBaseUrl),
    })
    return jsonResponse(
      { error: 'Payment links are not configured. Ask the app owner to check Supabase function secrets.' },
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
    console.error('create-payment-link auth failed', { message: userError?.message })
    return jsonResponse({ error: 'Authentication is required.' }, 401)
  }

  if (userData.user.email?.trim().toLowerCase() === 'demo@djrm.co') {
    return jsonResponse(
      { error: 'Demo Mode cannot create real payment sessions.' },
      403
    )
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const invoiceId = payload.invoiceId

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      id,
      user_id,
      invoice_number,
      status,
      total,
      currency,
      amount_paid,
      balance_due,
      payment_link_url,
      payment_session_id,
      client_id,
      booking_id,
      clients (
        name,
        email
      )
    `)
    .eq('id', invoiceId)
    .eq('user_id', userData.user.id)
    .single()

  if (invoiceError || !invoice) {
    console.error('create-payment-link invoice lookup failed', {
      invoiceId,
      userId: userData.user.id,
      message: invoiceError?.message,
      code: invoiceError?.code,
    })
    return jsonResponse({ error: 'Could not load invoice, or you do not have access to it.' }, 404)
  }

  if (invoice.status === 'cancelled') {
    return jsonResponse({ error: 'Cancelled invoices cannot be paid online.' }, 400)
  }

  const { data: scheduledPayments, error: scheduledPaymentsError } = await supabase
    .from('payments')
    .select('id, amount, type, paid, due_date, created_at')
    .eq('invoice_id', invoice.id)
    .eq('user_id', userData.user.id)
    .eq('paid', false)
    .in('type', ['deposit', 'balance'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (scheduledPaymentsError) {
    console.error('create-payment-link scheduled payment lookup failed', {
      invoiceId: invoice.id,
      userId: userData.user.id,
      message: scheduledPaymentsError.message,
      code: scheduledPaymentsError.code,
    })
    return jsonResponse({ error: 'Could not load scheduled payment details.' }, 500)
  }

  const payableAmount = getPayableAmount({
    invoice,
    scheduledPayments: scheduledPayments || [],
  })
  const paymentCurrency = normalizeCurrency(invoice.currency)

  if (!isValidCurrency(paymentCurrency)) {
    return jsonResponse({ error: 'Invoice currency is not valid for online payment.' }, 400)
  }

  const amountMinor = toMinorUnits(payableAmount.amount, paymentCurrency)

  if (amountMinor <= 0) {
    return jsonResponse({ error: 'This invoice has no remaining balance to pay.' }, 400)
  }

  const { data: existingSession, error: existingSessionError } = await supabase
    .from('invoice_payment_sessions')
    .select('payment_link_url, payment_session_id')
    .eq('invoice_id', invoice.id)
    .eq('user_id', userData.user.id)
    .eq('payment_provider', 'stripe')
    .eq('expected_amount_minor', amountMinor)
    .eq('expected_currency', paymentCurrency)
    .eq('payment_type', payableAmount.paymentType)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSessionError) {
    console.error('create-payment-link existing session lookup failed', {
      invoiceId: invoice.id,
      userId: userData.user.id,
      message: existingSessionError.message,
      code: existingSessionError.code,
    })
  }

  if (existingSession?.payment_link_url && existingSession?.payment_session_id) {
    const { data: updatedInvoice, error: updateExistingError } = await authClient
      .from('invoices')
      .update({
        payment_provider: 'stripe',
        payment_link_url: existingSession.payment_link_url,
        payment_session_id: existingSession.payment_session_id,
        payment_session_amount_minor: amountMinor,
        payment_session_currency: paymentCurrency,
        payment_session_payment_type: payableAmount.paymentType,
        payment_status: invoice.amount_paid > 0 ? 'partially_paid' : 'unpaid',
      })
      .eq('id', invoice.id)
      .eq('user_id', userData.user.id)
      .select('id, payment_provider, payment_link_url, payment_session_id, payment_status')
      .single()

    if (updateExistingError) {
      console.error('create-payment-link existing invoice update failed', {
        invoiceId: invoice.id,
        userId: userData.user.id,
        message: updateExistingError.message,
        code: updateExistingError.code,
      })
      return jsonResponse({ error: 'Could not restore the existing payment link to the invoice.' }, 500)
    }

    return jsonResponse({
      message: 'Existing payment link is ready.',
      invoice: updatedInvoice,
      paymentLinkUrl: updatedInvoice.payment_link_url,
    })
  }

  const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
  const appUrl = appBaseUrl.replace(/\/+$/, '')
  const invoiceLabel = getInvoiceLabel(invoice)
  const checkoutParams = new URLSearchParams({
    mode: 'payment',
    success_url: `${appUrl}/invoices/${invoice.id}?payment=success`,
    cancel_url: `${appUrl}/invoices/${invoice.id}?payment=cancelled`,
    client_reference_id: invoice.id,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': paymentCurrency,
    'line_items[0][price_data][unit_amount]': String(amountMinor),
    'line_items[0][price_data][product_data][name]': invoiceLabel,
    'metadata[invoice_id]': invoice.id,
    'metadata[user_id]': userData.user.id,
    'metadata[payment_type]': payableAmount.paymentType,
  })

  const customerEmail = client?.email || userData.user.email

  if (customerEmail) {
    checkoutParams.set('customer_email', customerEmail)
  }

  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: checkoutParams,
  })

  const stripeBody = await stripeResponse.json().catch(() => null)

  if (!stripeResponse.ok || !stripeBody?.id || !stripeBody?.url) {
    console.error('create-payment-link provider failed', {
      status: stripeResponse.status,
      message: stripeBody?.error?.message,
      type: stripeBody?.error?.type,
    })
    return jsonResponse({ error: 'Payment provider could not create a checkout session.' }, 502)
  }

  const { error: sessionInsertError } = await supabase
    .from('invoice_payment_sessions')
    .insert([
      {
        user_id: userData.user.id,
        invoice_id: invoice.id,
        payment_provider: 'stripe',
        payment_session_id: stripeBody.id,
        payment_link_url: stripeBody.url,
        expected_amount_minor: amountMinor,
        expected_currency: paymentCurrency,
        payment_type: payableAmount.paymentType,
        status: 'open',
      },
    ])

  if (sessionInsertError) {
    console.error('create-payment-link session insert failed', {
      invoiceId: invoice.id,
      userId: userData.user.id,
      sessionId: stripeBody.id,
      message: sessionInsertError.message,
      code: sessionInsertError.code,
    })
    return jsonResponse({ error: 'Payment link was created, but could not be saved for webhook reconciliation.' }, 500)
  }

  const { data: updatedInvoice, error: updateError } = await authClient
    .from('invoices')
    .update({
      payment_provider: 'stripe',
      payment_link_url: stripeBody.url,
      payment_session_id: stripeBody.id,
      payment_session_amount_minor: amountMinor,
      payment_session_currency: paymentCurrency,
      payment_session_payment_type: payableAmount.paymentType,
      payment_status: invoice.amount_paid > 0 ? 'partially_paid' : 'unpaid',
    })
    .eq('id', invoice.id)
    .eq('user_id', userData.user.id)
    .select('id, payment_provider, payment_link_url, payment_session_id, payment_status')
    .single()

  if (updateError) {
    console.error('create-payment-link invoice update failed', {
      invoiceId: invoice.id,
      userId: userData.user.id,
      message: updateError.message,
      code: updateError.code,
    })
    return jsonResponse({ error: 'Payment link was created, but could not be saved to the invoice.' }, 500)
  }

  return jsonResponse({
    message: 'Payment link created successfully.',
    invoice: updatedInvoice,
    paymentLinkUrl: updatedInvoice.payment_link_url,
  })
})
