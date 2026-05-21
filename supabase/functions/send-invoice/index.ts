import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const formatCurrency = (value: number | string | null | undefined) => {
  return `GBP ${Number(value || 0).toFixed(2)}`
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
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!resendApiKey || !fromEmail || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(
      { error: 'Invoice email service is not configured.' },
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
    return jsonResponse({ error: 'Authentication is required.' }, 401)
  }

  // Service-role access is intentionally narrow: after caller authentication,
  // it only reads the requested invoice/items and conditionally marks it sent.
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      status,
      subtotal,
      tax,
      total,
      due_date,
      notes,
      clients (
        name,
        email
      )
    `)
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    console.error('send-invoice invoice lookup failed')
    return jsonResponse({ error: 'Could not load invoice.' }, 404)
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

  const { data: items, error: itemsError } = await supabase
    .from('invoice_items')
    .select('description, quantity, unit_price, line_total')
    .eq('invoice_id', invoiceId)

  if (itemsError) {
    console.error('send-invoice item lookup failed')
    return jsonResponse({ error: 'Could not load invoice items.' }, 500)
  }

  const invoiceLabel = getInvoiceLabel(invoice)
  const itemLines = (items || [])
    .map((item) => {
      return `${item.description || 'Invoice item'} - ${item.quantity || 0} x ${formatCurrency(
        item.unit_price
      )} = ${formatCurrency(item.line_total)}`
    })
    .join('\n')

  const text = [
    `Hello ${client.name || 'there'},`,
    '',
    `Please find the details for ${invoiceLabel} below.`,
    '',
    itemLines || 'Invoice items are listed on the invoice.',
    '',
    `Subtotal: ${formatCurrency(invoice.subtotal)}`,
    `Tax: ${formatCurrency(invoice.tax)}`,
    `Total: ${formatCurrency(invoice.total)}`,
    `Due date: ${formatDate(invoice.due_date)}`,
    '',
    invoice.notes ? `Notes: ${invoice.notes}` : null,
    invoice.notes ? '' : null,
    'Thank you.',
  ]
    .filter((line) => line !== null)
    .join('\n')

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [client.email.trim()],
      subject: `${invoiceLabel} from DJ CRM`,
      text,
    }),
  })

  if (!emailResponse.ok) {
    console.error('send-invoice email provider failed', {
      status: emailResponse.status,
    })
    return jsonResponse({ error: 'Could not send invoice email.' }, 502)
  }

  let updatedStatus = invoice.status

  if (invoice.status !== 'sent') {
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({ status: 'sent' })
      .eq('id', invoice.id)
      .not('status', 'in', '("paid","cancelled","sent")')
      .select('status')
      .maybeSingle()

    if (updateError) {
      console.error('send-invoice status update failed')
      return jsonResponse(
        { error: 'Invoice was emailed, but the status could not be updated.' },
        500
      )
    }

    updatedStatus = updatedInvoice?.status || invoice.status
  }

  return jsonResponse({
    message: 'Invoice email sent successfully.',
    status: updatedStatus,
    attachmentIncluded: false,
  })
})
