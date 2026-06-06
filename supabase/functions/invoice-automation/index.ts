import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getContactEmail, renderOwnerNotificationEmail, renderReceiptEmail } from '../_shared/customer-email-templates.ts'

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

const getInvoiceLabel = (invoice: { id: string; invoice_number?: string | null }) => {
  return invoice.invoice_number || `Invoice ${invoice.id.slice(0, 8)}`
}

const sendEmail = async ({
  resendApiKey,
  fromEmail,
  to,
  subject,
  text,
  html,
}: {
  resendApiKey: string
  fromEmail: string
  to: string
  subject: string
  text: string
  html?: string
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
      html,
    }),
  })

  if (!emailResponse.ok) {
    const providerText = await emailResponse.text().catch(() => '')
    throw new Error(`Email provider rejected message (${emailResponse.status}): ${providerText.slice(0, 200)}`)
  }
}

const completeNotification = async ({
  supabase,
  invoiceId,
  notificationField,
  errorMessage = null,
}: {
  supabase: any
  invoiceId: string
  notificationField: 'receipt' | 'owner'
  errorMessage?: string | null
}) => {
  const { error } = await supabase.rpc('complete_paid_invoice_notification', {
    target_invoice_id: invoiceId,
    notification_field: notificationField,
    error_message: errorMessage,
  })

  if (error) {
    console.error('invoice-automation notification completion failed', {
      invoiceId,
      notificationField,
      message: error.message,
      code: error.code,
    })
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
  appBaseUrl,
}: {
  supabase: any
  resendApiKey: string
  fromEmail: string
  appBaseUrl: string | null
}) => {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      user_id,
      invoice_number,
      total,
      amount_paid,
      balance_due,
      currency,
      payment_status,
      paid_at,
      receipt_sent_at,
      receipt_send_attempted_at,
      receipt_send_error,
      owner_notified_at,
      owner_notification_attempted_at,
      owner_notification_error,
      clients (
        name,
        email
      )
    `)
    .eq('status', 'paid')
    .eq('payment_status', 'paid')
    .or('receipt_sent_at.is.null,owner_notified_at.is.null')
    .order('paid_at', { ascending: true, nullsFirst: false })
    .limit(50)

  if (error) throw error

  let receiptCount = 0
  let ownerNotificationCount = 0

  for (const invoice of invoices || []) {
    const client = Array.isArray(invoice.clients) ? invoice.clients[0] : invoice.clients
    const invoiceLabel = getInvoiceLabel(invoice)
    const invoiceUrl = appBaseUrl
      ? `${appBaseUrl.replace(/\/+$/, '')}/invoices/${invoice.id}`
      : null

    if (!invoice.receipt_sent_at && !isValidEmail(client?.email)) {
      console.error('invoice-automation receipt skipped because client email is invalid', {
        invoiceId: invoice.id,
        hasClient: Boolean(client),
        hasClientEmail: Boolean(client?.email),
      })
    }

    if (!invoice.receipt_sent_at && isValidEmail(client?.email)) {
      const { data: claimedInvoice, error: claimError } = await supabase.rpc('claim_paid_invoice_notification', {
        target_invoice_id: invoice.id,
        notification_field: 'receipt',
      })

      if (claimError) throw claimError

      if (claimedInvoice === true) {
        try {
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
              `Paid date: ${formatDate(invoice.paid_at)}`,
              '',
              'Thank you.',
            ].join('\n'),
            html: renderReceiptEmail({
              clientName: client.name,
              invoiceNumber: invoiceLabel,
              amountPaid: formatCurrency(invoice.amount_paid, invoice.currency || 'GBP'),
              remainingBalance: Number(invoice.balance_due || 0) > 0
                ? formatCurrency(invoice.balance_due, invoice.currency || 'GBP')
                : null,
              paidDate: formatDate(invoice.paid_at),
              contactEmail: getContactEmail(fromEmail),
            }),
          })
          await completeNotification({
            supabase,
            invoiceId: invoice.id,
            notificationField: 'receipt',
          })
          receiptCount += 1
        } catch (emailError) {
          const message = emailError instanceof Error ? emailError.message : String(emailError)
          console.error('invoice-automation receipt email failed', {
            invoiceId: invoice.id,
            message,
          })
          await completeNotification({
            supabase,
            invoiceId: invoice.id,
            notificationField: 'receipt',
            errorMessage: message,
          })
        }
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
        notification_field: 'owner',
      })

      if (claimError) throw claimError

      if (claimedInvoice === true) {
        try {
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
              `Invoice total: ${formatCurrency(invoice.total, invoice.currency || 'GBP')}`,
              `Remaining balance: ${formatCurrency(invoice.balance_due, invoice.currency || 'GBP')}`,
              `Paid date: ${formatDate(invoice.paid_at)}`,
              `Client: ${client?.name || client?.email || 'Unknown client'}`,
              invoiceUrl ? `Open invoice: ${invoiceUrl}` : null,
            ].filter((line) => line !== null).join('\n'),
            html: renderOwnerNotificationEmail({
              invoiceNumber: invoiceLabel,
              clientName: client?.name || client?.email || 'Unknown client',
              amountReceived: formatCurrency(invoice.amount_paid, invoice.currency || 'GBP'),
              invoiceTotal: formatCurrency(invoice.total, invoice.currency || 'GBP'),
              remainingBalance: formatCurrency(invoice.balance_due, invoice.currency || 'GBP'),
              paidDate: formatDate(invoice.paid_at),
              invoiceUrl,
              contactEmail: getContactEmail(fromEmail),
            }),
          })
          await completeNotification({
            supabase,
            invoiceId: invoice.id,
            notificationField: 'owner',
          })
          ownerNotificationCount += 1
        } catch (emailError) {
          const message = emailError instanceof Error ? emailError.message : String(emailError)
          console.error('invoice-automation owner notification email failed', {
            invoiceId: invoice.id,
            message,
          })
          await completeNotification({
            supabase,
            invoiceId: invoice.id,
            notificationField: 'owner',
            errorMessage: message,
          })
        }
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
  const appBaseUrl = Deno.env.get('APP_BASE_URL')

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
      appBaseUrl,
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
