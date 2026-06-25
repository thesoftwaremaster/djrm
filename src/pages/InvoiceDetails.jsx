import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom'
import { Copy, Download, FileText, Link as LinkIcon, Mail, Wallet, UserRound, BriefcaseBusiness, ReceiptText } from 'lucide-react'
import { supabase } from '../supabase'
import AddPayment from '../components/AddPayment'
import PaymentList from '../components/PaymentList'
import TextInput from '../components/ui/TextInput'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DetailPanel from '../components/common/DetailPanel'
import CommunicationTemplates from '../components/CommunicationTemplates'
import RelatedTasks from '../components/RelatedTasks'
import {
  derivePaymentState,
  getPaidTotal,
  getPaymentProgress,
  syncInvoiceAndBookingStatus,
} from '../utils/statusAutomation'
import { calculateInvoiceTotals, updateInvoiceDetails } from '../workflows/updateInvoiceWorkflow'
import { deleteInvoiceWorkflow, getInvoiceDeleteDependencies } from '../workflows/deleteInvoiceWorkflow'
import { removeTrackedPaymentWorkflow } from '../workflows/removeTrackedPaymentWorkflow'
import { createPaymentScheduleWorkflow } from '../workflows/createPaymentScheduleWorkflow'
import { updateTrackedPaymentStatusWorkflow } from '../workflows/updateTrackedPaymentStatusWorkflow'
import { logActivity } from '../workflows/activityLogActions'
import { useAuth } from '../auth/useAuth'
import {
  fetchAppSettings,
  getPaymentDetailsLines,
  isMissingInvoiceCurrencyError,
} from '../utils/appSettings'
import { isValidDateInput } from '../utils/validation'

const formatMessageCurrency = (value, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(Number(value || 0))

const formatMessageDate = (value) => {
  if (!value) return 'To confirm'

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return parsedDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const getFunctionErrorMessage = async (functionError, fallbackMessage) => {
  let errorMessage = functionError?.message || fallbackMessage

  if (functionError?.context) {
    try {
      const errorBody = await functionError.context.json()
      errorMessage = errorBody?.error || errorMessage
    } catch {
      errorMessage = functionError.message || errorMessage
    }
  }

  return errorMessage
}

const InvoiceDetails = () => {
  const { isDemoMode, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { id } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [payments, setPayments] = useState([])
  const [sendLoading, setSendLoading] = useState(false)
  const [sendMessage, setSendMessage] = useState('')
  const [sendError, setSendError] = useState('')
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState(location.state?.successMessage || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteDependencies, setDeleteDependencies] = useState({
    invoiceNumber: '',
    paymentCount: 0,
    paymentTotal: 0,
    itemCount: 0,
    bookingLinkCount: 0,
    activityLogCount: 0,
  })
  const [confirmSendAgain, setConfirmSendAgain] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmRemovePaymentId, setConfirmRemovePaymentId] = useState(null)
  const [removingPaymentId, setRemovingPaymentId] = useState(null)
  const [confirmStatusPaymentId, setConfirmStatusPaymentId] = useState(null)
  const [updatingPaymentId, setUpdatingPaymentId] = useState(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [paymentLinkLoading, setPaymentLinkLoading] = useState(false)
  const [paymentLinkMessage, setPaymentLinkMessage] = useState('')
  const [paymentLinkError, setPaymentLinkError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [appSettings, setAppSettings] = useState(null)
  const [showCommunicationsPanel, setShowCommunicationsPanel] = useState(false)
  const [formValues, setFormValues] = useState({
    dueDate: '',
    notes: '',
    items: [],
  })

  const totalPaid = getPaidTotal(payments)

  const remainingBalance = Math.max(
    0,
    Number(invoice?.total || 0) - totalPaid
  )

  const paymentState = derivePaymentState({
    invoiceTotal: invoice?.total,
    totalPaid,
  })

  const paymentProgress = getPaymentProgress({
    invoiceTotal: invoice?.total,
    totalPaid,
  })

  const fetchInvoiceDetails = useCallback(async () => {
    setError('')

    const invoiceSelect = `
        id,
        invoice_number,
        status,
        subtotal,
        tax,
        total,
        currency,
        payment_provider,
        payment_link_url,
        payment_session_id,
        payment_status,
        amount_paid,
        balance_due,
        deposit_amount,
        deposit_paid_at,
        paid_at,
        invoice_sent_at,
        last_sent_at,
        due_date,
        created_at,
        notes,
        client_id,
        booking_id,
        clients (
          id,
          name,
          email,
          phone
        ),
        bookings (
          id,
          status,
          total_price
        )
      `

    const invoiceSelectWithoutCurrency = invoiceSelect
      .split('\n')
      .filter((line) => !line.trim().startsWith('currency'))
      .join('\n')

    let { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(invoiceSelect)
      .eq('id', id)
      .maybeSingle()

    if (invoiceError && isMissingInvoiceCurrencyError(invoiceError)) {
      const fallbackResponse = await supabase
        .from('invoices')
        .select(invoiceSelectWithoutCurrency)
        .eq('id', id)
        .maybeSingle()

      invoiceData = fallbackResponse.data
      invoiceError = fallbackResponse.error

      if (invoiceData) {
        invoiceData.currency = 'GBP'
        invoiceData.payment_status = invoiceData.payment_status || 'unpaid'
        invoiceData.amount_paid = invoiceData.amount_paid ?? 0
        invoiceData.balance_due = invoiceData.balance_due ?? Math.max(0, Number(invoiceData.total || 0))
      }
    }

    if (invoiceError) {
      console.error(invoiceError)
      setError('Could not load invoice.')
      return
    }

    if (!invoiceData) {
      setError('Invoice not found. It may have been deleted or you may not have access.')
      return
    }

    const { data: itemData, error: itemError } = await supabase
      .from('invoice_items')
      .select(`
        id,
        description,
        quantity,
        unit_price,
        line_total
      `)
      .eq('invoice_id', id)

    if (itemError) {
      console.error(itemError)
    } else {
      setItems(itemData || [])
    }

    const { data: paymentData, error: paymentError } = await supabase
      .from('payments')
      .select(`
        id,
        amount,
        type,
        paid,
        due_date,
        created_at
      `)
      .eq('invoice_id', id)
      .order('created_at', { ascending: false })

    const invoicePayments = paymentData || []
    const paymentsLoaded = !paymentError

    if (paymentError) {
      console.error(paymentError)
    } else {
      setPayments(invoicePayments)
    }

    let syncedInvoice = invoiceData

    if (paymentsLoaded) {
      try {
        const { invoiceStatus, bookingStatus } = await syncInvoiceAndBookingStatus({
          invoice: invoiceData,
          payments: invoicePayments,
        })

        syncedInvoice = {
          ...invoiceData,
          status: invoiceStatus || invoiceData.status,
          bookings: invoiceData.bookings
            ? {
                ...invoiceData.bookings,
                status: bookingStatus || invoiceData.bookings.status,
              }
            : invoiceData.bookings,
        }
      } catch (syncError) {
        console.error(syncError)
      }
    }

    try {
      const dependencies = await getInvoiceDeleteDependencies({ invoiceId: id })
      setDeleteDependencies(dependencies)
    } catch (dependencyError) {
      console.error(dependencyError)
    }

    setInvoice(syncedInvoice)
  }, [id])

  useEffect(() => {
    void Promise.resolve().then(() => fetchInvoiceDetails())
  }, [fetchInvoiceDetails])

  useEffect(() => {
    let isMounted = true

    const fetchInvoiceSettings = async () => {
      if (!user?.id) return

      try {
        const settings = await fetchAppSettings()

        if (!isMounted) return

        setAppSettings(settings)
      } catch (settingsError) {
        if (!isMounted) return
        console.error(settingsError)
      }
    }

    void fetchInvoiceSettings()

    return () => {
      isMounted = false
    }
  }, [user?.id])

  useEffect(() => {
    if (!location.state?.successMessage) return

    setSuccessMessage(location.state.successMessage)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  const cardClass =
    'min-w-0 rounded-2xl border border-border-soft bg-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.025)] sm:p-5'

  const statusStyles = {
    draft: 'border-slate-200 bg-slate-50 text-slate-700',
    sent: 'border-blue-200 bg-blue-50 text-blue-700',
    part_paid: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    paid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    overdue: 'border-amber-200 bg-amber-50 text-amber-700',
    cancelled: 'border-slate-200 bg-slate-50 text-text-secondary',
  }

  const statusLabels = {
    part_paid: 'Part-paid',
  }

  const clientEmail = invoice?.clients?.email?.trim()
  const sendBlockedByStatus = invoice?.status === 'paid' || invoice?.status === 'cancelled'
  const sendDisabled = sendLoading || !clientEmail || sendBlockedByStatus
  const editBlocked = invoice?.status === 'paid' || invoice?.status === 'cancelled'
  const editDisabledReason =
    invoice?.status === 'paid'
      ? 'Paid invoices cannot be edited.'
      : invoice?.status === 'cancelled'
        ? 'Cancelled invoices cannot be edited.'
        : ''

  const hasRecordedPayments = totalPaid > 0
  const invoiceAmountPaid = Number(invoice?.amount_paid ?? totalPaid)
  const invoiceBalanceDue = Math.max(0, Number(invoice?.balance_due ?? remainingBalance))
  const invoicePaymentStatus = invoice?.payment_status || (
    invoiceAmountPaid <= 0
      ? 'unpaid'
      : invoiceBalanceDue <= 0
        ? 'paid'
        : 'partially_paid'
  )
  const canCreatePaymentLink = Boolean(invoice?.id && invoiceBalanceDue > 0 && invoice.status !== 'cancelled')
  const sentAt = invoice?.last_sent_at || invoice?.invoice_sent_at || null
  const hasSentWarning = Boolean(sentAt) || invoice?.status === 'sent'
  const showDeleteSection = !isEditing
  const deleteInvoiceNumber = deleteDependencies.invoiceNumber || invoice?.invoice_number || 'Draft invoice'
  const deleteWarningItems = [
    deleteDependencies.paymentCount > 0
      ? `${deleteDependencies.paymentCount} linked payment${deleteDependencies.paymentCount === 1 ? '' : 's'}`
      : null,
    deleteDependencies.itemCount > 0
      ? `${deleteDependencies.itemCount} invoice item${deleteDependencies.itemCount === 1 ? '' : 's'}`
      : null,
    deleteDependencies.bookingLinkCount > 0 ? '1 booking link' : null,
    deleteDependencies.activityLogCount > 0
      ? `${deleteDependencies.activityLogCount} activity log${deleteDependencies.activityLogCount === 1 ? '' : 's'}`
      : null,
  ].filter(Boolean)

  const getScheduledPaymentAmount = (type) => {
    const scheduledPayment = payments.find((payment) => (
      payment.type === type && payment.paid !== true
    ))

    return scheduledPayment?.amount || remainingBalance
  }

  const invoiceTemplateData = {
    clientName: invoice?.clients?.name || 'there',
    invoiceNumber: invoice?.invoice_number || 'your invoice',
    dueDate: formatMessageDate(invoice?.due_date),
    depositAmount: formatMessageCurrency(
      getScheduledPaymentAmount('deposit'),
      invoice?.currency || appSettings?.currency
    ),
    balanceAmount: formatMessageCurrency(
      getScheduledPaymentAmount('balance') || remainingBalance,
      invoice?.currency || appSettings?.currency
    ),
    amountDue: formatMessageCurrency(remainingBalance, invoice?.currency || appSettings?.currency),
    paymentLink: appSettings?.payment_link_url || '[payment link]',
    paymentDetails: getPaymentDetailsLines(appSettings || {}).join('\n'),
    signOff: appSettings?.display_name || appSettings?.business_name || '',
  }

  const paymentInstructions = invoiceTemplateData.paymentDetails
    ? `Payment details:\n${invoiceTemplateData.paymentDetails}`
    : `Payment link: ${invoiceTemplateData.paymentLink}`
  const messageSignOff = invoiceTemplateData.signOff
    ? `Thanks,\n${invoiceTemplateData.signOff}`
    : 'Thanks.'

  const invoiceTemplates = [
    {
      id: 'deposit-reminder',
      title: 'Deposit payment reminder',
      body: `Hi ${invoiceTemplateData.clientName},

Just a quick reminder that the deposit for ${invoiceTemplateData.invoiceNumber} is due.

Amount due: ${invoiceTemplateData.depositAmount}
Due date: ${invoiceTemplateData.dueDate}
${paymentInstructions}

${messageSignOff}`,
    },
    {
      id: 'balance-reminder',
      title: 'Balance payment reminder',
      body: `Hi ${invoiceTemplateData.clientName},

Just a quick reminder that the remaining balance for ${invoiceTemplateData.invoiceNumber} is due.

Amount due: ${invoiceTemplateData.balanceAmount}
Due date: ${invoiceTemplateData.dueDate}
${paymentInstructions}

${messageSignOff}`,
    },
    {
      id: 'payment-reminder',
      title: 'Payment reminder',
      body: `Hi ${invoiceTemplateData.clientName},

Just a quick reminder that there is an outstanding payment for ${invoiceTemplateData.invoiceNumber}.

Amount due: ${invoiceTemplateData.amountDue}
Due date: ${invoiceTemplateData.dueDate}
${paymentInstructions}

${messageSignOff}`,
    },
  ]

  const syncFormValues = useCallback(() => {
    setFormValues({
      dueDate: invoice?.due_date || '',
      notes: invoice?.notes || '',
      items: items.map((item) => ({
        clientKey: item.id,
        id: item.id,
        description: item.description || '',
        quantity: String(item.quantity ?? ''),
        unit_price: String(item.unit_price ?? ''),
      })),
    })
  }, [invoice, items])

  const previewTotals = useMemo(() => {
    if (!invoice) {
      return { subtotal: 0, tax: 0, total: 0 }
    }

    if (!isEditing) {
      return {
        subtotal: Number(invoice.subtotal || 0),
        tax: Number(invoice.tax || 0),
        total: Number(invoice.total || 0),
      }
    }

    const normalizedItems = formValues.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
    }))

    return calculateInvoiceTotals({
      items: normalizedItems,
      tax: invoice.tax,
    })
  }, [formValues.items, invoice, isEditing])

  const getSendDisabledReason = () => {
    if (!clientEmail) return 'Add a client email before sending this invoice.'
    if (invoice?.status === 'paid') return 'Paid invoices do not need to be sent.'
    if (invoice?.status === 'cancelled') return 'Cancelled invoices cannot be sent.'
    return ''
  }

  const handleSendInvoice = async ({ forceResend = false } = {}) => {
    if (sendLoading) return

    setSendMessage('')
    setSendError('')
    setActionError('')
    setSuccessMessage('')

    const disabledReason = getSendDisabledReason()

    if (disabledReason) {
      setSendError(disabledReason)
      return
    }

    if (hasSentWarning && !forceResend) {
      setConfirmSendAgain(true)
      return
    }

    setSendLoading(true)
    setConfirmSendAgain(false)

    try {
      const { data, error: sendInvoiceError } = await supabase.functions.invoke('send-invoice', {
        body: { invoiceId: invoice.id, forceResend },
      })

      if (sendInvoiceError) {
        throw new Error(await getFunctionErrorMessage(sendInvoiceError, 'Could not send invoice email.'))
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setSendMessage(data?.message || 'Invoice email sent successfully with PDF attached.')
      if (invoice.booking_id) {
        await logActivity({
          entityType: 'invoice',
          entityId: invoice.id,
          bookingId: invoice.booking_id,
          clientId: invoice.client_id,
          action: 'invoice_sent',
          title: 'Invoice sent',
          description: 'Invoice email was sent to the client.',
          metadata: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
          },
        })
      }
      await fetchInvoiceDetails()
    } catch (sendInvoiceError) {
      console.error(sendInvoiceError)
      setSendError(sendInvoiceError.message || 'Could not send invoice email.')
    } finally {
      setSendLoading(false)
    }
  }

  const handleEditStart = () => {
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')
    setConfirmDelete(false)
    setConfirmSendAgain(false)

    if (editBlocked) {
      setActionError(editDisabledReason)
      return
    }

    syncFormValues()
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setActionError('')
    setSuccessMessage('')
    setConfirmDelete(false)
    syncFormValues()
    setIsEditing(false)
  }

  const handleCreatePaymentLink = async () => {
    if (paymentLinkLoading) return
    if (!invoice) return

    setPaymentLinkLoading(true)
    setPaymentLinkMessage('')
    setPaymentLinkError('')
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      if (isDemoMode) {
        throw new Error('Demo Mode cannot create real payment sessions.')
      }

      if (!canCreatePaymentLink) {
        throw new Error('This invoice does not have a payable balance.')
      }

      const { data, error: createLinkError } = await supabase.functions.invoke('create-payment-link', {
        body: { invoiceId: invoice.id },
      })

      if (createLinkError) {
        throw new Error(await getFunctionErrorMessage(createLinkError, 'Could not create payment link.'))
      }

      if (data?.error) {
        throw new Error(data.error)
      }

      setPaymentLinkMessage(data?.message || 'Payment link created successfully.')
      await fetchInvoiceDetails()
    } catch (createLinkError) {
      console.error(createLinkError)
      setPaymentLinkError(createLinkError.message || 'Could not create payment link.')
    } finally {
      setPaymentLinkLoading(false)
    }
  }

  const handleCopyPaymentLink = async () => {
    if (!invoice?.payment_link_url) return

    setPaymentLinkMessage('')
    setPaymentLinkError('')

    try {
      await navigator.clipboard.writeText(invoice.payment_link_url)
      setPaymentLinkMessage('Payment link copied.')
    } catch (copyError) {
      console.error(copyError)
      setPaymentLinkError('Could not copy payment link.')
    }
  }

  const handleDelete = async () => {
    if (deleteLoading) return
    if (!invoice) return

    setDeleteLoading(true)
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      await deleteInvoiceWorkflow({ invoiceId: invoice.id })
      navigate('/invoices', {
        state: {
          successMessage: deleteDependencies.paymentCount > 0
            ? 'Invoice and linked payments deleted successfully.'
            : 'Invoice deleted successfully.',
        },
      })
    } catch (deleteError) {
      console.error(deleteError)
      setActionError(deleteError.message || 'Could not delete invoice.')
      setConfirmDelete(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleRemoveTrackedPayment = async (paymentId) => {
    if (removingPaymentId) return
    if (!paymentId) return

    setRemovingPaymentId(paymentId)
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      await removeTrackedPaymentWorkflow({ paymentId })
      await fetchInvoiceDetails()
      setConfirmRemovePaymentId(null)
      setSuccessMessage('Payment deleted successfully.')
    } catch (removeError) {
      console.error(removeError)
      setActionError(removeError.message || 'Could not delete payment.')
    } finally {
      setRemovingPaymentId(null)
    }
  }

  const handleUpdateTrackedPaymentStatus = async (paymentId, paid) => {
    if (updatingPaymentId) return
    if (!paymentId) return

    setUpdatingPaymentId(paymentId)
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      await updateTrackedPaymentStatusWorkflow({ paymentId, paid })
      await fetchInvoiceDetails()
      setConfirmStatusPaymentId(null)
      setSuccessMessage(paid ? 'Payment marked as paid.' : 'Payment marked as unpaid.')
    } catch (statusError) {
      console.error(statusError)
      setActionError(statusError.message || 'Could not update payment status.')
    } finally {
      setUpdatingPaymentId(null)
    }
  }

  const handleCreatePaymentSchedule = async () => {
    if (scheduleLoading) return
    if (!invoice) return

    setScheduleLoading(true)
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      await createPaymentScheduleWorkflow({ invoiceId: invoice.id })
      await fetchInvoiceDetails()
      setSuccessMessage('50% deposit schedule added successfully.')
    } catch (scheduleError) {
      console.error(scheduleError)
      setActionError(scheduleError.message || 'Could not create payment schedule.')
    } finally {
      setScheduleLoading(false)
    }
  }

  const handleAddItem = () => {
    setFormValues((currentValues) => ({
      ...currentValues,
      items: [
        ...currentValues.items,
        {
          clientKey: `new-${Date.now()}`,
          id: null,
          description: '',
          quantity: '1',
          unit_price: '',
        },
      ],
    }))
  }

  const handleItemChange = (itemKey, field, value) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      items: currentValues.items.map((item) =>
        item.clientKey === itemKey
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
    }))
  }

  const handleSave = async () => {
    if (saveLoading) return
    if (!invoice) return

    if (editBlocked) {
      setActionError(editDisabledReason)
      return
    }

    const validatedItems = []

    if (!formValues.items.length) {
      setActionError('At least one invoice item is required.')
      return
    }

    if (formValues.dueDate && !isValidDateInput(formValues.dueDate)) {
      setActionError('Enter a valid invoice due date.')
      return
    }

    for (const item of formValues.items) {
      const description = item.description.trim()
      const quantity = Number(item.quantity)
      const unitPrice = Number(item.unit_price)

      if (!description) {
        setActionError('Item description is required.')
        return
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        setActionError('Item quantity must be a number greater than 0.')
        return
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        setActionError('Item unit price must be a number that is not negative.')
        return
      }

      const lineTotal = quantity * unitPrice

      if (!Number.isFinite(lineTotal)) {
        setActionError('Invoice totals could not be calculated.')
        return
      }

      validatedItems.push({
        id: item.id,
        description,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      })
    }

    const totals = calculateInvoiceTotals({
      items: validatedItems,
      tax: invoice.tax,
    })

    if (
      !Number.isFinite(totals.subtotal) ||
      !Number.isFinite(totals.tax) ||
      !Number.isFinite(totals.total)
    ) {
      setActionError('Invoice totals could not be calculated.')
      return
    }

    setSaveLoading(true)
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      await updateInvoiceDetails({
        invoiceId: invoice.id,
        dueDate: formValues.dueDate,
        notes: formValues.notes,
        currentStatus: invoice.status,
        tax: invoice.tax,
        items: validatedItems,
      })

      await fetchInvoiceDetails()
      setIsEditing(false)
      setSuccessMessage('Invoice updated successfully.')
    } catch (saveError) {
      console.error(saveError)
      setActionError(saveError.message || 'Could not update invoice.')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDownloadInvoicePdf = async () => {
    if (pdfLoading) return

    setPdfLoading(true)
    setActionError('')
    setSuccessMessage('')
    setSendMessage('')
    setSendError('')

    try {
      const { downloadInvoicePdf } = await import('../utils/invoicePdf')

      downloadInvoicePdf({
        invoice,
        items,
        payments,
        totalPaid,
        remainingBalance,
        settings: {
          ...appSettings,
          currency: invoice.currency || appSettings?.currency,
        },
      })
    } catch (pdfError) {
      console.error(pdfError)
      setActionError(pdfError.message || 'Could not generate invoice PDF.')
    } finally {
      window.setTimeout(() => {
        setPdfLoading(false)
      }, 500)
    }
  }

  const renderInvoiceItemEditor = () => (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-text-muted">Charges</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
            Invoice items
          </h2>
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          className="inline-flex h-10 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
        >
          Add item
        </button>
      </div>

      {formValues.items.length ? (
        <div className="space-y-4">
          {formValues.items.map((item, index) => {
            const quantity = Number(item.quantity || 0)
            const unitPrice = Number(item.unit_price || 0)
            const lineTotal = quantity * unitPrice
            const safeLineTotal = Number.isFinite(lineTotal) ? lineTotal : 0

            return (
              <div
                key={item.clientKey}
                className="rounded-2xl border border-border-soft bg-surface-subtle px-4 py-4"
              >
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto]">
                  <TextInput
                    label={`Description ${index + 1}`}
                    value={item.description}
                    onChange={(event) =>
                      handleItemChange(item.clientKey, 'description', event.target.value)
                    }
                    placeholder="DJ performance package"
                    required
                  />

                  <TextInput
                    label="Quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(event) =>
                      handleItemChange(item.clientKey, 'quantity', event.target.value)
                    }
                    required
                  />

                  <TextInput
                    label="Unit price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(event) =>
                      handleItemChange(item.clientKey, 'unit_price', event.target.value)
                    }
                    required
                  />

                  <div className="self-end rounded-2xl bg-surface px-4 py-3 text-left lg:text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
                      Line total
                    </p>
                    <p className="mt-1 font-semibold text-text-primary">
                      {formatMessageCurrency(safeLineTotal)}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-text-muted">
          No invoice items yet. Add an item before saving.
        </p>
      )}
    </div>
  )

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          to="/invoices"
          className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
        >
          Back to invoices
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      </div>
    )
  }

  if (!invoice) {
    return <p className="text-sm text-text-muted">Loading invoice...</p>
  }

  return (
    <div className="space-y-6">
      <Link
        to="/invoices"
        className="inline-flex text-sm font-medium text-text-secondary transition hover:text-text-primary"
      >
        Back to invoices
      </Link>

      <div className={cardClass}>
        <div className="flex flex-col items-stretch gap-5 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="min-w-0">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
              <FileText className="h-5 w-5" />
            </div>

            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <h1 className="break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                {invoice.invoice_number || 'Draft invoice'}
              </h1>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                  statusStyles[invoice.status] || 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {statusLabels[invoice.status] || invoice.status}
              </span>
            </div>

            {isEditing ? (
              <div className="max-w-3xl space-y-4">
                {(hasRecordedPayments || hasSentWarning) && (
                  <div className="space-y-3">
                    {hasRecordedPayments && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        This invoice has payments recorded. Editing totals may affect the remaining balance.
                      </div>
                    )}

                    {hasSentWarning && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                        This invoice has already been sent. Editing it may require resending the updated invoice.
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Due date optional"
                    type="date"
                    value={formValues.dueDate}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text-primary">
                    Notes optional
                  </label>
                  <textarea
                    value={formValues.notes}
                    onChange={(event) =>
                      setFormValues((currentValues) => ({
                        ...currentValues,
                        notes: event.target.value,
                      }))
                    }
                    rows={4}
                    placeholder="Add invoice notes"
                    className="w-full min-w-0 rounded-2xl border border-border-soft bg-surface px-4 py-3 text-base text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-primary/45 focus:bg-surface focus:ring-4 focus:ring-indigo-100 sm:text-sm"
                  />
                </div>

                {renderInvoiceItemEditor()}

                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saveLoading}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saveLoading ? 'Saving...' : 'Save invoice'}
                  </button>

                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saveLoading}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1 text-sm text-text-secondary">
                  {invoice.due_date && <p>Due: {invoice.due_date}</p>}
                  {invoice.notes && <p>{invoice.notes}</p>}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadInvoicePdf}
                    disabled={pdfLoading}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary shadow-[0_6px_20px_rgba(17,24,39,0.04)] transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {pdfLoading ? 'Generating...' : 'Download PDF'}
                  </button>

                  <button
                    type="button"
                    onClick={handleEditStart}
                    disabled={editBlocked}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-text-muted"
                    title={editDisabledReason}
                  >
                    Edit Invoice
                  </button>

                  <button
                    type="button"
                    onClick={handleSendInvoice}
                    disabled={sendDisabled}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-accent-primary bg-accent-primary px-4 text-sm font-medium text-white shadow-[0_6px_20px_rgba(17,24,39,0.08)] transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-text-secondary"
                    title={getSendDisabledReason()}
                  >
                    <Mail className="h-4 w-4" />
                    {sendLoading ? 'Sending...' : invoice.status === 'sent' ? 'Send Again' : 'Send Invoice'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowCommunicationsPanel(true)}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                  >
                    Communications
                  </button>
                </div>
              </>
            )}

            {successMessage && !actionError && (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </p>
            )}

            {actionError && (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {actionError}
              </p>
            )}

            {sendMessage && (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {sendMessage}
              </p>
            )}

            {(sendError || (!clientEmail && !sendLoading)) && (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {sendError || 'Add a client email before sending this invoice.'}
              </p>
            )}

            {showDeleteSection && (
              <div className="mt-6 border-t border-border-soft pt-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-left">
                    <p className="text-sm font-medium text-text-muted">Danger zone</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      Delete this invoice? This action cannot be undone.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActionError('')
                      setSuccessMessage('')
                      setSendMessage('')
                      setSendError('')
                      setConfirmDelete(true)
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-300 bg-rose-50 px-4 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    Delete invoice
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="self-start rounded-2xl border border-border-soft bg-surface-subtle px-5 py-4 text-left md:text-right">
            <p className="text-xs uppercase tracking-[0.18em] text-text-muted">
              Total
            </p>
            <p className="mt-2 text-2xl font-semibold text-text-primary">
              {formatMessageCurrency(previewTotals.total)}
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete invoice"
        message={
          deleteDependencies.paymentCount > 0
            ? `This invoice has ${deleteDependencies.paymentCount} linked payment${deleteDependencies.paymentCount === 1 ? '' : 's'} totalling ${formatMessageCurrency(deleteDependencies.paymentTotal, invoice?.currency || appSettings?.currency)}. Deleting this invoice will also remove those payment records. This action cannot be undone.`
            : 'Delete this invoice? This action cannot be undone.'
        }
        confirmLabel={deleteDependencies.paymentCount > 0 ? 'Delete Invoice & Payments' : 'Delete invoice'}
        loadingLabel="Deleting..."
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        {deleteDependencies.paymentCount > 0 && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            <p className="font-medium">Linked payments will be removed.</p>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span>Invoice</span>
                <span className="font-semibold text-rose-900">{deleteInvoiceNumber}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Payments</span>
                <span className="font-semibold text-rose-900">{deleteDependencies.paymentCount}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Payment total</span>
                <span className="font-semibold text-rose-900">
                  {formatMessageCurrency(deleteDependencies.paymentTotal, invoice?.currency || appSettings?.currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        {deleteWarningItems.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Linked records:</p>
            <p className="mt-1">{deleteWarningItems.join(', ')}.</p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmSendAgain}
        title="Send invoice again"
        message={`This invoice was already sent on ${formatMessageDate(sentAt)}. Send again?`}
        confirmLabel="Send again"
        loadingLabel="Sending..."
        loading={sendLoading}
        onConfirm={() => handleSendInvoice({ forceResend: true })}
        onCancel={() => setConfirmSendAgain(false)}
      />

      <RelatedTasks
        title="Open invoice tasks"
        invoiceId={invoice.id}
        emptyMessage="No open tasks for this invoice."
        currentPath={`/invoices/${invoice.id}`}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <UserRound className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">Client</h2>
          </div>

          {invoice.clients ? (
            <div className="space-y-2 text-sm text-text-secondary">
              <Link
                to={`/customers/${invoice.clients.id}`}
                className="text-lg font-semibold text-text-primary hover:underline"
              >
                {invoice.clients.name}
              </Link>
              {invoice.clients.email && <p className="break-all">{invoice.clients.email}</p>}
              {invoice.clients.phone && <p>{invoice.clients.phone}</p>}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">No client linked.</p>
          )}
        </div>

        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">Booking</h2>
          </div>

          {invoice.bookings ? (
            <div className="space-y-2 text-sm text-text-secondary">
              <p className="font-medium text-text-primary">
                Booking #{invoice.bookings.id.slice(0, 8)}
              </p>
              <p className="capitalize">{invoice.bookings.status}</p>
              <p>{formatMessageCurrency(invoice.bookings.total_price)}</p>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">No booking linked.</p>
          )}
        </div>

        <div className={cardClass}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-subtle text-text-secondary">
              <ReceiptText className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">Summary</h2>
          </div>

          <div className="space-y-3 text-sm text-text-secondary">
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-subtle px-4 py-3">
              <span>Subtotal</span>
              <span className="font-medium text-text-primary">
                {formatMessageCurrency(previewTotals.subtotal)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-subtle px-4 py-3">
              <span>Tax</span>
              <span className="font-medium text-text-primary">
                {formatMessageCurrency(previewTotals.tax)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3">
              <span className="font-medium text-text-primary">Total</span>
              <span className="font-semibold text-text-primary">
                {formatMessageCurrency(previewTotals.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-text-muted">Charges</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
              Invoice items
            </h2>
          </div>

          <div className="rounded-2xl bg-surface-subtle px-4 py-2 text-sm text-text-secondary">
            {items.length} items
          </div>
        </div>

        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col items-start gap-3 rounded-2xl border border-border-soft bg-surface-subtle px-4 py-4 sm:flex-row sm:justify-between sm:gap-6"
              >
                <div>
                  <p className="break-words font-medium text-text-primary">{item.description}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    Qty: {item.quantity} x {formatMessageCurrency(item.unit_price)}
                  </p>
                </div>

                <p className="font-semibold text-text-primary sm:text-right">
                  {formatMessageCurrency(item.line_total)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-text-muted">No invoice items yet.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className={cardClass}>
          <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border-soft bg-surface-subtle text-text-secondary">
                <Wallet className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-xl font-semibold text-text-primary">Payments</h2>
                <p className="text-sm text-text-muted">Track money received against this invoice</p>
              </div>
            </div>

            <div className="text-left text-sm text-text-secondary sm:text-right">
              <p className="font-medium text-text-primary">
                {formatMessageCurrency(totalPaid)} paid
              </p>
              <p className="mt-1">
                {formatMessageCurrency(remainingBalance)} remaining
              </p>

              {remainingBalance === 0 ? (
                <p className="mt-1 font-semibold text-emerald-700">Fully paid</p>
              ) : (
                <p className="mt-1 font-semibold text-amber-700">
                  Outstanding balance
                </p>
              )}
            </div>
          </div>

          <div className="mb-5 rounded-2xl bg-surface-subtle px-4 py-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-text-primary">
                {paymentState}
              </p>
              <p className="text-sm text-text-secondary">
                {paymentProgress}% paid
              </p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-[var(--border-soft)]">
              <div
                className="h-full rounded-full bg-accent-primary transition-all"
                style={{ width: `${paymentProgress}%` }}
              />
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-border-soft bg-surface px-4 py-4">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="text-left">
                <p className="text-sm font-semibold text-text-primary">
                  Online payment
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Status: {invoicePaymentStatus.replace('_', ' ')}
                </p>
              </div>

              <div className="text-left text-sm text-text-secondary sm:text-right">
                <p>
                  Paid: {formatMessageCurrency(invoiceAmountPaid, invoice.currency)}
                </p>
                <p>
                  Due: {formatMessageCurrency(invoiceBalanceDue, invoice.currency)}
                </p>
              </div>
            </div>

            {invoice.payment_link_url && (
              <a
                href={invoice.payment_link_url}
                target="_blank"
                rel="noreferrer"
                className="mb-4 block truncate rounded-2xl border border-border-soft bg-surface-subtle px-4 py-3 text-sm font-medium text-text-primary transition hover:bg-surface"
              >
                {invoice.payment_link_url}
              </a>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={handleCreatePaymentLink}
                disabled={paymentLinkLoading || !canCreatePaymentLink}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                title={isDemoMode ? 'Demo Mode cannot create real payment sessions.' : ''}
              >
                <LinkIcon className="h-4 w-4" />
                {paymentLinkLoading
                  ? 'Creating...'
                  : invoice.payment_link_url
                    ? 'Refresh payment link'
                    : 'Create payment link'}
              </button>

              {invoice.payment_link_url && (
                <button
                  type="button"
                  onClick={handleCopyPaymentLink}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle"
                >
                  <Copy className="h-4 w-4" />
                  Copy payment link
                </button>
              )}
            </div>

            {paymentLinkMessage && (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {paymentLinkMessage}
              </p>
            )}

            {paymentLinkError && (
              <p className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {paymentLinkError}
              </p>
            )}
          </div>

          <div className="mb-5 flex flex-col items-stretch gap-3 rounded-2xl border border-border-soft bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Default schedule
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Add unpaid deposit and balance placeholders for this invoice.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCreatePaymentSchedule}
              disabled={scheduleLoading}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-border-soft bg-surface px-4 text-sm font-medium text-text-primary transition hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
            >
              {scheduleLoading ? 'Saving...' : 'Add 50% deposit schedule'}
            </button>
          </div>

          <PaymentList
            payments={payments}
            confirmRemovePaymentId={confirmRemovePaymentId}
            removingPaymentId={removingPaymentId}
            confirmStatusPaymentId={confirmStatusPaymentId}
            updatingPaymentId={updatingPaymentId}
            onConfirmRemove={(paymentId) => {
              setActionError('')
              setSuccessMessage('')
              setSendMessage('')
              setSendError('')
              setConfirmStatusPaymentId(null)
              setConfirmRemovePaymentId(paymentId)
            }}
            onCancelRemove={() => setConfirmRemovePaymentId(null)}
            onRemove={handleRemoveTrackedPayment}
            onConfirmStatusChange={(paymentId) => {
              setActionError('')
              setSuccessMessage('')
              setSendMessage('')
              setSendError('')
              setConfirmRemovePaymentId(null)
              setConfirmStatusPaymentId(paymentId)
            }}
            onCancelStatusChange={() => setConfirmStatusPaymentId(null)}
            onUpdateStatus={handleUpdateTrackedPaymentStatus}
          />
        </div>

        <div className={cardClass}>
          <div className="mb-6">
            <p className="text-sm font-medium text-text-muted">New payment</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-text-primary">
              Add payment
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Record a deposit, balance payment, or other transaction against this invoice.
            </p>
          </div>

          <AddPayment
            invoiceId={invoice.id}
            bookingId={invoice.booking_id}
            remainingBalance={remainingBalance}
            onSuccess={fetchInvoiceDetails}
          />
        </div>
      </div>

      <DetailPanel
        open={showCommunicationsPanel}
        title="Communications"
        subtitle="Copy a payment reminder for this invoice."
        onClose={() => setShowCommunicationsPanel(false)}
        size="xl"
      >
        <CommunicationTemplates
          title="Payment messages"
          templates={invoiceTemplates}
        />
      </DetailPanel>
    </div>
  )
}

export default InvoiceDetails


