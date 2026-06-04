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

const isValidEmail = (value: unknown): value is string => {
  if (typeof value !== 'string') return false

  const email = value.trim()

  if (email.length > 254) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

const getInvoiceLabel = (invoice: { id: string; invoice_number?: string | null }) => {
  return invoice.invoice_number || `Invoice ${invoice.id.slice(0, 8)}`
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

const isAuthorizedAutomationRequest = (req: Request, automationSecret: string | null) => {
  if (!automationSecret) return false

  const authHeader = req.headers.get('authorization') || ''
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  const headerToken = req.headers.get('x-automation-secret') || ''

  return bearerToken === automationSecret || headerToken === automationSecret
}

const processPaidInvoiceNotifications = async ({
  supabase,
  resendApiKey,
  fromEmail,
}: {
  supabase: any
  resendApiKey: string
  fromEmail: string
}) => {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      user_id,
      invoice_number,
      total,
      amount_paid,
      currency,
      receipt_sent_at,
      owner_notified_at,
      clients (
        name,
        email
      )
    `)
    .eq('status', 'paid')
    .or('receipt_sent_at.is.null,owner_notified_at.is.null')
    .order('paid_at', { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) throw error

  let receiptCount = 0
  let ownerNotificationCount = 0

  for (const invoice of invoices || []) {
    const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
    const invoiceLabel = getInvoiceLabel(invoice)

    if (!invoice.receipt_sent_at && isValidEmail(client?.email)) {
      const { data: claimedInvoice, error: claimError } = await supabase.rpc('claim_paid_invoice_notification', {
        target_invoice_id: invoice.id,
        notification_field: 'receipt_sent_at',
      })

      if (claimError) throw claimError

      if (claimedInvoice === true) {
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
            `Amount received: ${formatCurrency(invoice.amount_paid, invoice.currency || 'GBP')}`,
            '',
            'Thank you.',
          ].join('\n'),
        })
        receiptCount += 1
      }
    }

    if (!invoice.owner_notified_at) {
      const { data: ownerData, error: ownerError } = await supabase.auth.admin.getUserById(invoice.user_id)
      const ownerEmail = ownerData?.user?.email

      if (ownerError || !isValidEmail(ownerEmail)) {
        console.error('invoice-automation owner lookup failed', {
          invoiceId: invoice.id,
          userId: invoice.user_id,
          message: ownerError?.message,
        })
        continue
      }

      const { data: claimedInvoice, error: claimError } = await supabase.rpc('claim_paid_invoice_notification', {
        target_invoice_id: invoice.id,
        notification_field: 'owner_notified_at',
      })

      if (claimError) throw claimError

      if (claimedInvoice === true) {
        await sendEmail({
          resendApiKey,
          fromEmail,
          to: ownerEmail.trim(),
          subject: 'Invoice paid',
          text: [
            'Invoice paid',
            '',
            `${invoiceLabel} has been paid.`,
            `Amount received: ${formatCurrency(invoice.amount_paid, invoice.currency || 'GBP')}`,
            `Client: ${client?.name || client?.email || 'Unknown client'}`,
          ].join('\n'),
        })
        ownerNotificationCount += 1
      }
    }
  }

  return {
    receiptCount,
    ownerNotificationCount,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const automationSecret = Deno.env.get('AUTOMATION_SECRET')

  if (!isAuthorizedAutomationRequest(req, automationSecret)) {
    return jsonResponse({ error: 'Not authorized.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail = Deno.env.get('INVOICE_FROM_EMAIL')

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    console.error('invoice-automation missing required configuration', {
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasResendApiKey: Boolean(resendApiKey),
      hasFromEmail: Boolean(fromEmail),
    })
    return jsonResponse({ error: 'Automation is not configured.' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data: overdueCount, error: overdueError } = await supabase.rpc('mark_overdue_invoices')

  if (overdueError) {
    console.error('invoice-automation overdue update failed', {
      message: overdueError.message,
      code: overdueError.code,
    })
    return jsonResponse({ error: 'Could not update overdue invoices.' }, 500)
  }

  try {
    const notificationResult = await processPaidInvoiceNotifications({
      supabase,
      resendApiKey,
      fromEmail,
    })

    return jsonResponse({
      overdueCount: overdueCount || 0,
      ...notificationResult,
    })
  } catch (notificationError) {
    console.error('invoice-automation paid notification failed', {
      message: notificationError instanceof Error ? notificationError.message : String(notificationError),
    })
    return jsonResponse({ error: 'Could not process paid invoice notifications.' }, 500)
  }
})
